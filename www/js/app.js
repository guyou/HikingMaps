/*
 * HikingMaps, http://hikingmaps.cmeerw.org
 * Copyright (C) 2014-2015, Christof Meerwald
 *
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see
 * <http://www.gnu.org/licenses/>.
 */

var ScaledCRS_EPSG3857 = L.extend({}, L.CRS.EPSG3857, {
    initialize: function () {
	this._tileSize = 256;
    },

    setTileSize: function (tileSize) {
	this._tileSize = tileSize;
    },

    scale: function (zoom) {
        return this._tileSize * Math.pow(2, zoom);
    }
});

function requestGpsWakeLock() {
    var wakeLock = {
	unlock : function() {}
    };
  
    if (navigator.requestWakeLock) {
	wakeLock = navigator.requestWakeLock('gps');
    }

    return wakeLock;
};

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
	    this.options.direction + 'deg); -webkit-transform: rotate(' +
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

MultiPolyline = L.Polyline.extend({
    initialize: function (latlngs, options) {
	L.Polyline.prototype.initialize.call(this, [latlngs], options);
    },

    _flat: function (latlngs) {
	return false;
    },

    _project: function () {
	this._rings = [];
	this._projectLatlngs(this._latlngs, this._rings);

	// project bounds as well to use later for Canvas hit detection/etc.
	var w = this._clickTolerance(),
	p = new L.Point(w, -w);

	if (this._rings.length) {
	    this._pxBounds = new L.Bounds(
		this._map.latLngToLayerPoint(this._bounds.getSouthWest())._subtract(p),
		this._map.latLngToLayerPoint(this._bounds.getNorthEast())._add(p));
	}
    },

    addSegment: function (latlngs) {
	if (this._latlngs[this._latlngs.length - 1].length) {
	    this._latlngs.push([]);
	}

	if (latlngs) {
	    this._latlngs[this._latlngs.length - 1] = latlngs;
	}
    },

    addLatLng: function (latlng) {
	latlng = L.latLng(latlng);
	this._latlngs[this._latlngs.length - 1].push(latlng);
	this._bounds.extend(latlng);
    },
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
    options: {
	quadKey: false
    },

    initialize: function (id, url, name, db, options) {
	this._db = db;
	this._id = id;
	this._name = name;
	this._offline = false;
	FunctionalTileLayer.prototype.initialize.call(this, url,
						      this._getTileAsync,
						      options);
    },

    setOffline: function (val) {
	this._offline = val;
    },

    getTileUrl: function (tilePoint) {
	if (this.options.quadKey) {
            return L.Util.template(this._url, {
		s: this._getSubdomain(tilePoint),
		q: this._quadKey(tilePoint.x, tilePoint.y, this._getZoomForUrl())
            });
	} else {
	    return FunctionalTileLayer.prototype.getTileUrl.call(this, tilePoint);
	}
    },

    _quadKey: function (x, y, z) {
        var quadKey = [];
        for (var i = z; i > 0; i--) {
            var digit = '0';
            var mask = 1 << (i - 1);
            if ((x & mask) != 0) {
                digit++;
            }
            if ((y & mask) != 0) {
                digit++;
                digit++;
            }
            quadKey.push(digit);
        }
        return quadKey.join('');
    },

    _getDbKey: function (coords) {
	return [ this._id, this._getZoomForUrl(), coords.x, coords.y ];
    },

    _getTileAsync : function (coords) {
	var url = this.getTileUrl(coords);
	var dbKey = this._getDbKey(coords);

	var deferred = {
	    _fn: null,
	    _url : url,

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
	    this._db.get(dbKey, function (arg) {
		deferred.resolve(arg && arg.blob);
	    });
	} else {
	    var self = this;
	    this._db.get(dbKey, function (arg) {
		if (arg && arg.expires && arg.expires * 1000 > Date.now()) {
		    self._db.get(dbKey, function (arg) {
			deferred.resolve(arg && arg.blob);
		    });
		    return;
		}

		var xhr = new XMLHttpRequest({mozSystem: true});
		xhr.open('GET', url, true);
		if (arg && arg.etag) {
		    xhr.setRequestHeader('If-None-Match', arg.etag);
		}
		xhr.responseType = 'blob';
		xhr.addEventListener('load', function () {
		    if (xhr.status === 200) {
			var blob = xhr.response;
			var etag = xhr.getResponseHeader('ETag');
			var expires = Date.parse(xhr.getResponseHeader('Expires'));
			var minExpires = Math.floor(Date.now() / 1000) + 300;
			var maxExpires = minExpires + 86400 - 300;
			if (! (expires > minExpires)) {
			    expires = minExpires;
			} else if (expires > maxExpires) {
			    expires = maxExpires;
			}

			self._db.put(dbKey, blob, etag, expires);
			deferred.resolve(blob);
		    } else if (arg && arg.blob) {
			deferred.resolve(arg.blob);
		    } else {
			self._db.get(dbKey, function (arg) {
			    deferred.resolve(arg && arg.blob);
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
	this._started = false;
	this._prevTimestamp = null;
	this._moveTimestamp = null;
	this._isStationary = true;
	this._curHeading = 0;
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
	this._started = false;
	this._prevTimestamp = null;
	this._moveTimestamp = null;
	this._prevPos = null;
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

    isStationary: function () {
	return this._isStationary;
    },

    getHeading: function () {
	return this._curHeading;
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

    onPosition: function (ts, coords) {
	// try to filter out bogus data
	this._isStationary = (coords.speed === 0) ||
	    ((coords.heading !== null) && isNaN(coords.heading));
	var altitude = (coords.altitude !== null)
	    ? (((coords.altitude !== 0) || (coords.speed !== 0))
	       ? coords.altitude : undefined) : undefined;

	this._curPos = new L.LatLng(coords.latitude, coords.longitude, altitude);
	this._curPos.ts = ts;

	var altAccuracy = Math.max((coords.altitudeAccuracy !== null)
				   ? coords.altitudeAccuracy : 0
				   , 4);
	var minAlt = (altitude !== undefined) ? (altitude - altAccuracy) : -Infinity;
	var maxAlt = (altitude !== undefined) ? (altitude + altAccuracy) : +Infinity;
	var curAlt = [minAlt, maxAlt];
	var startPos = null;

	if (! this._isStationary)
	{
	    this._curHeading = coords.heading;
	    this._minElev = Math.min(this._minElev,
				     (altitude !== undefined) ? altitude : Infinity);
	    this._maxElev = Math.max(this._maxElev,
				     (altitude !== undefined) ? altitude : -Infinity);

	    if (! this._started) {
		this._started = true;

		// check if prev position looks reasonable
		if ((this._prevPos !== null) && coords.speed) {
		    if (0.0015 * (coords.speed + 1) * (ts - this._prevTimestamp) <
			this._prevPos.distanceTo(this._curPos)) {
			this._prevPos = null; // prev position was invalid
		    }
		}

		startPos = this._prevPos || this._curPos;
	    }

	    if (this._prevPos !== null) {
		this._length += this._prevPos.distanceTo(this._curPos);

		if ((this._moveTimestamp !== null) &&
		    (ts - this._moveTimestamp < 5.5)) {
		    // we had a very short wait - count it as moving instead
		    this._moveDuration += ts - this._moveTimestamp;
		    this._waitDuration -= this._prevTimestamp - this._moveTimestamp;
		} else {
		    this._moveDuration += ts - this._prevTimestamp;
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
	    if (this._started) {
		this._waitDuration += ts - this._prevTimestamp;
	    } else {
		this._prevPos = this._curPos;
		this._prevAlt = curAlt;
	    }
	}

	this._prevTimestamp = ts;
	return startPos;
    }
});


var protocol = (document.location.protocol === 'https:') ? 'https:' : 'http:';
var defaultMapInfo = [
    { name : 'MapTiles',
      baseUrl : protocol + '//{s}.osm.maptiles.xyz/{z}/{x}/{y}.png',
      subdomains : 'abc',
      attribution : 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>.' },
    { name : 'Thunderforest Outdoors',
      baseUrl : protocol + '//{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png',
      subdomains : 'abc',
      attribution : 'Map &copy; <a href="http://www.thunderforest.com">Thunderforest</a>, Data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>' }
];

var TileCacheDb = L.Class.extend({
    initialize: function (db) {
	this._db = db;
    },

    clear: function () {
	var transaction = this._db.transaction(['tiles'], 'readwrite');
	transaction.objectStore('tiles').clear();
    },

    put: function (key, blob, etag, expires) {
	var obj = { layer : key[0], z : key[1], x : key[2], y : key[3],
		    blob : blob };
	etag && (obj.etag = etag);
	expires && (obj.expires = expires);
	var transaction = this._db.transaction(['tiles'], 'readwrite');
	transaction.objectStore('tiles').put(obj);
    },

    get: function (key, fn) {
	var transaction = this._db.transaction(['tiles']);
	var request = transaction.objectStore('tiles').get(key);
	request.onsuccess = function (e) {
            var obj = e.target.result;
	    fn(obj);
	};
	request.onerror = function (e) { };
    },
});


var Application = L.Class.extend({
    initialize: function () {
	this._metricUnits = (window.localStorage.getItem('metric') || 'true') == 'true';
	this._tileSize = Number(window.localStorage.getItem('tilesize') || '256');
	this._offline = (window.localStorage.getItem('offline') || 'false') == 'true';

	this._activeLayer = Number(window.localStorage.getItem('active-layer') || '0');

	this._mapLat = window.localStorage.getItem('map-lat');
	this._mapLng = window.localStorage.getItem('map-lng');
	this._mapZoom = window.localStorage.getItem('map-zoom');

	this._useWebActivities = (window.MozActivity !== undefined) &&
	    (navigator.getDeviceStorage !== undefined);

	this._db = null;
	this._cacheDB = null;
	this._map = null;
	this._mapLayer = null;
	this._setActiveLayer = true;

	this._positionIcon = new L.Icon.Default();
	this._directionIcon = new ArrowIcon();
	this._positionMarker = null;
	this._positionCircle = null;

	this._routeLayer = null;
	this._trackLayer = null;
	this._trackingHandler = null;
	this._gpsWakeLock = null;
	this._pathTracker = null;

	this._deferredUpdate = false;
	this._unflushed = 0;
	this._unflushedPos = 0;
	this._unflushedUpdates = 0;

	this._initDb();
    },

    _initDb: function () {
	var request = window.indexedDB.open('HikingMaps', 2);
	var self = this;

	request.onerror = function(event) {
	    self._initApp();
	};
	request.onsuccess = function(event) {
	    self._db = request.result;

	    var transaction = self._db.transaction(['layers']);
	    var layersReq = transaction.objectStore('layers').openCursor();

	    self._mapInfo = { };
	    self._maxMapId = -1;
	    layersReq.onsuccess = function (e) {
		var cursor = e.target.result;
		if (cursor) {
		    self._mapInfo[cursor.value.id] = cursor.value;
		    if (cursor.value.id > self._maxMapId) {
			self._maxMapId = cursor.value.id;
		    }
		    cursor.continue();
		} else {
		    self._initApp();
		}
	    };
	    layersReq.onerror = function (e) { };
	};
	request.onupgradeneeded = function(event) {
	    var db = request.result;
	    var ver = db.version || 0; // version is empty string for a new DB
	    if (db.objectStoreNames.contains('tilecache'))
	    {
		db.deleteObjectStore('tilecache');
	    }
	    if (db.objectStoreNames.contains('tilemeta'))
	    {
		db.deleteObjectStore('tilemeta');
	    }
	    if (!db.objectStoreNames.contains('layers'))
	    {
		// migrate data from local storage to db
		var mapInfo = window.localStorage.getItem('mapInfo');
		var mapInfoArray = mapInfo ? JSON.parse(mapInfo) : defaultMapInfo;

		var layersStore = db.createObjectStore('layers',
						       { keyPath : 'id' });
		for (var idx in mapInfoArray) {
		    mapInfoArray[idx].id = Number(idx);
		    layersStore.put(mapInfoArray[idx]);
		}

		window.localStorage.setItem('active-layer', self._activeLayer);
		window.localStorage.removeItem('mapInfo');
	    }
	    if (!db.objectStoreNames.contains('tiles'))
	    {
		var tilesStore =
		    db.createObjectStore('tiles', { keyPath : [ 'layer', 'z', 'x', 'y' ] });
		tilesStore.createIndex('layer', 'layer', { unique: false });
	    }
	    if (!db.objectStoreNames.contains('track'))
	    {
		var trackStore =
		    db.createObjectStore('track', { autoIncrement : true });
	    }
	    if (!db.objectStoreNames.contains('state'))
	    {
		var stateStore = db.createObjectStore('state');
	    }
	};
    },

    _initApp: function () {
	var self = this;

	for (var idx = 0; idx < document.forms.length; ++idx) {
	    document.forms[idx].onsubmit = function () {
		return false;
	    }
	}

	this._map = L.map('map',
			  { crs: ScaledCRS_EPSG3857, zoomControl: false });
	this._map.options.crs.setTileSize(this._tileSize);
	this._map.invalidateSize({});

	if (this._mapLat && this._mapLng && this._mapZoom) {
	    this._map.setView([Number(this._mapLat), Number(this._mapLng)],
			      Number(this._mapZoom));
	} else {
	    this._map.setView([0, 0], 2);
	}
	window.addEventListener('unload', function () {
	    var center = self._map.getCenter();
	    self._mapLat = center.lat;
	    self._mapLng = center.lng;
	    self._mapZoom = self._map.getZoom();

	    window.localStorage.setItem('map-lat', self._mapLat);
	    window.localStorage.setItem('map-lng', self._mapLng);
	    window.localStorage.setItem('map-zoom', self._mapZoom);
	});

	L.control.scale().addTo(this._map);

	this._positionMarker = L.marker([0, 0], { icon : this._positionIcon });
	this._positionCircle = L.circle([0, 0], 0);

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

	this._cacheDB = new TileCacheDb(this._db);
	this._createTrack();

	document.addEventListener('visibilitychange', L.bind(this.doDeferredUpdate, this), false);

	document.getElementById('locate').addEventListener('click',
							   L.bind(this.doLocate, this), false);
	document.getElementById('recordplaypause').addEventListener('click', L.bind(this.doRecordPlayPause, this), false);

	document.getElementById('trackdelete').addEventListener('click', function () {
	    if (self._pathTracker.getMoveDuration()) {
		document.getElementById('confirm-track-delete').classList.remove('invisible');
	    } else {
		self.doDeleteTrack();
	    }
	}, false);
	document.getElementById('confirm-track-delete-cancel').addEventListener('click', function () {
	    document.getElementById('confirm-track-delete').classList.add('invisible');
	}, false);
	document.getElementById('confirm-track-delete-do').addEventListener('click', function () {
	    document.getElementById('confirm-track-delete').classList.add('invisible');
	    self.doDeleteTrack();
	}, false);

	document.getElementById('share').addEventListener('click', L.bind(this.doShareTrack, this), false);
	document.getElementById('settingsbutton').addEventListener('click', L.bind(this.doOpenSettings, this), false);
	document.getElementById('settingsokbutton').addEventListener('click', L.bind(this.doEndSettings, this), false);
	document.getElementById('statsbutton').addEventListener('click', L.bind(this.doOpenCloseStats, this), false);
	document.getElementById('clear-cache').addEventListener('click', function () {
	    document.getElementById('confirm-cache-clear').classList.remove('invisible');
	}, false);
	document.getElementById('confirm-cache-clear-cancel').addEventListener('click', function () {
	    document.getElementById('confirm-cache-clear').classList.add('invisible');
	}, false);
	document.getElementById('confirm-cache-clear-do').addEventListener('click', function () {
	    document.getElementById('confirm-cache-clear').classList.add('invisible');
	    self._cacheDB.clear();
	}, false);

	document.getElementById('layersbutton').addEventListener('click', L.bind(this.doOpenLayers, this), false);
	document.getElementById('layersokbutton').addEventListener('click', L.bind(this.doEndLayers, this), false);
	document.getElementById('addlayerbutton').addEventListener('click', L.bind(this.doAddLayer, this), false);

	document.getElementById('layerokbutton').addEventListener('click', L.bind(this.doEndLayer, this, true), false);
	document.getElementById('layercancelbutton').addEventListener('click', L.bind(this.doEndLayer, this, false), false);
	document.getElementById('layer-delete').addEventListener('click', function () {
	    document.getElementById('confirm-layer-delete').classList.remove('invisible');
	}, false);
	document.getElementById('confirm-layer-delete-cancel').addEventListener('click', function () {
	    document.getElementById('confirm-layer-delete').classList.add('invisible');
	}, false);
	document.getElementById('confirm-layer-delete-do').addEventListener('click', function () {
	    document.getElementById('confirm-layer-delete').classList.add('invisible');
	    self.doDeleteLayer();
	}, false);

	var trackFileInput = document.getElementById('trackfile');
	var trackFilePick = document.getElementById('trackfilepick');
	var trackFileName = document.getElementById('trackfilename');
	trackFilePick.addEventListener('click', function (e) {
	    if (self._useWebActivities) {
		var a = new MozActivity({ name: 'pick',
					  data: { type: 'application/gpx+xml',
						  multiple: false }});
		a.onsuccess = function() {
		    var name = a.result.blob.name.split('/').pop().replace('.gpx', '');
		    trackFileName.setAttribute('value', name);
		    self.loadRoute(a.result.blob);
		};
		a.onerror = function() {
		    if (a.error.name == 'NO_PROVIDER') {
			trackFileInput.click();
		    }
		};
	    } else {
		trackFileInput.click();
	    }
	}, false);

	var trackFileClear = document.getElementById('trackfileclear');
	trackFileClear.addEventListener('click', function (e) {
	    trackFileName.setAttribute('value', '');
	    trackFileInput.setAttribute('value', '');
	    self._clearRoute();
	}, false);

	trackFileInput.addEventListener('change', function (e) {
	    trackFileName.setAttribute('value', e.target.files[0].name);
	    self.loadRoute(e.target.files[0]);
	}, false);

	this._updateLayers();
	this._doSetActiveLayer();

	var tileSizeSelect = document.getElementById('settings-tilesize');
	tileSizeSelect.addEventListener('change', function (e) {
	    self._setActiveLayer = true;
	});

	var mapLayerSelect = document.getElementById('maplayerselect');
	mapLayerSelect.addEventListener('change', function (e) {
	    self._activeLayer = mapLayerSelect.value;
	    window.localStorage.setItem('active-layer', self._activeLayer);

	    self._setActiveLayer = true;
	});

	this._restoreState();
    },

    _hideSplash: function () {
	document.getElementById('splash').classList.add('invisible');
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

    _createMapLayer: function (db, info) {
	return new CachedTileLayer(info.id, info.baseUrl, info.name, db,
				   { attribution: info.attribution,
				     maxZoom: 18,
				     maxNativeZoom: 18,
				     tileSize: this._tileSize,
				     detectRetina: (info.baseUrl.indexOf('{r}') != -1),
				     quadKey: (info.baseUrl.indexOf('{q}') != -1),
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
		self._routeLayer = new L.GPX(e.target.result, {
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
	var startPos = this._pathTracker.onPosition(e.timestamp, e.coords);

	if (this._unflushed) {
	    ++this._unflushedUpdates;
	}

	var pos = this._pathTracker.getPosition();
	if (! this._pathTracker.isStationary()) {
	    if (startPos !== null) {
		this._trackLayer.addSegment();
		this._unflushedPos = 0;
		if (! startPos.equals(pos, 0)) {
		    this._trackLayer.addLatLng(startPos);
		}
	    }

	    this._trackLayer.addLatLng(pos);
	    ++this._unflushed;

	    if (! document.hidden) {
		this._map.panTo(pos);
		this._trackLayer.redraw();

		var len = this._pathTracker.getLength();
		document.getElementById('track-length').textContent =
		    this.formatDistance(len, '');

		this._directionIcon.setDirection(this._pathTracker.getHeading());
	    }
	} else if (startPos !== null) {
	    if (! document.hidden) {
		this._map.panTo(pos);
	    }
	}

	if (! document.hidden) {
	    this._positionMarker.setIcon(this._directionIcon);
	    this._positionMarker.setLatLng(pos);
	    this._positionMarker.addTo(this._map);
	} else {
	    this._deferredUpdate = true;
	}

	if (this._unflushedUpdates > 30) {
	    this._flushTrack(false);
	}
    },

    _flushTrack : function (endSegment) {
	var transaction = this._db.transaction(['state', 'track'], 'readwrite');
	transaction.objectStore('state').put(this._pathTracker, 1);
	var trackStore = transaction.objectStore('track');

	var latlngs = this._trackLayer._latlngs[this._trackLayer._latlngs.length - 1].slice(this._unflushedPos);
	for (var idx in latlngs) {
	    trackStore.add(latlngs[idx]);
	}
	if (endSegment && this._unflushedPos) {
	    trackStore.add(null);
	}

	this._unflushed = 0;
	this._unflushedPos += latlngs.length;
	this._unflushedUpdates = 0;
    },

    _restoreState : function () {
	var self = this;
	var transaction = this._db.transaction(['state', 'track']);
	var stateReq = transaction.objectStore('state').get(1);
	stateReq.onsuccess = function (e) {
	    var obj = e.target.result;
	    for (var idx in obj) {
		self._pathTracker[idx] = obj[idx];
	    }

	    var trackReq = transaction.objectStore('track').openCursor();
	    var segment = [];
	    trackReq.onsuccess = function (e) {
		var cursor = e.target.result;
		if (cursor) {
		    if (cursor.value) {
			var latlng = L.latLng(cursor.value);
			latlng.ts = cursor.value.ts;
			segment.push(latlng);
			self._trackLayer._bounds.extend(latlng);
		    } else if (segment.length) {
			self._trackLayer.addSegment(segment);
			segment = [];
		    }

		    cursor.continue();
		} else {
		    if (segment.length) {
			self._trackLayer.addSegment(segment);
			segment = [];
		    }

		    var len = self._pathTracker.getLength();
		    if (len) {
			document.getElementById('track-length').textContent =
			    self.formatDistance(len, '');

			self._directionIcon.setDirection(self._pathTracker.getHeading());
			self._positionMarker.setIcon(self._directionIcon);

			var pos = self._pathTracker.getPosition();
			if (pos) {
			    self._map.panTo(pos);
			    self._positionMarker.setLatLng(pos);
			    self._positionMarker.addTo(self._map);
			}

			self._trackLayer.redraw();
			document.getElementById('share').classList.remove('invisible');
		    }

		    self._hideSplash();
		}
	    };
	}
    },

    doDeferredUpdate: function () {
	if (this._deferredUpdate && ! document.hidden) {
	    var pos = this._pathTracker.getPosition();
	    var len = this._pathTracker.getLength();

	    this._trackLayer.redraw();
	    this._map.panTo(pos);

	    document.getElementById('track-length').textContent =
		this.formatDistance(len, '');

	    this._directionIcon.setDirection(this._pathTracker.getHeading());
	    this._positionMarker.setIcon(this._directionIcon);
	    this._positionMarker.setLatLng(pos);
	    this._positionMarker.addTo(this._map);

	    this._deferredUpdate = false;
	}
    },

    doShowElevPlot: function () {
	var canvas = document.getElementById('elevation-plot');

	var minElev = this._pathTracker.getMinElevation();
	var maxElev = this._pathTracker.getMaxElevation();
	var length = this._pathTracker.getLength();
	var latlngs = this._trackLayer.getLatLngs();

	if ((minElev >= maxElev) ||
	    document.getElementById('recordplaypause').classList.contains('icon-media-pause')) {
	    document.getElementById('elevation-unavailable').classList.remove('invisible');
	    canvas.classList.add('invisible');

	    return;
	}

	document.getElementById('elevation-unavailable').classList.add('invisible');
	canvas.classList.remove('invisible');

	var DEVICE_RATIO = window.devicePixelRatio || 1;
	canvas.width = Math.floor(canvas.clientWidth * DEVICE_RATIO + .5);
	canvas.height = Math.floor(canvas.clientHeight * DEVICE_RATIO + .5);

	var ctx = canvas.getContext('2d');
	ctx.lineWidth = DEVICE_RATIO;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';

	ctx.beginPath();
	ctx.moveTo(10, 10);
	ctx.lineTo(10, canvas.height - 10);
	ctx.lineTo(canvas.width - 10, canvas.height - 10);
	ctx.strokeStyle = '#444';
	ctx.stroke();

	ctx.beginPath();

	var dist = 0;
	var startX = undefined;
	var curX = undefined;
	var sumY = 0;
	var numY = 0;

	for (var j in latlngs) {
	    var prev = null;

	    for (var i in latlngs[j]) {
		var point = latlngs[j][i];
		var alt = point.alt;

		if (prev !== null) {
		    dist += prev.distanceTo(point);
		}

		prev = point;

		if (alt === undefined) {
		    continue;
		}

		var y = ((alt < minElev)
			 ? minElev : ((alt > maxElev)
				      ? maxElev : alt)) - minElev;
		y = (y / (maxElev - minElev)) * (canvas.height - 20);

		var x = Math.floor((dist / length) * (canvas.width - 20) + .5);
		if (startX === undefined) {
		    startX = x;
		    ctx.moveTo(x + 10, canvas.height - y - 10);
		}

		if (curX !== undefined) {
		    if (x > curX) {
			ctx.lineTo(curX + 10, canvas.height - sumY / numY - 10);
			curX = x;
			sumY = y;
			numY = 1;
		    } else {
			sumY += y;
			numY++;
		    }
		} else {
		    ctx.lineTo(x + 10, canvas.height - y - 10);

		    curX = x + 1;
		    sumY = 0;
		    numY = 0;
		}
	    }
	}

	if (numY > 0) {
	    ctx.lineTo(curX + 10, canvas.height - sumY / numY - 10);
	}

	ctx.strokeStyle = '#119';
	ctx.stroke();

	ctx.lineTo(curX + 10, canvas.height - 10);
	ctx.lineTo(startX + 10, canvas.height - 10);
	ctx.closePath();
	ctx.fillStyle = '#88f';
	ctx.fill();
    },

    doLocate: function () {
	document.getElementById('locate').dataset.state = 'refreshing';
	this._map.locate({setView: true,
			  maxZoom: 16,
			  timeout: 60000,
			  maximumAge: 0,
			  enableHighAccuracy: true});
    },

    doRecordPlayPause: function () {
	if (document.getElementById('recordplaypause').classList.contains('icon-media-pause')) {
	    document.getElementById('locate').classList.remove('invisible');
	    document.getElementById('recordplaypause').classList.remove('icon-media-pause');
	    document.getElementById('recordplaypause').classList.add('icon-media-play');
	    document.getElementById('share').classList.remove('invisible');

	    navigator.geolocation.clearWatch(this._trackingHandler);
	    this._trackingHandler = null;
            this._gpsWakeLock.unlock();
	    this._flushTrack(true);
	} else {
	    document.getElementById('locate').classList.add('invisible');
	    document.getElementById('recordplaypause').classList.add('icon-media-pause');
	    document.getElementById('recordplaypause').classList.remove('icon-media-play');

	    var shareElem = document.getElementById('share')
	    shareElem.classList.add('invisible');
	    if (shareElem.hasAttribute('href')) {
		URL.revokeObjectURL(shareElem.getAttribute('href'));
		shareElem.removeAttribute('href');
	    }

	    this._map.removeLayer(this._positionCircle);
	    this._pathTracker.start();

	    var self = this;
	    this._gpsWakeLock = requestGpsWakeLock();
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

    _createTrack: function () {
	if (this._trackLayer !== null) {
	    this._map.removeLayer(this._trackLayer);
	}
	this._trackLayer =
	    new MultiPolyline([], { color: '#209030',
				    opacity: 0.7 }).addTo(this._map);
	this._pathTracker = new PathTracker();

	document.getElementById('track-length').textContent = '';
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

	this._createTrack();

	var transaction = this._db.transaction(['state', 'track'], 'readwrite');
	transaction.objectStore('state').clear();
	transaction.objectStore('track').clear();
    },

    doOpenSettings: function () {
	document.getElementById('settings-offline').checked = this._offline;
	document.getElementById('settings-units').checked = this._metricUnits;

	var tileSizeSelect = document.getElementById('settings-tilesize');
	for (var idx in tileSizeSelect.options) {
	    tileSizeSelect.options[idx].selected = (tileSizeSelect.options[idx].value == this._tileSize);
	}

	delete document.getElementById('settings-view').dataset.viewport;
    },

    doEndSettings: function () {
	document.getElementById('settings-view').dataset.viewport = 'bottom';

	this._offline = document.getElementById('settings-offline').checked;
	window.localStorage.setItem('offline', this._offline.toString());
	this._mapLayer.setOffline(this._offline);

	this._metricUnits = document.getElementById('settings-units').checked;
	window.localStorage.setItem('metric', this._metricUnits.toString());

	this._tileSize = Number(document.getElementById('settings-tilesize').value);
	window.localStorage.setItem('tilesize', this._tileSize.toString());

	if ((this._routeLayer !== null) &&
	    (this._routeLayer.get_distance() > 0)) {
	    document.getElementById('route-length').textContent =
		'(' + this.formatDistance(this._routeLayer.get_distance(), '') + ')';
	}
	document.getElementById('track-length').textContent =
	    this.formatDistance(this._pathTracker.getLength(), '');

	this._doSetActiveLayer();
    },

    doOpenLayers: function () {
	delete document.getElementById('layers-view').dataset.viewport;
    },

    doEndLayers: function () {
	document.getElementById('layers-view').dataset.viewport = 'right';
    },

    doAddLayer: function () {
	delete document.getElementById('layeredit-view').dataset.viewport;

	document.getElementById('layer-id').value = ++this._maxMapId;
	document.getElementById('layer-name').value = '';
	document.getElementById('layer-url').value = '';
	document.getElementById('layer-subdomains').value = '';
	document.getElementById('layer-attribution').value = '';
	document.getElementById('layer-delete').classList.add('invisible');
    },

    doEditLayer: function (idx) {
	delete document.getElementById('layeredit-view').dataset.viewport;

	document.getElementById('layer-id').value = idx;
	document.getElementById('layer-name').value = this._mapInfo[idx].name;
	document.getElementById('layer-url').value = this._mapInfo[idx].baseUrl;
	document.getElementById('layer-subdomains').value = this._mapInfo[idx].subdomains;
	document.getElementById('layer-attribution').value = this._mapInfo[idx].attribution;
	document.getElementById('layer-delete').classList.remove('invisible');

	if (this._activeLayer == idx) {
	    document.getElementById('layer-delete').setAttribute('disabled', 'true');
	} else {
	    document.getElementById('layer-delete').removeAttribute('disabled');
	}
    },

    doEndLayer: function (save) {
	document.getElementById('layeredit-view').dataset.viewport = 'left';

	if (save) {
	    var idx = Number(document.getElementById('layer-id').value);
	    var name = document.getElementById('layer-name').value;
	    var url = document.getElementById('layer-url').value.replace(
		new RegExp('[$][{]([a-z])[}]', 'g'), '{$1}');
	    var subdomains = document.getElementById('layer-subdomains').value;
	    var attribution = document.getElementById('layer-attribution').value;

	    var info = { id: idx, name : name, baseUrl : url,
			 subdomains : subdomains,
			 attribution : attribution };

	    this._mapInfo[idx] = info;
	    this._updateLayers();

	    if (this._activeLayer == idx) {
		this._setActiveLayer = true;
	    }

	    var transaction = this._db.transaction(['layers'], 'readwrite');
	    transaction.objectStore('layers').put(info);
	}
    },

    doDeleteLayer: function () {
	document.getElementById('layeredit-view').dataset.viewport = 'left';

	var idx = Number(document.getElementById('layer-id').value);
	delete this._mapInfo[idx];

	this._updateLayers();

	var transaction = this._db.transaction(['layers', 'tiles'], 'readwrite');
	transaction.objectStore('layers').delete(idx);
	transaction.objectStore('tiles').delete(window.IDBKeyRange.bound([idx, -Infinity, -Infinity, -Infinity], [idx + 1, -Infinity, -Infinity, -Infinity], false, true));
    },

    _doSetActiveLayer: function () {
	if (this._setActiveLayer) {
	    this._setActiveLayer = false;

	    if (this._mapLayer !== null) {
		this._map.removeLayer(this._mapLayer);
	    }

	    var center = this._map.getCenter();
	    var zoom = this._map.getZoom();
	    this._map.options.crs.setTileSize(this._tileSize);
	    this._map.invalidateSize({});
	    this._map.setView(center, zoom);

	    this._mapLayer = this._createMapLayer(this._cacheDB,
						  this._mapInfo[this._activeLayer]);
	    this._mapLayer.setOffline(this._offline);
	    this._mapLayer.addTo(this._map);
	}
    },

    _updateLayers: function () {
	var mapLayerSelect = document.getElementById('maplayerselect');
	while (mapLayerSelect.lastChild) {
	    mapLayerSelect.removeChild(mapLayerSelect.lastChild);
	}

	var layerList = document.getElementById('layers-list');
	while (layerList.lastChild) {
	    layerList.removeChild(layerList.lastChild);
	}

	for (var mapIdx in this._mapInfo) {
	    var opt = new Option(this._mapInfo[mapIdx].name, mapIdx);
	    if (mapIdx == this._activeLayer) {
		opt.selected = 'true';
	    }
	    mapLayerSelect.options[mapLayerSelect.options.length] = opt;

	    var li = document.createElement('li');
	    var aside = document.createElement('aside');
	    aside.setAttribute('class', 'pack-end arrow');
	    li.appendChild(aside);

	    var button = document.createElement('button');
	    button.textContent = this._mapInfo[mapIdx].name;

	    button.addEventListener('click', L.bind(function (idx) {
		this.doEditLayer(idx);
	    }, this, mapIdx), false);

	    li.appendChild(button);
	    layerList.appendChild(li);
	}
    },

    _updateStatistics: function () {
	var pt = this._pathTracker;

	document.getElementById('stats-distance').textContent =
	    this.formatDistance(pt.getLength(), '-');
	document.getElementById('stats-total-time').textContent =
	    this.formatDuration(pt.getTotalDuration(), '-');
	document.getElementById('stats-moving-time').textContent =
	    this.formatDuration(pt.getMoveDuration(), '-');
	document.getElementById('stats-moving-speed').textContent =
	    this.formatSpeed(pt.getLength() / pt.getMoveDuration(), '-');
	document.getElementById('stats-min-elevation').textContent =
	    (pt.getMinElevation() === Infinity) ? '-' :
	    this.formatElevation(pt.getMinElevation(), '-');
	document.getElementById('stats-max-elevation').textContent =
	    (pt.getMaxElevation() === -Infinity) ? '-' :
	    this.formatElevation(pt.getMaxElevation(), '-');
	document.getElementById('stats-elevation-gain').textContent =
	    this.formatElevation(pt.getElevationGain(), '-');
	document.getElementById('stats-elevation-loss').textContent =
	    this.formatElevation(pt.getElevationLoss(), '-');
    },

    doOpenCloseStats: function () {
	var mainView = document.getElementById('main-view');
	if (mainView.dataset.viewport !== undefined) {
	    delete mainView.dataset.viewport;
	} else {
	    this._updateStatistics();
	    this.doShowElevPlot();
	    mainView.dataset.viewport = 'side';
	}
    },

    _createGpx: function (trackSegs) {
	var dateString = new Date().toISOString();

	var data = [];
	data.push('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
		  '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="HikingMaps">\n');
	data.push('<metadata><link href="http://hikingmaps.cmeerw.org">' +
		  '<text>HikingMaps</text></link>' +
		  '<time>' + dateString + '</time></metadata>\n');
	data.push('<trk>\n');

	var len = trackSegs.length - (trackSegs[trackSegs.length - 1].length ? 0 : 1);
	for (var idx = 0; idx < len; idx++) {
	    var seg = trackSegs[idx];

	    data.push('<trkseg>\n');
	    for (var i in seg) {
		var point = seg[i];
		data.push('<trkpt lat="' + point.lat +
			  '" lon="' + point.lng + '">' +
			  ((point.alt !== undefined) ? ('<ele>' + point.alt + '</ele>') : '') +
			  '<time>' + new Date(point.ts).toISOString() + '</time>' +
			  '</trkpt>\n');
	    }
	    data.push('</trkseg>\n');
	}

	data.push('</trk></gpx>\n');
	var blob = new Blob(data, { 'type' : 'application/gpx+xml' });
	blob.name = dateString.replace(':', '-').replace(':', '-');
	return blob;
    },

    _shareGpx: function (blob) {
	var self = this;
	var activity = new MozActivity({ name: 'share',
					 data: {
					     type: 'application/gpx+xml',
					     number: 1,
					     blobs: [blob],
					     names: [blob.name],
					     filepaths: [null]
					 } });
	activity.onerror = function () {
	    if (activity.error.name == 'NO_PROVIDER') {
		// fall back to browser file handling
		self._saveGpx(blob);
		document.getElementById('share').click();
	    }
	};

	return false;
    },

    _saveGpx: function (blob) {
	var elem = document.getElementById('share');
	var gpxUrl = URL.createObjectURL(blob);
	elem.setAttribute('href', gpxUrl);
	elem.setAttribute('download', blob.name);
	return true;
    },

    doShareTrack: function () {
	var elem = document.getElementById('share');
	if (! elem.hasAttribute('href')) {
	    var blob = this._createGpx(this._trackLayer.getLatLngs());
	    if (this._useWebActivities) {
		return this._shareGpx(blob);
	    } else {
		return this._saveGpx(blob);
	    }
	}

	return true;
    }
});

var app = new Application();

if (navigator.mozSetMessageHandler !== undefined) {
    navigator.mozSetMessageHandler('activity', function(activityRequest) {
	var option = activityRequest.source;
	if (option.name === 'open') {
	    var blob = option.data.blob;

	    var trackFileName = document.getElementById('trackfilename');
	    var name = blob.name.split('/').pop().replace('.gpx', '');
	    trackFileName.setAttribute('value', name);
	    app.loadRoute(blob);
	}
    });
}
