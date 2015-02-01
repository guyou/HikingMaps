function getFiles (sdcards, idx, elem, path, selectedFn) {
    if (idx < sdcards.length) {
	var cursor = sdcards[idx].enumerate(path);

	cursor.onerror = function() {
	    console.error('Error in Device Storage API', cursor.error.name);
	    getFiles(sdcards, idx + 1, elem, path, selectedFn);
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
	    } else {
		getFiles(sdcards, idx + 1, elem, path, selectedFn);
	    }
	};
    }
}

navigator.mozSetMessageHandler('activity', function(a) {
    document.getElementById('close-btn').addEventListener('click', function () {
	a.postError('closed');
    }, false);

    var sdcards = navigator.getDeviceStorages('sdcard');
    getFiles(sdcards, 0, document.getElementById('files-tracks'), 'tracks',
	     function (blob) { a.postResult({ type: 'application/gpx+xml',
					      blob: blob }); });

    getFiles(sdcards, 0, document.getElementById('files-download'), 'Download',
	     function (blob) { a.postResult({ type: 'application/gpx+xml',
					      blob: blob }); });

    getFiles(sdcards, 0, document.getElementById('files-download'), 'downloads',
	     function (blob) { a.postResult({ type: 'application/gpx+xml',
					      blob: blob }); });
});
