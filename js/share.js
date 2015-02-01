function onSave(activity, sdcard, fileName, blob) {
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

    var sdcardSel = document.getElementById('sdcard-select');

    var sdcards = navigator.getDeviceStorages('sdcard');
    for (var idx in sdcards) {
	sdcardSel.options[sdcardSel.options.length] =
	    new Option(sdcards[idx].storageName, idx, sdcards[idx].default, sdcards[idx].default);
    }

    var filenameElem = document.getElementById('filename');
    filenameElem.value = name || '';

    document.getElementById('close-btn').addEventListener('click', function () {
	activity.postError('closed');
    }, false);

    function save() {
	var sdcard = sdcards[sdcardSel.value];
	var fileName = filenameElem.value;
	onSave(activity, sdcard, fileName, blob);
	return false;
    };

    document.getElementById('save-btn').addEventListener('click', save, false);
    window.onsubmit = save;
});
