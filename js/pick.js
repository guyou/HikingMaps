function getFiles (elem, path, selectedFn) {
    var storage = navigator.getDeviceStorage('sdcard');
    if (storage) {
	var cursor = storage.enumerate(path);

	cursor.onerror = function() {
	    console.error('Error in Device Storage API', cursor.error.name);
	};
	cursor.onsuccess = function() {
	    if (cursor.result) {
	    	var file = cursor.result;
		if (file.name.split('.').pop() == 'gpx') {
		    var name = file.name.split('/').pop().replace('.gpx', '');
		    var li = document.createElement('li');
		    var button = document.createElement('button');
		    button.textContent = name;
		    button.addEventListener('click', function () {
			selectedFn(file);
		    }, false);

		    li.appendChild(button);
		    elem.appendChild(li);
		}
		cursor.continue();
	    }
	};
    }
}

navigator.mozSetMessageHandler('activity', function(a) {
    document.getElementById('close-btn').addEventListener('click', function () {
	a.postError('closed');
    }, false);

    getFiles(document.getElementById('files-tracks'), 'tracks',
	     function (blob) { a.postResult({ type: "application/gpx+xml",
					      blob: blob }); });

    getFiles(document.getElementById('files-download'), 'Download',
	     function (blob) { a.postResult({ type: "application/gpx+xml",
					      blob: blob }); });
});
