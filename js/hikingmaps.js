/* Global variables */

var mainDB;
var map;
var tracks;
var localizationchecktimer;
var firefoxOS=/Mobile;.*Firefox\/(\d+)/.exec(navigator.userAgent);
var mozL10n=navigator.mozL10n;

var pathlength = 0;

var trackControl = null;
var trackPolyline = null;
var trackingHandler = null;

document.getElementById("body").onload = WaitForLocalizationToLoad;


/* Function to initialize the database */

function InitializeDatabase(cb)
{
    var request = window.indexedDB.open("HikingMaps", 1);
    request.onerror = function(event)
    {
	cb(null);
    };
    request.onsuccess = function(event)
    {
	mainDB = request.result;
	cb(mainDB);
    };
    request.onupgradeneeded = function(event)
    {
	mainDB = request.result;
	var ver = mainDB.version || 0; // version is empty string for a new DB
	if (!mainDB.objectStoreNames.contains("tilecache"))
	{
	    var tilecacheStore = mainDB.createObjectStore("tilecache");
	}
	mainDB.onversionchange = function(event)
	{
	    mainDB.close();
	    mainDB = undefined;
	    InitializeDatabase();
	};
    };
}


/* Function to select a track file from the SD card */
function UpdateTrackFiles()
{
    var storage=navigator.getDeviceStorage("sdcard");
    if (storage)
    {
	var trackscursor=storage.enumerate("tracks");
	tracks=[];
	trackscursor.onerror=function()
	{
	    console.error("Error in Device Storage API",trackscursor.error.name);
	};
	trackscursor.onsuccess=function()
	{
	    if (!trackscursor.result)
	    {
		for (trackindex in tracks)
		{
		    document.getElementById('trackfileselect').options[document.getElementById('trackfileselect').options.length]=new Option(tracks[trackindex].name,trackindex);
		};
		return;
	    };
	    var file=trackscursor.result;
	    if (file.name.split('.').pop()=="gpx")
	    {
		tracks.push(file);
	    };
	    trackscursor.continue();
	    return;
	};
    };
    return false;
};

function NewTrackFile(f)
{
    if (trackControl != null)
    {
	map.removeLayer(trackControl);
    }

    reader=new FileReader();
    reader.onload=function(e)
    {
	trackControl = new L.GPX(e.target.result, {async: true}).on(
	    'loaded', function(e) {
		map.fitBounds(e.target.getBounds());
	    }).addTo(map);
	document.getElementById('track-length-display').textContent=trackControl.get_distance().toFixed(0);
    };
    reader.readAsText(f);
};

/* Function to open track file and launch recreation of track layer in a normal navigator (input type="file") */
function NewTrackFileByInput(evt)
{
    NewTrackFile(evt.target.files[0]);
}

/* Function to open track file and launch recreation of track layer in FirefoxOS (select) */
function NewTrackFileBySelect(evt)
{
    NewTrackFile(tracks[document.getElementById('trackfileselect').value]);
};

/* Function to animate position precision circle */
function PulsatePrecisionCircle(feature)
{
};

/* Funtion to draw position when updated */
function PositionUpdated(e)
{
    trackPolyline.addLatLng([e.coords.latitude, e.coords.longitude]);
    map.panTo([e.coords.latitude, e.coords.longitude]);

    var latlngs = trackPolyline.getLatLngs();
    if (latlngs.length >= 2)
    {
        pathlength += latlngs[latlngs.length - 2].distanceTo(latlngs[latlngs.length - 1]);
        document.getElementById('path-length-display').textContent=pathlength.toFixed(0);;
    }
};

/* Function to update position manually */

function ManualPositionUpdate()
{
    map.locate({setView: true, maxZoom: 16});
};

/* Play or pause automatic position update */

function PositionUpdatePlayPause()
{
    if (document.getElementById('locateplaypause').classList.contains('pause-btn'))
    {
	document.getElementById("locate").classList.remove('invisible');
	document.getElementById('locateplaypause').classList.remove('pause-btn');
	document.getElementById('locateplaypause').classList.add('play-btn');

	navigator.geolocation.clearWatch(trackingHandler);
	trackingHandler = null;
    }
    else
    {
	document.getElementById("locate").classList.add('invisible');
	document.getElementById('locateplaypause').classList.add('pause-btn');
	document.getElementById('locateplaypause').classList.remove('play-btn');

	trackingHandler = navigator.geolocation.watchPosition(
            function(position) { PositionUpdated(position); },
            function(err) { },
            {
		enableHighAccuracy: true,
		timeout: 60000,
		maximumAge: 0
            });
    };
};

/* Delete recorded way */
function WayDelete()
{
    pathlength = 0;
    document.getElementById('path-length-display').textContent='';
    map.removeLayer(trackPolyline);
    trackPolyline = L.polyline([], {opacity: 0.9}).addTo(map);
};

function ClearCache()
{
}

/* Function to open the Settings screen */

function OpenSettings()
{
    var container=document.getElementById('container');
    setTimeout(
	function()
	{
	    container.classList.add('opensettings');
	},
	300
    );
};

/* Function to close the Settings screen */

function EndSettings()
{
    if (document.getElementById("enablecache").checked)
    {
	//cacheWrite.activate();
    }
    else
    {
	//cacheWrite.deactivate();
    }

    container=document.getElementById('container');
    setTimeout(
	function()
	{
	    container.classList.add('closesettings');
	    setTimeout(
		function()
		{
		    container.classList.remove('opensettings')
		    container.classList.remove('closesettings');
		},
		500
	    );
	},
	300
    );
};

/* Wait for localization to be loaded */

function WaitForLocalizationToLoad()
{
    /* Activate timer */
    localizationchecktimer=setInterval(CheckLocalizationLoaded,100);
};

/* Check if localization is loaded */

function CheckLocalizationLoaded()
{
    /* Check a string */
    if (mozL10n.get('hiking-maps-title')!='')
    {
	/* Stop timer */
	clearInterval(localizationchecktimer);

	/* Initialize the application */
	InitializeDatabase(function (db)
			   {
			       InitializeApplication();
			   });
    };
};

/* Application initialization */

function InitializeApplication()
{
    /* Create map */
    map = L.map('map').setView([51.505, -0.09], 13);
    L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
	maxZoom: 18
    }).addTo(map);

    L.control.scale().addTo(map);

    trackPolyline = L.polyline([], {opacity: 0.9}).addTo(map);

    /* Add events to buttons */
    document.getElementById('locate').addEventListener('click',ManualPositionUpdate,false);
    document.getElementById('locateplaypause').addEventListener('click',PositionUpdatePlayPause,false);
    document.getElementById('waydelete').addEventListener('click',WayDelete,false);
    document.getElementById("menubutton").addEventListener('click',OpenSettings,false);
    document.getElementById("settingsokbutton").addEventListener('click',EndSettings,false);
    document.getElementById("clearcache").addEventListener('click',ClearCache,false);

    /* Define correct method for track file selection depending on system */
    if (firefoxOS)
    {
	UpdateTrackFiles();
	document.getElementById('trackfileselect').addEventListener('change',NewTrackFileBySelect,false);
	document.getElementById('trackfileitem').parentNode.removeChild(document.getElementById('trackfileitem'));
    }
    else
    {
	document.getElementById('trackfile').addEventListener('change',NewTrackFileByInput,false);
	document.getElementById('trackfileselectitem').parentNode.removeChild(document.getElementById('trackfileselectitem'));
    };
};
