var ArrowIcon = L.Icon.extend({
    options: {
	iconSize: [16, 16], // also can be set through CSS
	/*
	  iconAnchor: (Point)
	  popupAnchor: (Point)
	  html: (String)
	  bgPos: (Point)
	*/
	direction: 0,
	className: null,
	html: false
    },

    createIcon: function (oldIcon) {
	var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div'),
	options = this.options;

	div.innerHTML = '<div class="arrow-icon" style="transform: rotate(' + options.direction + 'deg)" />';
	this._setIconStyles(div, 'icon');

	return div;
    },

    setDirection: function (dir) {
	this.options.direction = dir;
    },

    createShadow: function () {
	return null;
    }
});

var pathTracker = {
    _path: [],

    _curTimestamp: null,
    _curPos: null,

    _moveDuration: 0,
    _waitDuration: 0,

    _altGain: 0,
    _altLoss: 0,
    _length: 0,

    getLength: function () {
	return this._length;
    },

    getAltGain: function () {
	return this._altGain;
    },

    getAltLoss: function () {
	return this._altLoss;
    },

    getPosition: function () {
	return this._curPos;
    },

    getMoveDuration: function () {
	return this._moveDuration;
    },

    getWaitDuration: function () {
	return this._waitDuration;
    },

    reset: function () {
	this._path = [];
	this._curTimestamp = null;
	this._curPos = null;
	this._moveDuration = 0;
	this._waitDuration = 0;
	this._altGain = 0;
	this._altLoss = 0;
	this._length = 0;
    },

    start: function () {
	this._curTimestamp = null;
    },

    onPosition: function (ts, coords) {
	this._curPos = new L.LatLng(coords.latitude, coords.longitude, coords.altitude);
	if ((coords.speed !== 0) && (coords.heading !== null) && !isNaN(coords.heading))
	{
	    if (this._path.length > 0) {
		var prevEntry = this._path[this._path.length - 1];
		var prevPos = prevEntry[1];

		this._length += prevPos.distanceTo(this._curPos);

		if (this._curPos.alt !== null) {
		    var altDiff = this._curPos.alt - prevPos.alt;
		    if (altDiff >= 0) {
			this._altGain += altDiff;
		    } else {
			this._altLoss -= altDiff;
		    }
		}
	    }

	    this._path.push([ts, this._curPos]);
	    if (this._curTimestamp !== null) {
		this._moveDuration += ts - this._curTimestamp;
	    }
	} else {
	    if (this._curTimestamp !== null) {
		this._waitDuration += ts - this._curTimestamp;
	    }
	}

	this._curTimestamp = ts;
    }
};


var mainDB;
var map;
var tracks;
var localizationchecktimer;
var firefoxOS=/Mobile;.*Firefox\/(\d+)/.exec(navigator.userAgent);
var mozL10n=navigator.mozL10n;
var offline=false;

var positionIcon = new L.Icon.Default();
var directionIcon = new ArrowIcon();
var positionMarker = null;
var positionCircle = null;

var trackControl = null;
var trackPolyline = null;
var trackingHandler = null;

document.getElementById('body').onload = WaitForLocalizationToLoad;


function InitializeDatabase(cb)
{
    var request = window.indexedDB.open('HikingMaps', 1);
    request.onerror = function(event)
    {
	cb(null);
    };
    request.onsuccess = function(event)
    {
	mainDB = request.result;
	cb(mainDB);
    };
    request.onupgradeneeded = function(event)
    {
	mainDB = request.result;
	var ver = mainDB.version || 0; // version is empty string for a new DB
	if (!mainDB.objectStoreNames.contains('tilecache'))
	{
	    var tilecacheStore = mainDB.createObjectStore('tilecache');
	}
	if (!mainDB.objectStoreNames.contains('tilemeta'))
	{
	    var tilemetaStore = mainDB.createObjectStore('tilemeta');
	}
	mainDB.onversionchange = function(event)
	{
	    mainDB.close();
	    mainDB = undefined;
	    InitializeDatabase();
	};
    };
}

function UpdateTrackFiles()
{
    var storage = navigator.getDeviceStorage('sdcard');
    if (storage) {
	var trackscursor = storage.enumerate('tracks');
	tracks = [];
	trackscursor.onerror = function() {
	    console.error('Error in Device Storage API',
			  trackscursor.error.name);
	};
	trackscursor.onsuccess = function() {
	    if (!trackscursor.result) {
		for (trackindex in tracks) {
		    document.getElementById('trackfileselect').options[document.getElementById('trackfileselect').options.length] = new Option(tracks[trackindex].name.split('/').pop(), trackindex);
		}
	    } else {
	    	var file=trackscursor.result;
		if (file.name.split('.').pop() == 'gpx') {
		    tracks.push(file);
		}
		trackscursor.continue();
	    }
	};
    }
    return false;
}

function ClearTrack()
{
    if (trackControl !== null) {
	map.removeLayer(trackControl);
	trackControl = null;
    }
}

function NewTrackFile(f)
{
    ClearTrack();

    reader = new FileReader();
    reader.onload = function(e) {
	trackControl = new L.GPX(e.target.result, {async: true}).on(
	    'loaded', function(e) {
		map.fitBounds(e.target.getBounds());
	    }).addTo(map);
    };
    reader.readAsText(f);
}

function PositionUpdated(e)
{
    pathTracker.onPosition(e.timestamp, e.coords);

    trackPolyline.addLatLng(pathTracker.getPosition());
    map.panTo(pathTracker.getPosition());

    var len = pathTracker.getLength();
    if (len > 0) {
        document.getElementById('path-length-display').textContent = len.toFixed(0);
    }

    if ((e.coords.speed !== 0) && (e.coords.heading !== null) && !isNaN(e.coords.heading)) {
	directionIcon.setDirection(e.coords.heading);
    }

    positionMarker.setIcon(directionIcon);
    positionMarker.setLatLng(pathTracker.getPosition());
    positionMarker.addTo(map);
}

function ManualPositionUpdate()
{
    document.getElementById('locate').dataset.state = 'refreshing';
    map.locate({setView: true, maxZoom: 16,
		timeout: 60000, maximumAge: 0, enableHighAccuracy: true});
}

function PositionUpdatePlayPause()
{
    if (document.getElementById('locateplaypause').classList.contains('pause-btn')) {
	document.getElementById('locate').classList.remove('invisible');
	document.getElementById('locateplaypause').classList.remove('pause-btn');
	document.getElementById('locateplaypause').classList.add('play-btn');

	navigator.geolocation.clearWatch(trackingHandler);
	trackingHandler = null;
    } else {
	document.getElementById('locate').classList.add('invisible');
	document.getElementById('locateplaypause').classList.add('pause-btn');
	document.getElementById('locateplaypause').classList.remove('play-btn');

	map.removeLayer(positionCircle);
	pathTracker.start();
	trackingHandler = navigator.geolocation.watchPosition(
            function(position) { PositionUpdated(position); },
            function(err) { },
            {
		enableHighAccuracy: true,
		timeout: 60000,
		maximumAge: 0
            });
    }
}

function WayDelete()
{
    map.removeLayer(positionMarker);
    map.removeLayer(positionCircle);

    pathTracker.reset();
    document.getElementById('path-length-display').textContent='';
    map.removeLayer(trackPolyline);
    trackPolyline = L.polyline([], {opacity: 0.9}).addTo(map);
}

function OpenSettings()
{
    var container = document.getElementById('container');
    setTimeout(function() {
	container.classList.add('opensettings');
    }, 300);
}

function EndSettings()
{
    var container = document.getElementById('container');
    setTimeout(function() {
	container.classList.add('closesettings');
	setTimeout(function() {
	    container.classList.remove('opensettings')
	    container.classList.remove('closesettings');
	}, 500);
    }, 300);

    offline = document.getElementById('settings-offline').checked;
}

function WaitForLocalizationToLoad()
{
    localizationchecktimer=setInterval(CheckLocalizationLoaded,100);
}

function CheckLocalizationLoaded()
{
    if (mozL10n.get('hiking-maps-title') != '') {
	clearInterval(localizationchecktimer);

	InitializeDatabase(function (db)
			   {
			       InitializeApplication();
			   });
    }
}

function InitializeApplication()
{
    map = L.map('map').setView([51.505, -0.09], 13);
    positionMarker = L.marker([51.505, -0.09], { icon : positionIcon });
    positionCircle = L.circle([51.505, -0.09], 0);

    map.on('locationfound', function(e) {
	document.getElementById('locate').dataset.state = '';
	positionMarker.setIcon(positionIcon);
	positionMarker.setLatLng(e.latlng);
	positionCircle.setLatLng(e.latlng);
	positionCircle.setRadius(e.accuracy / 2);

	positionMarker.addTo(map);
	positionCircle.addTo(map);
    });

    map.on('locationerror', function(e) {
	document.getElementById('locate').dataset.state = '';
    });

    var cacheDB = {
	_db: mainDB,

	put: function (key, value, etag) {
            var transaction = this._db.transaction(['tilecache', 'tilemeta'],
						   'readwrite');
            var tileRequest = transaction.objectStore('tilecache').put(value, key);
	    if (etag) {
		var metaRequest = transaction.objectStore('tilemeta').put(etag, key);
	    }
	},

	get: function (key, fn) {
	    var objStore = 'tilecache';
            var transaction = this._db.transaction([objStore]);
            var request = transaction.objectStore(objStore).get(key);
            request.onsuccess = function (e) {
                var blob = e.target.result;
		fn(blob);
            };
            request.onerror = function (e) { };
	},

	getETag: function (key, fn) {
            var transaction = this._db.transaction(['tilemeta']);
            var request = transaction.objectStore('tilemeta').get(key);
            request.onsuccess = function (e) {
                var etag = e.target.result;
		fn(etag);
            };
            request.onerror = function (e) {
		fn(null);
	    };
	},
    };

    var cacheLayer = new L.TileLayer.Functional(function (view) {
	var url = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            .replace('{z}', view.zoom)
            .replace('{x}', view.tile.column)
            .replace('{y}', view.tile.row)
            .replace('{s}', view.subdomain);

	var deferred = {
	    _fn: null,

	    then: function (fn) {
		this._fn = fn;
	    },

	    resolve: function (arg) {
		var imgURL = window.URL.createObjectURL(arg);
		this._fn(imgURL);
		window.URL.revokeObjectURL(imgURL);
	    }
	};

	if (offline) {
	    cacheDB.get(url, function (arg) {
		deferred.resolve(arg);
	    });
	} else {
	    cacheDB.getETag(url, function (arg) {
		var xhr = new XMLHttpRequest({mozAnon: true, mozSystem: true});
		xhr.open('GET', url, true);
		if (arg) {
		    xhr.setRequestHeader('If-None-Match', arg);
		}
		xhr.responseType = 'blob';
		xhr.addEventListener('load', function () {
		    if (xhr.status === 200) {
			var blob = xhr.response;
			cacheDB.put(url, blob, xhr.getResponseHeader('ETag'));
			deferred.resolve(blob);
		    } else {
			cacheDB.get(url, function (arg) {
			    deferred.resolve(arg);
			});
		    }
		}, false);
		xhr.send();
	    });
	}

	return deferred;
    }, {
	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
	maxZoom: 18,
	subdomains: 'abc'
    });
    cacheLayer.addTo(map);

    L.control.scale().addTo(map);

    trackPolyline = L.polyline([], {opacity: 0.9}).addTo(map);

    document.getElementById('locate').addEventListener('click', ManualPositionUpdate, false);
    document.getElementById('locateplaypause').addEventListener('click', PositionUpdatePlayPause, false);
    document.getElementById('waydelete').addEventListener('click', WayDelete, false);
    document.getElementById('menubutton').addEventListener('click', OpenSettings, false);
    document.getElementById('settingsokbutton').addEventListener('click', EndSettings, false);

    if (firefoxOS) {
	UpdateTrackFiles();
	document.getElementById('trackfileselect')
	    .addEventListener('change', function (e) {
		var idx = document.getElementById('trackfileselect').value;
		if (idx == -1) {
		    ClearTrack();
		} else {
		    NewTrackFile(tracks[idx]);
		}
	    }, false);
	document.getElementById('trackfileitem').parentNode.removeChild(document.getElementById('trackfileitem'));
    } else {
	document.getElementById('trackfile')
	    .addEventListener('change', function (e) {
		NewTrackFile(e.target.files[0]);
	    }, false);
	document.getElementById('trackfileselectitem').parentNode.removeChild(document.getElementById('trackfileselectitem'));
    }
}
