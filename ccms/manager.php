<?php
/**
 * Copyright (C) 2008 - 2010 by Xander Groesbeek (CompactCMS.nl)
 * 
 * Last changed: $LastChangedDate$
 * @author $Author$
 * @version $Revision$
 * @package CompactCMS.nl
 * @license GNU General Public License v3
 * 
 * This file is part of CompactCMS.
 * 
 * CompactCMS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * CompactCMS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * A reference to the original author of CompactCMS and its copyright
 * should be clearly visible AT ALL TIMES for the user of the back-
 * end. You are NOT allowed to remove any references to the original
 * author, communicating the product to be your own, without written
 * permission of the original copyright owner.
 * 
 * You should have received a copy of the GNU General Public License
 * along with CompactCMS. If not, see <http://www.gnu.org/licenses/>.
 * 
 * > Contact me for any inquiries.
 * > E: Xander@CompactCMS.nl
 * > W: http://community.CompactCMS.nl/forum
**/

/* make sure no-one can run anything here if they didn't arrive through 'proper channels' */
if(!defined("COMPACTCMS_CODE")) { define("COMPACTCMS_CODE", 1); } /*MARKER*/

/*
We're only processing form requests / actions here, no need to load the page content in sitemap.php, etc. 
*/
if (!defined('CCMS_PERFORM_MINIMAL_INIT')) { define('CCMS_PERFORM_MINIMAL_INIT', true); }


// Define default location
if (!defined('BASE_PATH'))
{
	$base = str_replace('\\','/',dirname(dirname(dirname(dirname(dirname(dirname(__FILE__)))))));
	define('BASE_PATH', $base);
}

// Load basic configuration
/*MARKER*/require_once(BASE_PATH . '/lib/sitemap.php');




//error_reporting(E_ALL | E_STRICT);

// /*MARKER*/require_once(BASE_PATH . '/lib/includes/js/mootools-filemanager/Assets/Connector/FM4Alias.php');
/*MARKER*/require_once(BASE_PATH . '/lib/includes/js/mootools-filemanager/Assets/Connector/FileManager.php');


define('DEVELOPMENT', 01);   // set to 01 / 1 to enable logging of each incoming event request.





// dumper useful in development
function FM_vardumper($mgr = null, $action = null, $info = null, $filenamebase = null)
{
	if (DEVELOPMENT)
	{
		if (!is_string($filenamebase))
		{
			$filenamebase = basename(__FILE__);
		}

		if ($mgr)
			$settings = $mgr->getSettings();
		else
			$settings = null;

		//$mimetdefs = $mgr->getMimeTypeDefinitions();

		// log request data:
		ob_start();
			echo "FileManager::action:\n";
			var_dump($action);
			echo "\n\nFileManager::info:\n";
			var_dump($info);
			echo "\n\nFileManager::settings:\n";
			var_dump($settings);

			if (01) // set to 'if (01)' if you want this bit dumped as well; fastest back-n-forth edit that way :-)
			{
				echo "\n\n_SERVER:\n";
				var_dump($_SERVER);
			}
			if (0)
			{
				echo "\n\n_ENV:\n";
				if (isset($_ENV)) var_dump($_ENV); else echo "(null)\n";
			}
			if (01)
			{
				echo "\n\n_GET:\n";
				if (isset($_GET)) var_dump($_GET); else echo "(null)\n";
			}
			if (01)
			{
				echo "\n\n_POST:\n";
				if (isset($_POST)) var_dump($_POST); else echo "(null)\n";
			}
			if (01)
			{
				echo "\n\n_REQUEST:\n";
				if (isset($_REQUEST)) var_dump($_REQUEST); else echo "(null)\n";
			}
			if (01)
			{
				echo "\n\n_FILES:\n";
				if (isset($_FILES)) var_dump($_FILES); else echo "(null)\n";
			}
			if (01)
			{
				echo "\n\n_COOKIE:\n";
				if (isset($_COOKIE)) var_dump($_COOKIE); else echo "(null)\n";
			}
			if (0)
			{
				echo "\n\n_SESSION:\n";
				if (isset($_SESSION)) var_dump($_SESSION); else echo "(null)\n";
			}
		$dump = ob_get_clean();
		static $count;
		if (!$count) $count = 1; else $count++;
		$dst = ((!empty($filenamebase) ? $filenamebase . '.' : '') . date('Ymd-His') . '.' . fmod(microtime(true), 1) . '-' . $action . '-' . $count . '.log');
		$dst = preg_replace('/[^A-Za-z0-9-_.]+/', '_', $dst);    // make suitable for filesystem
		@file_put_contents($dst, html_entity_decode(strip_tags($dump), ENT_NOQUOTES, 'UTF-8'));
	}
}




/*
 * FileManager event callback: Please add your own authentication / authorization here.
 *
 * Note that this function serves as a custom callback for all FileManager
 * authentication/authorization requests, but you may of course provide
 * different functions for each of the FM callbacks.
 *
 * Return TRUE when the session/client is authorizaed to execute the action, FALSE
 * otherwise.
 *
 * TODO: allow customer code in here to edit the $fileinfo items and have those edits picked up by FM.
 *       E.g. changing the filename on write/move, fixing filename extensions based on file content sniffed mimetype, etc.
 */
function FM_IsAuthorized($mgr, $action, &$info)
{
	//$settings = $mgr->getSettings();
	//$mimetdefs = $mgr->getMimeTypeDefinitions();

	// log request data:
	FM_vardumper($mgr, $action, $info);


	/*
	 * authenticate / authorize:
	 * this sample is a bogus authorization, but you can perform simple to highly
	 * sophisticated authentications / authorizations here, e.g. even ones which also check permissions
	 * related to what is being uploaded right now (different permissions required for file mimetypes,
	 * e.g. images: any authorized user; while other file types which are more susceptible to carrying
	 * illicit payloads requiring at least 'power/trusted user' permissions, ...)
	 */

	switch ($action)
	{
	case 'upload':
		/*
		 *   $fileinfo = array(
		 *     'dir' => (string) directory where the uploaded file will be stored (filesystem absolute)
		 *     'name' => (string) the filename of the uploaded file (already cleaned and resequenced, without the file name extension
		 *     'extension' => (string) the file name extension (already cleaned as well, including 'safe' mode processing, i.e. any uploaded binary executable will have been assigned the extension '.txt' already)
		 *     'size' => (integer) number of bytes of the uploaded file
		 *     'maxsize' => (integer) the configured maximum number of bytes for any single upload
		 *     'mimes' => NULL or an array of mime types which are permitted to be uploaded. This is a reference to the array produced by $mgr->getAllowedMimeTypes().
		 *     'ext2mime_map' => an array of (key, value) pairs which can be used to map a file name extension (key) to a mime type (value). This is a reference to the array produced by $mgr->getAllowedMimeTypes().
		 *     'chmod' => (integer) UNIX access rights (default: 0666) for the directory-to-be-created (RW for user,group,world). Note that the eXecutable bits have already been stripped before the callback was invoked.
		 *   );
		 *
		 * Note that this request originates from a Macromedia Flash client: hence you'll need to use the
		 * $_GET['session'] value to manually set the PHP session_id() before you start your your session
		 * again. (Of course, this assumes you've set up the client side FileManager JS object to pass the
		 * session_id() in this 'session' request parameter.
		 *
		 * In examples provided with mootools_filemanager itself, the value is set to 'MySessionId'.
		 */
		if(!empty($_GET['session'])) return true;

		return false;

	case 'download':
		/*
		 *     $fileinfo = array(
		 *         'file' => (string) full path of the file (filesystem absolute)
		 *     );
		 */
		return true;

	case 'create': // create directory
		/*
		 *     $fileinfo = array(
		 *         'dir' => (string) parent directory: directory where the directory-to-be-created will exist (filesystem absolute)
		 *         'file' => (string) full path of the directory-to-be-created itself (filesystem absolute)
		 *         'chmod' => (integer) UNIX access rights (default: 0777) for the directory-to-be-created (RWX for user,group,world)
		 *     );
		 */
		return true;

	case 'destroy':
		/*
		 *     $fileinfo = array(
		 *         'dir' => (string) directory where the file / directory-to-be-deleted exists (filesystem absolute)
		 *         'file' => (string) the filename (with extension) of the file / directory to be deleted
		 *     );
		 */
		return true;

	case 'move':  // move or copy!
		/*
		 *     $fileinfo = array(
		 *         'dir' => (string) directory where the file / directory-to-be-moved/copied exists (filesystem absolute)
		 *         'file' => (string) the filename (with extension) of the file / directory to be moved/copied
		 *         'newdir' => NULL or (string) target directory: full path of directory where the file/directory will be moved/copied to. (filesystem absolute)
		 *         'newname' => NULL or (string) target path: full path of file/directory. This is the file location the file/.directory should be renamed/moved to. (filesystem absolute)
		 *         'rename' => (boolean) TRUE when a file/directory RENAME operation is requested (name change, staying within the same parent directory). FALSE otherwise.
		 *         'is_dir' => (boolean) TRUE when the subject is a directory itself, FALSE when it is a regular file.
		 *         'function' => (string) PHP call which will perform the operation. ('rename' or 'copy')
		 *     );
		 *
		 * on RENAME these path elements will be set: 'dir', 'file'            'newname'; 'rename' = TRUE, 'function' = 'rename'
		 * on MOVE   these path elements will be set: 'dir', 'file', 'newdir', 'newname'; 'rename' = TRUE, 'function' = 'rename'
		 * on COPY   these path elements will be set: 'dir', 'file'  'newdir', 'newname'; 'rename' = TRUE, 'function' = 'copy'
		 */
		return true;

	default:
		// unknown operation. Internal server error.
		return false;
	}
}


if (01) // debugging
{
	// fake a POST submit through a GET request so we can easily diag/debug event requests:
	if (!isset($_POST)) $_POST = array();
	foreach($_GET as $k => $v)
	{
		$_POST[$k] = $v;
	}
}



// the reason why TinyMCE invoked us (IFF it was TinyMCE!)
$req_type = getGETparam4IdOrNumber('editor_req_type');

/*
An alternative to handle the 'type' parameter passed by TinyMCE to the FileManager frontend, is to convert it in the frontend and then set the 'filter' FM option.
*/
$filter_expression = null;
switch ($req_type)
{
case 'image':
	$filter_expression = 'image/';
	break;
	
case 'media':
	$filter_expression = 'video/';
	break;
}


$browser = new FileManager(array(
	'directory' => BASE_PATH . '/media/',                // relative paths: are relative to the URI request script path, i.e. dirname(__FILE__)
	'thumbnailPath' => $cfg['rootdir'] . '/media/Thumbnails/',
	'assetBasePath' => $cfg['rootdir'] . '/lib/includes/js/mootools-filemanager/Assets',
	'chmod' => 0777,
	//'maxUploadSize' => 1024 * 1024 * 5,
	//'upload' => false,
	//'destroy' => false,
	//'create' => false,
	//'move' => false,
	//'download' => false,
	'filter' => $filter_expression,
	'allowExtChange' => true,                  // allow file name extensions to be changed; the default however is: NO (FALSE)
	'UploadIsAuthorized_cb' => 'FM_IsAuthorized',
	'DownloadIsAuthorized_cb' => 'FM_IsAuthorized',
	'CreateIsAuthorized_cb' => 'FM_IsAuthorized',
	'DestroyIsAuthorized_cb' => 'FM_IsAuthorized',
	'MoveIsAuthorized_cb' => 'FM_IsAuthorized'
	
	// http://httpd.apache.org/docs/2.2/mod/mod_alias.html -- we only emulate the Alias statement.
	// Implementing other path translation features is left as an exercise to the reader:
	, 'Aliases' => array(
		'/c/lib/includes/js/mootools-filemanager/Demos/Files/alias' => "D:/xxx",
		'/c/lib/includes/js/mootools-filemanager/Demos/Files/d' => "D:/xxx.tobesorted",
		'/c/lib/includes/js/mootools-filemanager/Demos/Files' => "D:/experiment"
	)
));




// log request data:
FM_vardumper($browser, 'init' . getGETparam4IdOrNumber('event'));




$browser->fireEvent(getGETparam4IdOrNumber('event'));

