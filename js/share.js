function onSave(activity, blob) {
    var fileName = document.getElementById('filename').value;
    var sdcard = navigator.getDeviceStorage('sdcard');
    var request = sdcard.addNamed(blob, 'tracks/' + fileName + '.gpx');
    request.onsuccess = function () {
	var name = this.result;
	activity.postResult(null);
    }
    request.onerror = function () {
	var elem = document.getElementById('status-error');
	elem.classList.remove('invisible');
	window.setTimeout(function () {
	    elem.classList.add('invisible');
	}, 5000);
    }
}

navigator.mozSetMessageHandler('activity', function(activity) {
    var blob = activity.source.data.blobs[0];
    var name = activity.source.data.names && activity.source.data.names[0];

    document.getElementById('filename').value = name || '';

    document.getElementById('close-btn').addEventListener('click', function () {
	activity.postError('closed');
    }, false);

    document.getElementById('save-btn').addEventListener('click', function () {
	onSave(activity, blob);
    }, false);
    window.onsubmit = function () {
	onSave(activity, blob);
	return false;
    }
});
