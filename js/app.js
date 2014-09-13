var ArrowIcon = L.Icon.extend({
    options: {
	iconSize: [16, 16],
	direction: 0,
	className: null,
	html: false
    },

    createIcon: function (oldIcon) {
	var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div');
	div.innerHTML = '<div class="arrow-icon" style="transform: rotate(' +
	    this.options.direction + 'deg)" />';
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

var FunctionalTileLayer = L.TileLayer.extend({
    initialize: function (url, tileFn, options) {
	this._tileFn = tileFn;
	L.TileLayer.prototype.initialize.call(this, url, options);
    },

    createTile: function (coords, done) {
	var tile = document.createElement('img');

	if (this.options.crossOrigin) {
	    tile.crossOrigin = '';
	}
	tile.alt = '';

	var result = this._tileFn(coords);
	if (typeof result === 'string') {
	    tile.onload = L.bind(this._tileOnLoad, this, done, tile);
	    tile.onerror = L.bind(this._tileOnError, this, done, tile);
	    tile.src = result;
	} else if (typeof result.then === 'function') {
	    // Assume we are dealing with a promise.
	    var self = this;
	    result.then(function (url, doneFn) {
		tile.onload = function () {
		    if (doneFn) {
			doneFn(null, tile);
		    }
		    self._tileOnLoad(done, tile);
		};
		tile.onerror = function (e) {
		    if (doneFn) {
			doneFn(e, tile);
		    }
		    self._tileOnError(done, tile, e);
		};
		if (url) {
		    tile.src = url;
		} else {
		    self._tileOnLoad(done, tile);
		}
	    });
	}

	return tile;
    }
});

var CachedTileLayer = FunctionalTileLayer.extend({
    initialize: function (url, db, options) {
	this._db = db;
	this._offline = false;
	FunctionalTileLayer.prototype.initialize.call(this, url, this._getTileAsync, options);
    },

    setOffline: function (val) {
	this._offline = val;
    },

    _getTileAsync : function (coords) {
	var url = this.getTileUrl(coords);

	var deferred = {
	    _fn: null,

	    then: function (fn) {
		this._fn = fn;
	    },

	    resolve: function (arg) {
		if (arg !== undefined) {
		    var imgURL = window.URL.createObjectURL(arg);
		    this._fn(imgURL, function (err, tile) {
			window.URL.revokeObjectURL(imgURL);
		    });
		} else {
		    this._fn(null, null);
		}
	    }
	};

	if (this._offline) {
	    this._db.get(url, function (arg) {
		deferred.resolve(arg);
	    });
	} else {
	    var self = this;
	    this._db.getETag(url, function (arg) {
		var xhr = new XMLHttpRequest({mozAnon: true, mozSystem: true});
		xhr.open('GET', url, true);
		if (arg) {
		    xhr.setRequestHeader('If-None-Match', arg);
		}
		xhr.responseType = 'blob';
		xhr.addEventListener('load', function () {
		    if (xhr.status === 200) {
			var blob = xhr.response;
			self._db.put(url, blob, xhr.getResponseHeader('ETag'));
			deferred.resolve(blob);
		    } else {
			self._db.get(url, function (arg) {
			    deferred.resolve(arg);
			});
		    }
		}, false);
		xhr.send();
	    });
	}

	return deferred;
    }
});


var PathTracker = L.Class.extend ({
    initialize: function () {
	this._curTimestamp = null;
	this._moveTimestamp = null;
	this._curPos = null;
	this._prevPos = null;
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

    onPosition: function (isStationary, ts, coords) {
	this._curPos = new L.LatLng(coords.latitude, coords.longitude,
				    coords.altitude);
	this._curPos.ts = ts;

	if (! isStationary)
	{
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
		if (this._prevPos !== null) {
		    this._length += this._prevPos.distanceTo(this._curPos);
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

	    this._prevPos = this._curPos;
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
});


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

var TileCacheDb = L.Class.extend({
    initialize: function (db) {
	this._db = db;
    },

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
});


var Application = L.Class.extend({
    initialize: function () {
	this._metricUnits = (window.localStorage.getItem('metric') || 'true') == 'true';
	this._offline = (window.localStorage.getItem('offline') || 'false') == 'true';
	this._activeLayer = (window.localStorage.getItem('active-layer') || '0');

	this._db = null;
	this._map = null;
	this._mapLayer = null;

	this._positionIcon = new L.Icon.Default();
	this._directionIcon = new ArrowIcon();
	this._positionMarker = null;
	this._positionCircle = null;

	this._routeLayer = null;
	this._trackLayer = null;
	this._trackingHandler = null;
	this._pathTracker = new PathTracker();

	this._initDb();
    },

    _initDb: function () {
	var request = window.indexedDB.open('HikingMaps', 1);
	var self = this;
	request.onerror = function(event)
	{
	    self._initApp();
	};
	request.onsuccess = function(event)
	{
	    self._db = request.result;
	    self._initApp();
	};
	request.onupgradeneeded = function(event)
	{
	    var db = request.result;
	    var ver = db.version || 0; // version is empty string for a new DB
	    if (!db.objectStoreNames.contains('tilecache'))
	    {
		var tilecacheStore = db.createObjectStore('tilecache');
	    }
	    if (!db.objectStoreNames.contains('tilemeta'))
	    {
		var tilemetaStore = db.createObjectStore('tilemeta');
	    }
	    db.onversionchange = function(event)
	    {
		db.close();
		self._initDb();
	    };
	};
    },

    _initApp: function () {
	var self = this;

	this._map = L.map('map').setView([51.505, -0.09], 13);
	this._positionMarker = L.marker([51.505, -0.09], { icon : this._positionIcon });
	this._positionCircle = L.circle([51.505, -0.09], 0);

	this._map.on('locationfound', function(e) {
	    document.getElementById('locate').dataset.state = '';
	    self._positionMarker.setIcon(self._positionIcon);
	    self._positionMarker.setLatLng(e.latlng);
	    self._positionCircle.setLatLng(e.latlng);
	    self._positionCircle.setRadius(e.accuracy / 2);

	    self._positionMarker.addTo(self._map);
	    self._positionCircle.addTo(self._map);
	});

	this._map.on('locationerror', function(e) {
	    document.getElementById('locate').dataset.state = '';
	});

	var cacheDB = new TileCacheDb(this._db);
	L.control.scale().addTo(this._map);

	this._trackLayer = L.polyline([], { color: '#209030',
					    opacity: 0.7 }).addTo(this._map);
	document.getElementById('locate').addEventListener('click',
							   L.bind(this.doLocate, this), false);
	document.getElementById('locateplaypause').addEventListener('click', L.bind(this.PositionUpdatePlayPause, this), false);
	document.getElementById('waydelete').addEventListener('click', L.bind(this.doDeleteTrack, this), false);
	document.getElementById('share').addEventListener('click', window.MozActivity
							  ? L.bind(this.doShareTrack, this)
							  : L.bind(this.doSaveTrack, this),
							  false);
	document.getElementById('menubutton').addEventListener('click', L.bind(this.doOpenSettings, this), false);
	document.getElementById('settingsokbutton').addEventListener('click', L.bind(this.doEndSettings, this), false);
	document.getElementById('statsbutton').addEventListener('click', L.bind(this.doOpenCloseStats, this), false);
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
		self.loadRoute(a.result.blob);
	    };
	    a.onerror = function() { console.log('Failure when trying to pick an file'); };
	}, false);

	var trackFileClear = document.getElementById('trackfileclear');
	trackFileClear.addEventListener('click', function (e) {
	    document.getElementById('trackfilename').setAttribute('value', '');
	    self._clearRoute();
	}, false);

	var trackFileInput = document.getElementById('trackfile');
	trackFileInput.addEventListener('change', function (e) {
	    self.loadRoute(e.target.files[0]);
	}, false);

	document.getElementById((window.MozActivity !== undefined) ? 'trackfilepickitem' : 'trackfileitem').classList.remove('invisible');

	var mapLayerSelect = document.getElementById('maplayerselect');
	for (var mapIdx in mapInfo) {
	    mapLayerSelect.options[mapLayerSelect.options.length] = new Option(mapInfo[mapIdx].name, mapIdx);
	}

	if (this._activeLayer < mapLayerSelect.options.length) {
	    mapLayerSelect.options[this._activeLayer].selected = 'true';
	} else {
	    this._activeLayer = 0;
	}

	this._mapLayer = this.createMapLayer (cacheDB, mapInfo[this._activeLayer]);
	this._mapLayer.setOffline(this._offline);
	this._mapLayer.addTo(this._map);

	document.getElementById('maplayerselect').addEventListener('change', function (e) {
	    self._activeLayer = mapLayerSelect.value;
	    window.localStorage.setItem('active-layer', self._activeLayer.toString());

	    self._map.removeLayer(self._mapLayer);
	    self._mapLayer = self.createMapLayer (cacheDB, mapInfo[self._activeLayer]);
	    self._mapLayer.setOffline(self._offline);
	    self._mapLayer.addTo(self._map);
	});
    },

    formatDistance: function (l, def) {
	if (l == 0) {
	    return def;
	} else if (this._metricUnits) {
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
    },

    formatDuration: function (d, def) {
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
    },

    formatSpeed: function (s, def) {
	if (isNaN(s)) {
	    return def;
	} else if (this._metricUnits) {
	    return (s * 3600).toFixed(1) + ' km/h';
	} else {
	    return (s * 3600 / 0.9144 / 1.76).toFixed(1) + ' m/h';
	}
    },

    formatElevation: function (h, def) {
	if (h == 0) {
	    return def;
	} else if (this._metricUnits) {
	    return h.toFixed(0) + ' m';
	} else {
	    return (h / 0.9144 * 3).toFixed(0) + ' ft';
	}
    },

    createMapLayer: function (db, info) {
	return new CachedTileLayer(info.baseUrl, db,
				   { attribution: info.attribution,
				     maxZoom: 18,
				     subdomains: info.subdomains });
    },

    _clearRoute: function () {
	if (this._routeLayer !== null) {
	    document.getElementById('route-length').textContent = '';
	    this._map.removeLayer(this._routeLayer);
	    this._routeLayer = null;
	}
    },

    loadRoute: function (f) {
	this._clearRoute();

	var self = this;
	if (f) {
	    reader = new FileReader();
	    reader.onload = function(e) {
		this._routeLayer = new L.GPX(e.target.result, {
		    async: true,
		    polyline_options: { color: '#203090',
					opacity: 0.7 } }).on(
					    'loaded', function(e) {
						self._map.fitBounds(e.target.getBounds());
					    }).addTo(self._map);
	    };
	    
	    reader.readAsText(f);
	}
    },

    _positionUpdated: function (e) {
	var isStationary = (e.coords.speed === 0) ||
	    ((e.coords.heading !== null) && isNaN(e.coords.heading));
	var isNewSeg = this._pathTracker.onPosition(isStationary, e.timestamp, e.coords);

	if (! isStationary) {
	    var pos = this._pathTracker.getPosition();

	    this._trackLayer.addLatLng(pos);
	    this._map.panTo(pos);

	    var len = this._pathTracker.getLength();
	    document.getElementById('track-length').textContent =
		this.formatDistance(len, '');

	    this._directionIcon.setDirection(e.coords.heading);
	} else if (isNewSeg) {
	    this._map.panTo(this._pathTracker.getPosition());
	}

	this._positionMarker.setIcon(this._directionIcon);
	this._positionMarker.setLatLng(this._pathTracker.getPosition());
	this._positionMarker.addTo(this._map);
    },

    doLocate: function () {
	document.getElementById('locate').dataset.state = 'refreshing';
	this._map.locate({setView: true,
			  maxZoom: 16,
			  timeout: 60000,
			  maximumAge: 0,
			  enableHighAccuracy: true});
    },

    PositionUpdatePlayPause: function () {
	if (document.getElementById('locateplaypause').classList.contains('pause-btn')) {
	    document.getElementById('locate').classList.remove('invisible');
	    document.getElementById('locateplaypause').classList.remove('pause-btn');
	    document.getElementById('locateplaypause').classList.add('play-btn');
	    document.getElementById('share').classList.remove('invisible');

	    navigator.geolocation.clearWatch(this._trackingHandler);
	    this._trackingHandler = null;
	} else {
	    document.getElementById('locate').classList.add('invisible');
	    document.getElementById('locateplaypause').classList.add('pause-btn');
	    document.getElementById('locateplaypause').classList.remove('play-btn');

	    var shareElem = document.getElementById('share')
	    shareElem.classList.add('invisible');
	    if (shareElem.hasAttribute('href')) {
		URL.revokeObjectURL(shareElem.getAttribute('href'));
		shareElem.removeAttribute('href');
	    }

	    this._map.removeLayer(this._positionCircle);
	    this._pathTracker.start();

	    var self = this;
	    this._trackingHandler = navigator.geolocation.watchPosition(
		function(position) { self._positionUpdated(position); },
		function(err) { },
		{
		    enableHighAccuracy: true,
		    timeout: 60000,
		    maximumAge: 0
		});
	}
    },

    doDeleteTrack: function () {
	this._map.removeLayer(this._positionMarker);
	this._map.removeLayer(this._positionCircle);

	var shareElem = document.getElementById('share')
	shareElem.classList.add('invisible');
	if (shareElem.hasAttribute('href')) {
	    URL.revokeObjectURL(shareElem.getAttribute('href'));
	    shareElem.removeAttribute('href');
	}

	this._pathTracker = new PathTracker();
	document.getElementById('track-length').textContent = '';
	this._map.removeLayer(this._trackLayer);
	this._trackLayer = L.polyline([], { color: '#209030',
					    opacity: 0.7 }).addTo(this._map);
    },

    doOpenSettings: function () {
	document.getElementById('settings-offline').checked = this._offline;
	document.getElementById('settings-units').checked = this._metricUnits;

	delete document.getElementById('settings-view').dataset.viewport;
    },

    doEndSettings: function () {
	document.getElementById('settings-view').dataset.viewport = 'bottom';

	this._offline = document.getElementById('settings-offline').checked;
	window.localStorage.setItem('offline', this._offline.toString());
	this._mapLayer.setOffline(this._offline);

	this._metricUnits = document.getElementById('settings-units').checked;
	window.localStorage.setItem('metric', this._metricUnits.toString());

	if ((this._routeLayer !== null) &&
	    (this._routeLayer.get_distance() > 0)) {
	    document.getElementById('route-length').textContent =
		'(' + formatDistance(this._routeLayer.get_distance(), '') + ')';
	}
	document.getElementById('track-length').textContent =
	    this.formatDistance(this._pathTracker.getLength(), '');
    },

    _UpdateStatistics: function () {
	document.getElementById('stats-distance').textContent =
	    this.formatDistance(this._pathTracker.getLength(), '-');
	document.getElementById('stats-total-time').textContent =
	    this.formatDuration(this._pathTracker.getTotalDuration(), '-');
	document.getElementById('stats-moving-time').textContent =
	    this.formatDuration(this._pathTracker.getMoveDuration(), '-');
	document.getElementById('stats-moving-speed').textContent =
	    this.formatSpeed(this._pathTracker.getLength() / this._pathTracker.getMoveDuration(),
			'-');
	document.getElementById('stats-min-elevation').textContent =
	    (this._pathTracker.getMinElevation() === Infinity) ? '-' :
	    this.formatElevation(pathTracker.getMinElevation(), '-');
	document.getElementById('stats-max-elevation').textContent =
	    (this._pathTracker.getMaxElevation() === -Infinity) ? '-' :
	    this.formatElevation(pathTracker.getMaxElevation(), '-');
	document.getElementById('stats-elevation-gain').textContent =
	    this.formatElevation(this._pathTracker.getElevationGain(), '-');
	document.getElementById('stats-elevation-loss').textContent =
	    this.formatElevation(this._pathTracker.getElevationLoss(), '-');
    },

    doOpenCloseStats: function () {
	var mainView = document.getElementById('main-view');
	if (mainView.dataset.viewport !== undefined) {
	    delete mainView.dataset.viewport;
	} else {
	    this._UpdateStatistics();
	    mainView.dataset.viewport = 'side';
	}
    },

    _createGpx: function (path) {
	var dateString = new Date().toISOString();

	var data = [];
	data.push('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
		  '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="HikingMaps">\n');
	data.push('<metadata><link href="http://hikingmaps.cmeerw.org">' +
		  '<text>HikingMaps</text></link>' +
		  '<time>' + dateString + '</time></metadata>\n');
	data.push('<trk><trkseg>\n');

	for (var idx in path) {
	    var point = path[idx];
	    data.push('<trkpt lat="' + point.lat + '" lon="' + point.lng + '">' +
		      ((coord.alt !== null) ? ('<ele>' + point.alt + '</ele>') : '') +
		      '<time>' + new Date(point.ts).toISOString() + '</time>' +
		      '</trkpt>\n');
	}

	data.push('</trkseg></trk></gpx>\n');
	return new Blob(data, { 'type' : 'application/gpx+xml' });
    },

    _shareGpx: function (blob) {
	new MozActivity({ name: 'share',
			  data: {
			      type: 'application/gpx+xml',
			      number: 1,
			      blobs: [blob],
			      filepaths: [null]
			  } });
    },

    doSaveTrack: function () {
	var elem = document.getElementById('share');
	if (! elem.hasAttribute('href')) {
	    var gpxUrl = URL.createObjectURL(this._createGpx(this._trackLayer.getLatLngs()));
	    elem.setAttribute('href', gpxUrl);
	    elem.setAttribute('download', new Date().toISOString() + '.gpx');
	}
    },

    doShareTrack: function () {
	this._shareGpx(this._createGpx(this._trackLayer.getLatLngs()));
    }
});

var app = new Application();
