navigator.mozSetMessageHandler('activity', function(a) {
    var sdcard = navigator.getDeviceStorage('sdcard');
    var blob = a.source.data.blobs[0];

    document.getElementById('close-btn').addEventListener('click', function () {
	a.postError('closed');
    }, false);

    document.getElementById('save-btn').addEventListener('click', function () {
	var fileName = document.getElementById('filename').value;
	var request = sdcard.addNamed(blob, 'tracks/' + fileName + '.gpx');
	request.onsuccess = function () {
	    var name = this.result;
	    console.log('File "' + name + '" successfully written');
	    a.postResult(null);
	}
	request.onerror = function () {
	    console.warn('Unable to write the file: ' + this.error);
	    a.postError('Unable to write file');
	}
    }, false);
});
