function onSave(activity, sdcard, blob) {
    var fileName = document.getElementById('filename').value;
    var request = sdcard.addNamed(blob, 'tracks/' + fileName + '.gpx');
    request.onsuccess = function () {
	var name = this.result;
	activity.postResult(null);
    }
    request.onerror = function () {
	activity.postError('Unable to write file');
    }
}

navigator.mozSetMessageHandler('activity', function(activity) {
    var sdcard = navigator.getDeviceStorage('sdcard');
    var blob = activity.source.data.blobs[0];

    document.getElementById('close-btn').addEventListener('click', function () {
	activity.postError('closed');
    }, false);

    document.getElementById('save-btn').addEventListener('click', function () {
	onSave(activity, sdcard, blob);
    }, false);
    window.onsubmit = function () {
	onSave(activity, sdcard, blob);
	return false;
    }
});
