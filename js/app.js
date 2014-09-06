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
    _moveTimestamp : null,
    _curPos: null,

    _moveDuration: 0,
    _waitDuration: 0,

    _length: 0,

    _elevGain: 0,
    _elevLoss: 0,

    _minElev: Infinity,
    _maxElev: -Infinity,

    _prevAlt : [-Infinity, Infinity],

    getPath: function () {
	return this._path;
    },

    getLength: function () {
	return this._length;
    },

    getMinElevation: function () {
	return (this._minElev <= this._maxElev) ? this._minElev : Infinity;
    },

    getMaxElevation: function () {
	return (this._minElev <= this._maxElev) ? this._maxElev : -Infinity;
    },

    getElevationGain: function () {
	return this._elevGain;
    },

    getElevationLoss: function () {
	return this._elevLoss;
    },

    getPosition: function () {
	return this._curPos;
    },

    getTotalDuration: function () {
	return this._moveDuration + this._waitDuration;
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
	this._moveTimestamp = null;
	this._curPos = null;
	this._moveDuration = 0;
	this._waitDuration = 0;
	this._length = 0;
	this._elevGain = 0;
	this._elevLoss = 0;
	this._minElev = Infinity;
	this._maxElev = -Infinity;
	this._prevAlt = [-Infinity, Infinity];
    },

    start: function () {
	this._curTimestamp = null;
	this._moveTimestamp = null;
	this._prevAlt = [-Infinity, Infinity];
    },

    onPosition: function (isStationary, ts, coords) {
	this._curPos = new L.LatLng(coords.latitude, coords.longitude,
				    coords.altitude);
	if (! isStationary)
	{
	    var prevPos = (this._path.length > 0) ?
		this._path[this._path.length - 1][1] : null;
	    this._path.push([ts, this._curPos]);

	    var altAccuracy = Math.max((coords.altitudeAccuracy !== null)
				       ? coords.altitudeAccuracy
				       : 0
				       , 4);
	    var minAlt = (coords.altitude !== null)
		? (coords.altitude - altAccuracy) : -Infinity;
	    var maxAlt = (coords.altitude !== null)
		? (coords.altitude + altAccuracy) : +Infinity;
	    var curAlt = [minAlt, maxAlt];

	    this._minElev = Math.min(this._minElev,
				     (coords.altitude !== null)
				     ? coords.altitude : Infinity);
	    this._maxElev = Math.max(this._maxElev,
				     (coords.altitude !== null)
				     ? coords.altitude : -Infinity);

	    if (this._curTimestamp !== null) {
		if (prevPos !== null) {
		    this._length += prevPos.distanceTo(this._curPos);
		}

		if ((this._moveTimestamp !== null) &&
		    (ts - this._moveTimestamp < 2.5)) {
		    // we had a very short wait - count it as moving instead
		    this._moveDuration += ts - this._moveTimestamp;
		    this._waitDuration -= this._curTimestamp - this._moveTimestamp;
		} else {
		    this._moveDuration += ts - this._curTimestamp;
		}

		curAlt[0] = Math.min(maxAlt, Math.max(this._prevAlt[0], minAlt));
		curAlt[1] = Math.max(minAlt, Math.min(this._prevAlt[1], maxAlt));

		if (curAlt[0] > this._prevAlt[1]) {
		    this._elevGain += curAlt[0] - this._prevAlt[1];
		}
		if (curAlt[1] < this._prevAlt[0]) {
		    this._elevLoss -= curAlt[1] - this._prevAlt[0];
		}
	    }

	    this._prevAlt = curAlt;
	    this._moveTimestamp = ts;
	} else {
	    if (this._curTimestamp !== null) {
		this._waitDuration += ts - this._curTimestamp;
	    }
	}

	var result = this._curTimestamp === null;
	this._curTimestamp = ts;
	return result;
    }
};


var mapInfo = [
    { name : 'OpenStreetMap',
      baseUrl : 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains : 'abc',
      attribution : 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>' },
    { name : 'Thunderforest Outdoors',
      baseUrl : 'http://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png',
      subdomains : 'abc',
      attribution : 'Map &copy; <a href="http://www.thunderforest.com">Thunderforest</a>, Data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>' },
    { name : 'MapQuest',
      baseUrl : 'http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png',
      subdomains : '1234',
      attribution : 'Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">' },
    { name : 'OVI Terrain',
      baseUrl : 'http://maptile.maps.svc.ovi.com/maptiler/maptile/newest/terrain.day/{z}/{x}/{y}/256/png8',
      subdomains : '1',
      attribution : 'Map data and imagery &copy; <a href="http://maps.ovi.com/">OVI</a>' },
    { name : 'Google Terrain',
      baseUrl : 'http://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
      subdomains : '1',
      attribution : 'Map data and imagery &copy; <a href="http://maps.google.com/">Google</a>' },
    { name : 'Google Hybrid',
      baseUrl : 'http://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      subdomains : '1',
      attribution : 'Map data and imagery &copy; <a href="http://maps.google.com/">Google</a>' }
];

var mainDB;
var map;
var metricUnits = (window.localStorage.getItem('metric') || 'true') == 'true';
var offline = (window.localStorage.getItem('offline') || 'false') == 'true';
var activeLayer = (window.localStorage.getItem('active-layer') || '0');
var mapLayer = null;

var positionIcon = new L.Icon.Default();
var directionIcon = new ArrowIcon();
var positionMarker = null;
var positionCircle = null;

var trackControl = null;
var trackPolyline = null;
var trackingHandler = null;


function formatDistance (l, def) {
    if (l == 0) {
	return def;
    } else if (metricUnits) {
	if (l < 1000) {
	    return l.toFixed(0) + ' m';
	} else {
	    return (l / 1000).toFixed(1) + ' km';
	}
    } else {
	var yards = l / 0.9144;
	if (yards < 440) {
	    return yards.toFixed(0) + ' yd';
	} else {
	    return (yards / 1760).toFixed(yards < 1760 ? 2 : 1) + ' m';
	}
    }
}

function formatDuration (d, def) {
    if (d == 0) {
	return def;
    } else {
	var seconds = (Math.floor(d / 1000) % 60).toFixed(0);
	var minutes = (Math.floor(d / 60000) % 60).toFixed(0);
	var hours = Math.floor(d / 3600000).toFixed(0);

	if (hours == '0') {
	    if (minutes == '0') {
		return seconds + 's';
	    } else {
		return minutes + 'm' + (seconds.length < 2 ? '0' : '') + seconds + 's';
	    }
	} else {
	    return hours + 'h' + (minutes.length < 2 ? '0' : '') + minutes +
		'm' + (seconds.length < 2 ? '0' : '') + seconds + 's';
	}
    }
}

function formatSpeed (s, def) {
    if (isNaN(s)) {
	return def;
    } else if (metricUnits) {
	return (s * 3600).toFixed(1) + ' km/h';
    } else {
	return (s * 3600 / 0.9144 / 1.76).toFixed(1) + ' m/h';
    }
}

function formatElevation (h, def) {
    if (h == 0) {
	return def;
    } else if (metricUnits) {
	return h.toFixed(0) + ' m';
    } else {
	return (h / 0.9144 * 3).toFixed(0) + ' ft';
    }
}

function createMapLayer (cacheDB, info) {
    var cacheLayer = new L.TileLayer.Functional(function (view) {
	var url = info.baseUrl
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
		if (arg !== undefined) {
		    var imgURL = window.URL.createObjectURL(arg);
		    this._fn(imgURL);
		    window.URL.revokeObjectURL(imgURL);
		} else {
		    this._fn(null);
		}
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
    }, { attribution: info.attribution, maxZoom: 18,
	 subdomains: info.subdomains });
    return cacheLayer;
}

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

function ClearTrack()
{
    if (trackControl !== null) {
	document.getElementById('track-length-display').textContent = '';
	map.removeLayer(trackControl);
	trackControl = null;
    }
}

function NewTrackFile(f)
{
    ClearTrack();

    if (f) {
	reader = new FileReader();
	reader.onload = function(e) {
	    trackControl = new L.GPX(e.target.result,
				     { async: true,
				       polyline_options: { color: '#203090',
							   opacity: 0.7 } }).on(
							       'loaded', function(e) {
								   map.fitBounds(e.target.getBounds());
							       }).addTo(map);
	};

	reader.readAsText(f);
    }
}

function PositionUpdated(e)
{
    var isStationary = (e.coords.speed === 0) ||
	((e.coords.heading !== null) && isNaN(e.coords.heading));
    var isNewSeg = pathTracker.onPosition(isStationary, e.timestamp, e.coords);

    if (! isStationary) {
	trackPolyline.addLatLng(pathTracker.getPosition());
	map.panTo(pathTracker.getPosition());

	var len = pathTracker.getLength();
	document.getElementById('path-length-display').textContent = formatDistance(pathTracker.getLength(), '');

	directionIcon.setDirection(e.coords.heading);
    } else if (isNewSeg) {
	map.panTo(pathTracker.getPosition());
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
	document.getElementById('share').classList.remove('invisible');

	navigator.geolocation.clearWatch(trackingHandler);
	trackingHandler = null;
    } else {
	document.getElementById('locate').classList.add('invisible');
	document.getElementById('locateplaypause').classList.add('pause-btn');
	document.getElementById('locateplaypause').classList.remove('play-btn');
	document.getElementById('share').classList.add('invisible');

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

    document.getElementById('share').classList.add('invisible');

    pathTracker.reset();
    document.getElementById('path-length-display').textContent = '';
    map.removeLayer(trackPolyline);
    trackPolyline = L.polyline([], { color: '#209030', opacity: 0.7 }).addTo(map);
}

function OpenSettings()
{
    document.getElementById('settings-offline').checked = offline;
    document.getElementById('settings-units').checked = metricUnits;

    delete document.getElementById('settings-view').dataset.viewport;
}

function EndSettings()
{
    document.getElementById('settings-view').dataset.viewport = 'bottom';

    offline = document.getElementById('settings-offline').checked;
    window.localStorage.setItem('offline', offline.toString());

    metricUnits = document.getElementById('settings-units').checked;
    window.localStorage.setItem('metric', metricUnits.toString());

    if ((trackControl !== null) && (trackControl.get_distance() > 0)) {
	document.getElementById('track-length-display').textContent = '(' + formatDistance(trackControl.get_distance(), '') + ')';
    }
    document.getElementById('path-length-display').textContent = formatDistance(pathTracker.getLength(), '');
}

function UpdateStatistics()
{
    document.getElementById('stats-distance').textContent =
	formatDistance(pathTracker.getLength(), '-');
    document.getElementById('stats-total-time').textContent =
	formatDuration(pathTracker.getTotalDuration(), '-');
    document.getElementById('stats-moving-time').textContent =
	formatDuration(pathTracker.getMoveDuration(), '-');
    document.getElementById('stats-moving-speed').textContent =
	formatSpeed(pathTracker.getLength() / pathTracker.getMoveDuration(),
		    '-');
    document.getElementById('stats-min-elevation').textContent =
	(pathTracker.getMinElevation() === Infinity) ? '-' :
	formatElevation(pathTracker.getMinElevation(), '-');
    document.getElementById('stats-max-elevation').textContent =
	(pathTracker.getMaxElevation() === -Infinity) ? '-' :
	formatElevation(pathTracker.getMaxElevation(), '-');
    document.getElementById('stats-elevation-gain').textContent =
	formatElevation(pathTracker.getElevationGain(), '-');
    document.getElementById('stats-elevation-loss').textContent =
	formatElevation(pathTracker.getElevationLoss(), '-');
}

function OpenCloseStats()
{
    var mainView = document.getElementById('main-view');
    if (mainView.dataset.viewport !== undefined) {
	delete mainView.dataset.viewport;
    } else {
	UpdateStatistics();
	mainView.dataset.viewport = 'side';
    }
}

function createGpx()
{
    var dateString = new Date().toISOString();

    var data = [];
    data.push('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
	      '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="HikingMaps">\n');
    data.push('<metadata><link href="http://hikingmaps.cmeerw.org">' +
	      '<text>HikingMaps</text></link>' +
	      '<time>' + dateString + '</time></metadata>\n');
    data.push('<trk><trkseg>\n');

    var path = pathTracker.getPath();
    for (var idx in path) {
	var ts = path[idx][0];
	var coord = path[idx][1];
	data.push('<trkpt lat="' + coord.lat + '" lon="' + coord.lng + '">' +
		  ((coord.alt !== null) ? ('<ele>' + coord.alt + '</ele>') : '') +
		  '<time>' + new Date(ts).toISOString() + '</time>' +
		 '</trkpt>\n');
    }

    data.push('</trkseg></trk></gpx>\n');
    return new Blob(data, { 'type' : 'application/gpx+xml' });
}

function shareGpx(blob)
{
    new MozActivity({ name: 'share',
		      data: {
			  type: 'application/gpx+xml',
			  number: 1,
			  blobs: [blob],
			  filepaths: [null]
		      } });
}

function ShareTrack()
{
    shareGpx(createGpx());
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

	clear: function () {
            var transaction = this._db.transaction(['tilecache', 'tilemeta'],
						   'readwrite');
            transaction.objectStore('tilemeta').clear();
            transaction.objectStore('tilecache').clear();
	},

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

    L.control.scale().addTo(map);

    trackPolyline = L.polyline([], { color: '#209030', opacity: 0.7 }).addTo(map);
    document.getElementById('locate').addEventListener('click', ManualPositionUpdate, false);
    document.getElementById('locateplaypause').addEventListener('click', PositionUpdatePlayPause, false);
    document.getElementById('waydelete').addEventListener('click', WayDelete, false);
    document.getElementById('share').addEventListener('click', ShareTrack, false);
    document.getElementById('menubutton').addEventListener('click', OpenSettings, false);
    document.getElementById('settingsokbutton').addEventListener('click', EndSettings, false);
    document.getElementById('statsbutton').addEventListener('click', OpenCloseStats, false);
    document.getElementById('clear-cache').addEventListener('click', function () {
	cacheDB.clear();
    }, false);

    var trackFilePick = document.getElementById('trackfilepick');
    trackFilePick.addEventListener('click', function (e) {
	var a = new MozActivity({ name: 'pick',
				  data: { type: 'application/gpx+xml',
					  multiple: false }});
	a.onsuccess = function() {
	    var name = a.result.blob.name.split('/').pop().replace('.gpx', '');
	    document.getElementById('trackfilename').setAttribute('value', name);
	    NewTrackFile(a.result.blob);
	};
	a.onerror = function() { console.log('Failure when trying to pick an file'); };
    }, false);

    var trackFileClear = document.getElementById('trackfileclear');
    trackFileClear.addEventListener('click', function (e) {
	document.getElementById('trackfilename').setAttribute('value', '');
	ClearTrack();
    }, false);

    var trackFileInput = document.getElementById('trackfile');
    trackFileInput.addEventListener('change', function (e) {
	NewTrackFile(e.target.files[0]);
    }, false);

    document.getElementById((window.MozActivity !== undefined) ? 'trackfilepickitem' : 'trackfileitem').classList.remove('invisible');

    var mapLayerSelect = document.getElementById('maplayerselect');
    for (var mapIdx in mapInfo) {
	mapLayerSelect.options[mapLayerSelect.options.length] = new Option(mapInfo[mapIdx].name, mapIdx);
    }

    if (activeLayer < mapLayerSelect.options.length) {
	mapLayerSelect.options[activeLayer].selected = 'true';
    } else {
	activeLayer = 0;
    }

    mapLayer = createMapLayer (cacheDB, mapInfo[activeLayer]);
    mapLayer.addTo(map);

    document.getElementById('maplayerselect').addEventListener('change', function (e) {
	activeLayer = mapLayerSelect.value;
	window.localStorage.setItem('active-layer', activeLayer.toString());

	map.removeLayer(mapLayer);
	mapLayer = createMapLayer (cacheDB, mapInfo[activeLayer]);
	mapLayer.addTo(map);
    });
}

InitializeDatabase(function (db) {
    InitializeApplication();
});
