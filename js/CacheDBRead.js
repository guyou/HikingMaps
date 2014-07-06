OpenLayers.Control.CacheDBRead = OpenLayers.Class(OpenLayers.Control.CacheRead, {

    db : null,

    /**
     * Method: fetch
     * Listener to the <fetchEvent> event. Replaces a tile's url with a data
     * URI from the cache.
     *
     * Parameters:
     * evt - {Object} Event object with a tile property.
     */
    fetch: function(evt) {
        if (this.active && this.db &&
                evt.tile instanceof OpenLayers.Tile.Image) {
            var tile = evt.tile,
                url = tile.url;

            // deal with modified tile urls when both CacheDBWrite and CacheDBRead
            // are active
            if (!tile.layer.crossOriginKeyword && OpenLayers.ProxyHost &&
                    url.indexOf(OpenLayers.ProxyHost) === 0) {
                url = OpenLayers.Control.CacheDBWrite.urlMap[url];        
            }

	    var objStore = 'tilecache';
	    var transaction = this.db.transaction([objStore]);
	    var request = transaction.objectStore(objStore).get(url);
	    request.onsuccess = function(event)
	    {
		if (request.result && evt.type === "tileerror") {
		    tile.setImgSrc(request.result);
		    tile.onImageLoad();
                }
	    };
	    request.onerror = function(event)
	    { };
        }
    },
    
    CLASS_NAME: "OpenLayers.Control.CacheDBRead"
});
