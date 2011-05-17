<?php
//die("<html><body><h1>Security precaution</h1> <p>To enable the test code, edit <file>Demos/".basename(__FILE__)."</file> and comment out line 2.</p></body></html>");

error_reporting(E_ALL | E_STRICT);

define("COMPACTCMS_CODE", true);
define('FILEMANAGER_CODE', true);


define('SITE_USES_ALIASES', 01);
define('DEVELOPMENT', 01);   // set to 01 / 1 to enable logging of each incoming event request.


require('FM-common.php');


/*
As AJAX calls cannot set cookies, we set up the session for the authentication demonstration right here; that way, the session cookie
will travel with every request.
*/
session_name('alt_session_name');
if (!session_start()) die('session_start() failed');





$browser = new FileManagerWithAliasSupport(array(
	'URLpath4FileManagedDirTree' => 'Files/',                   // relative paths: are relative to the URI request script path, i.e. dirname(__FILE__)
	//'URLpath4thumbnails' => 'Files/Thumbnails/',
	'URLpath4assets' => '../Assets',
	'chmod' => 0777,
	//'maxUploadSize' => 1024 * 1024 * 5,
	//'upload' => false,
	//'destroy' => false,
	//'create' => false,
	//'move' => false,
	//'download' => false,
	//'filter' => 'image/',
	'allowExtChange' => true,                  // allow file name extensions to be changed; the default however is: NO (FALSE)
	'UploadIsAuthorized_cb' => 'FM_IsAuthorized',
	'DownloadIsAuthorized_cb' => 'FM_IsAuthorized',
	'CreateIsAuthorized_cb' => 'FM_IsAuthorized',
	'DestroyIsAuthorized_cb' => 'FM_IsAuthorized',
	'MoveIsAuthorized_cb' => 'FM_IsAuthorized'

	// http://httpd.apache.org/docs/2.2/mod/mod_alias.html -- we only emulate the Alias statement. (Also useful for VhostAlias, BTW!)
	// Implementing other path translation features is left as an exercise to the reader:
	, 'Aliases' => array(
	//  '/c/lib/includes/js/mootools-filemanager/Demos/Files/alias' => "D:/xxx",
	//  '/c/lib/includes/js/mootools-filemanager/Demos/Files/d' => "D:/xxx.tobesorted",
	//  '/c/lib/includes/js/mootools-filemanager/Demos/Files/u' => "D:/websites-uploadarea",

	//  '/c/lib/includes/js/mootools-filemanager/Demos/Files' => "D:/experiment"
	)
));

