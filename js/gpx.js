/**
 * Copyright (C) 2011-2012 Pavel Shramov
 * Copyright (C) 2013 Maxime Petazzoni <maxime.petazzoni@bulix.org>
 * All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * - Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/*
 * Thanks to Pavel Shramov who provided the initial implementation and Leaflet
 * integration. Original code was at https://github.com/shramov/leaflet-plugins.
 *
 * It was then cleaned-up and modified to record and make available more
 * information about the GPX track while it is being parsed so that the result
 * can be used to display additional information about the track that is
 * rendered on the Leaflet map.
 */

var _DEFAULT_MARKER_OPTS = {
  startIconUrl: 'pin-icon-start.png',
  endIconUrl: 'pin-icon-end.png',
  shadowUrl: 'pin-shadow.png',
  iconSize: [33, 50],
  shadowSize: [50, 50],
  iconAnchor: [16, 45],
  shadowAnchor: [16, 47]
};
var _DEFAULT_POLYLINE_OPTS = {
  color:'blue'
};
var _DEFAULT_WAYPOINT_MARKER_OPTS = {
  clickable: false
};
L.GPX = L.FeatureGroup.extend({
  initialize: function(gpx, options) {
    options.marker_options = this._merge_objs(
      _DEFAULT_MARKER_OPTS,
      options.marker_options || {});
    options.polyline_options = this._merge_objs(
      _DEFAULT_POLYLINE_OPTS,
      options.polyline_options || {});
    options.waypoint_marker_options = this._merge_objs(
      _DEFAULT_WAYPOINT_MARKER_OPTS,
      options.waypoint_marker_options || {});

    L.Util.setOptions(this, options);

    // Base icon class for track pins.
    L.GPXTrackIcon = L.Icon.extend({ options: options.marker_options });

    this._gpx = gpx;
    this._layers = {};
    this._info = {
      name: null, desc: null, author: null, copyright: null,
      length: 0.0
    };

    if (gpx) {
      this._parse(gpx, options, this.options.async);
    }
  },

  // Public methods
  get_name:            function() { return this._info.name; },
  get_desc:            function() { return this._info.desc; },
  get_author:          function() { return this._info.author; },
  get_copyright:       function() { return this._info.copyright; },
  get_distance:        function() { return this._info.length; },

  reload: function() {
    this.clearLayers();
    this._parse(this._gpx, this.options, this.options.async);
  },

  // Private methods
  _merge_objs: function(a, b) {
    var _ = {};
    for (var attr in a) { _[attr] = a[attr]; }
    for (var attr in b) { _[attr] = b[attr]; }
    return _;
  },

  _load_xml: function(url, cb, options, async) {
    if (async == undefined) async = this.options.async;
    if (options == undefined) options = this.options;

    var req = new window.XMLHttpRequest();
    req.open('GET', url, async);
    try {
      req.overrideMimeType('text/xml'); // unsupported by IE
    } catch(e) {}
    req.onreadystatechange = function() {
      if (req.readyState != 4) return;
      if(req.status == 200) cb(req.responseXML, options);
    };
    req.send(null);
  },

  _parse: function(input, options, async) {
    var _this = this;
    var cb = function(gpx, options) {
      var layers = _this._parse_gpx_data(gpx, options);
      if (!layers) return;
      _this.addLayer(layers);
      _this.fire('loaded');
    }
    if (input.substr(0,1)==='<') { // direct XML has to start with a <
      var parser = new DOMParser();
      setTimeout(function() {
        cb(parser.parseFromString(input, "text/xml"), options);
      });
    } else {
      this._load_xml(input, cb, options, async);
    }
  },

  _parse_gpx_data: function(xml, options) {
    var j, i, el, layers = [];
    var tags = [['rte','rtept'], ['trkseg','trkpt']];

    var name = xml.getElementsByTagName('name');
    if (name.length > 0) {
      this._info.name = name[0].textContent;
    }
    var desc = xml.getElementsByTagName('desc');
    if (desc.length > 0) {
      this._info.desc = desc[0].textContent;
    }
    var author = xml.getElementsByTagName('author');
    if (author.length > 0) {
      this._info.author = author[0].textContent;
    }
    var copyright = xml.getElementsByTagName('copyright');
    if (copyright.length > 0) {
      this._info.copyright = copyright[0].textContent;
    }

    for (j = 0; j < tags.length; j++) {
      el = xml.getElementsByTagName(tags[j][0]);
      for (i = 0; i < el.length; i++) {
        var coords = this._parse_trkseg(el[i], options, tags[j][1]);
        if (coords.length === 0) continue;

        // add track
        var l = new L.Polyline(coords, options.polyline_options);
        this.fire('addline', { line: l })
        layers.push(l);

        if (options.marker_options.startIconUrl) {
          // add start pin
          var p = new L.Marker(coords[0], {
            clickable: false,
              icon: new L.GPXTrackIcon({iconUrl: options.marker_options.startIconUrl})
          });
          this.fire('addpoint', { point: p });
          layers.push(p);
        }

        if (options.marker_options.endIconUrl) {
          // add end pin
          p = new L.Marker(coords[coords.length-1], {
            clickable: false,
            icon: new L.GPXTrackIcon({iconUrl: options.marker_options.endIconUrl})
          });
          this.fire('addpoint', { point: p });
          layers.push(p);
        }
      }
    }

    var coords = this._parse_trkseg(xml, options, 'wpt');
    if (coords.length > 0) {
      for (var idx in coords) {
        var p = new L.Marker(coords[idx], options.waypoint_marker_options);
        this.fire('addpoint', { point: p });
        layers.push(p);
      }
    }

    if (!layers.length) return;
    var layer = layers[0];
    if (layers.length > 1)
      layer = new L.FeatureGroup(layers);
    return layer;
  },

  _parse_trkseg: function(line, options, tag) {
    var el = line.getElementsByTagName(tag);
    if (!el.length) return [];
    var coords = [];
    var last = null;

    for (var i = 0; i < el.length; i++) {
      var _;
      _ = el[i].getElementsByTagName('ele');

      var ll = new L.LatLng(
        el[i].getAttribute('lat'),
        el[i].getAttribute('lon'),
	(_.length > 0) ? parseFloat(_[0].textContent) : undefined);
      ll.meta = { time: null, ele: null, hr: null };

      _ = el[i].getElementsByTagName('time');
      if (_.length > 0) {
        ll.ts = new Date(Date.parse(_[0].textContent));
      }

      if (last != null && tag != 'wpt') {
        this._info.length += last.distanceTo(ll);
      }

      last = ll;
      coords.push(ll);
    }

    return coords;
  },
});
