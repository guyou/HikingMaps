/*
 * HikingMaps, http://hikingmaps.cmeerw.org
 * Copyright (C) 2014, Christof Meerwald
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

    addSegment: function () {
	if (this._latlngs[this._latlngs.length - 1].length) {
	    this._latlngs.push([]);
	}
    },

    addLatLng: function (latlng) {
	latlng = L.latLng(latlng);
	this._latlngs[this._latlngs.length - 1].push(latlng);
	this._bounds.extend(latlng);
	return this.redraw();
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
			var etag = xhr.getResponseHeader('ETag');

			self._db.put(url, blob, etag);
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
	this._mapLat = window.localStorage.getItem('map-lat');
	this._mapLng = window.localStorage.getItem('map-lng');
	this._mapZoom = window.localStorage.getItem('map-zoom');

	this._useWebActivities = (window.MozActivity !== undefined) &&
	    (navigator.getDeviceStorage !== undefined);

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
	this._pathTracker = null;

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

	this._map = L.map('map', { zoomControl: false });
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

	var cacheDB = new TileCacheDb(this._db);

	this._createTrack();

	document.getElementById('show-elev-plot').addEventListener('click',
								   L.bind(this.doShowElevPlot, this), false);
	document.getElementById('elevation-plot').addEventListener('click', function () {
		document.getElementById('elevation-plot').classList.add('invisible');
	}, false);

	document.getElementById('locate').addEventListener('click',
							   L.bind(this.doLocate, this), false);
	document.getElementById('recordplaypause').addEventListener('click', L.bind(this.doRecordPlayPause, this), false);
	document.getElementById('trackdelete').addEventListener('click', L.bind(this.doDeleteTrack, this), false);
	document.getElementById('share').addEventListener('click', this._useWebActivities
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
	    a.onerror = function() { console.log('Failure when trying to pick a file'); };
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

	document.getElementById(this._useWebActivities ? 'trackfilepickitem' : 'trackfileitem').classList.remove('invisible');

	var mapLayerSelect = document.getElementById('maplayerselect');
	for (var mapIdx in mapInfo) {
	    mapLayerSelect.options[mapLayerSelect.options.length] =
		new Option(mapInfo[mapIdx].name, mapIdx);
	}

	if (this._activeLayer < mapLayerSelect.options.length) {
	    mapLayerSelect.options[this._activeLayer].selected = 'true';
	} else {
	    this._activeLayer = 0;
	}

	this._mapLayer = this._createMapLayer(cacheDB,
					      mapInfo[this._activeLayer]);
	this._mapLayer.setOffline(this._offline);
	this._mapLayer.addTo(this._map);

	document.getElementById('maplayerselect').addEventListener('change', function (e) {
	    self._activeLayer = mapLayerSelect.value;
	    window.localStorage.setItem('active-layer', self._activeLayer.toString());

	    self._map.removeLayer(self._mapLayer);
	    self._mapLayer = self._createMapLayer(cacheDB,
						  mapInfo[self._activeLayer]);
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

    _createMapLayer: function (db, info) {
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
	var isStationary = (e.coords.speed === 0) ||
	    ((e.coords.heading !== null) && isNaN(e.coords.heading));
	var isNewSeg = this._pathTracker.onPosition(isStationary, e.timestamp, e.coords);

	if (isNewSeg) {
	    this._trackLayer.addSegment();
	}

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

    doShowElevPlot: function () {
	var canvas = document.getElementById('elevation-plot');
	canvas.classList.remove('invisible');

	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	var ctx = canvas.getContext('2d');
	ctx.lineWidth = 1;

	var minElev = this._pathTracker.getMinElevation();
	var maxElev = this._pathTracker.getMaxElevation();
	var length = this._pathTracker.getLength();
	var latlngs = this._trackLayer.getLatLngs();

	if (minElev >= maxElev) {
	    return;
	}

	ctx.beginPath();
	ctx.moveTo(40, 10);
	ctx.lineTo(40, canvas.height - 20);
	ctx.lineTo(canvas.width - 10, canvas.height - 20);
	ctx.strokeStyle = '#222';
	ctx.stroke();

	ctx.beginPath();

	var dist = 0;
	for (var j in latlngs) {
	    var prev = null;

	    for (var i in latlngs[j]) {
		var point = latlngs[j][i];

		var y = ((point.alt < minElev)
			 ? minElev : ((point.alt > maxElev)
				      ? maxElev : point.alt)) - minElev;
		y = (y / (maxElev - minElev)) * (canvas.height - 30);

		if (prev !== null) {
		    dist += prev.distanceTo(point);
		}

		var x = (dist / length) * (canvas.width - 50);

		if (prev !== null) {
		    ctx.lineTo(x + 40, canvas.height - y - 20);
		} else {
		    ctx.moveTo(x + 40, canvas.height - y - 20);
		}

		prev = point;
	    }
	}

	ctx.strokeStyle = '#119';
	ctx.stroke();
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
		'(' + this.formatDistance(this._routeLayer.get_distance(), '') + ')';
	}
	document.getElementById('track-length').textContent =
	    this.formatDistance(this._pathTracker.getLength(), '');
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
			  ((point.alt !== null) ? ('<ele>' + point.alt + '</ele>') : '') +
			  '<time>' + new Date(point.ts).toISOString() + '</time>' +
			  '</trkpt>\n');
	    }
	    data.push('</trkseg>\n');
	}

	data.push('</trk></gpx>\n');
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
