OpenLayers.Control.CacheDBWrite = OpenLayers.Class(OpenLayers.Control.CacheWrite, {

    db : null,

    onTileLoaded: function(evt) {
        if (this.active && !evt.aborted &&
                evt.tile instanceof OpenLayers.Tile.Image &&
                evt.tile.url.substr(0, 5) !== 'data:') {
            this.cache({tile: evt.tile});
            delete OpenLayers.Control.CacheDBWrite.urlMap[evt.tile.url];
        }
    },
    
    cache: function(obj) {
        if (this.db) {
            var tile = obj.tile;
            try {
                var canvasContext = tile.getCanvasContext();
                if (canvasContext) {
                    var urlMap = OpenLayers.Control.CacheDBWrite.urlMap;
                    var url = urlMap[tile.url] || tile.url;

		    var objStore = 'tilecache';
		    var transaction = this.db.transaction([objStore], "readwrite");
		    var request = transaction.objectStore(objStore).put(canvasContext.canvas.toDataURL(this.imageFormat), url);
		    request.onsuccess = function(event)
		    { };
		    request.onerror = function(event)
		    {
			this.events.triggerEvent("cachefull", {tile: tile});
		    };
		}
            } catch(e) {
                OpenLayers.Console.error(e.toString());
            }
        }
    },

    clearCache : function() {
	if (this.db) {
	    var objStore = 'tilecache';
	    var transaction = this.db.transaction([objStore], "readwrite");
	    var request = transaction.objectStore(objStore).clear();
	    request.onsuccess = function(event)
	    { };
	    request.onerror = function(event)
	    { };
	}
    },

    
    CLASS_NAME: "OpenLayers.Control.CacheDBWrite"
});

OpenLayers.Control.CacheDBWrite.urlMap = {};
