// JSM exported symbols
var EXPORTED_SYMBOLS = [
  "GM_GUID",
  "GM_alert",
  "GM_stringBundle",
  "GM_isDef",
  "GM_getConfig",
  "GM_hitch",
  "GM_listen",
  "GM_unlisten",
  "GM_logError",
  "GM_log",
  "GM_openInEditor",
  "GM_getEditor",
  "GM_launchApplicationWithDoc",
  "GM_parseScriptName",
  "GM_getTempFile",
  "GM_getBinaryContents",
  "GM_getContents",
  "GM_getWriteStream",
  "GM_getUriFromFile",
  "GM_compareVersions",
  "GM_isGreasemonkeyable",
  "GM_getEnabled",
  "GM_setEnabled",
  "GM_uriFromUrl",
  "GM_sha1",
  "GM_memoize",
  "GM_newUserScript"
];

const Cu = Components.utils;
Cu.import("resource://greasemonkey/constants.js");
Cu.import("resource://greasemonkey/prefmanager.js");

const GM_GUID = "{e4a8a97b-f2ed-450b-b12d-ee082ba24781}";

const consoleService = Cc["@mozilla.org/consoleservice;1"]
                           .getService(Ci.nsIConsoleService);

function GM_alert(msg) {
  Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService)
    .alert(null, "Greasemonkey alert", msg);
}

var GM_stringBundle = Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService)
    .createBundle("chrome://greasemonkey/locale/gm-browser.properties");

function GM_isDef(thing) {
  return typeof(thing) != "undefined";
}

function GM_getConfig() {
  return gmService.config;
}

function GM_hitch(obj, meth) {
  if (!obj[meth]) {
    throw "method '" + meth + "' does not exist on object '" + obj + "'";
  }

  var staticArgs = Array.prototype.splice.call(arguments, 2, arguments.length);

  return function() {
    // make a copy of staticArgs (don't modify it because it gets reused for
    // every invocation).
    var args = Array.prototype.slice.call(staticArgs);

    // add all the new arguments
    Array.prototype.push.apply(args, arguments);

    // invoke the original function with the correct this obj and the combined
    // list of static and dynamic arguments.
    return obj[meth].apply(obj, args);
  };
}

function GM_listen(source, event, listener, opt_capture) {
  Cu.lookupMethod(source, "addEventListener")(event, listener, opt_capture);
}

function GM_unlisten(source, event, listener, opt_capture) {
  Cu.lookupMethod(source, "removeEventListener")(event, listener, opt_capture);
}

/**
 * Utility to create an error message in the log without throwing an error.
 */
function GM_logError(e, opt_warn, fileName, lineNumber) {
  var consoleError = Cc["@mozilla.org/scripterror;1"]
    .createInstance(Ci.nsIScriptError);

  var flags = opt_warn ? 1 : 0;

  // third parameter "sourceLine" is supposed to be the line, of the source,
  // on which the error happened.  we don't know it. (directly...)
  consoleError.init(e.message, fileName, null, lineNumber,
                    e.columnNumber, flags, null);

  consoleService.logMessage(consoleError);
}

function GM_log(message, force) {
  if (force || GM_prefRoot.getValue("logChrome", false)) {
    consoleService.logStringMessage(message);
  }
}

// TODO: this stuff was copied wholesale and not refactored at all. Lots of
// the UI and Config rely on it. Needs rethinking.

function GM_openInEditor(script, parentWindow) {
  var file = script.editFile;
  var editor = GM_getEditor(parentWindow);
  if (!editor) {
    // The user did not choose an editor.
    return;
  }

  try {
    GM_launchApplicationWithDoc(editor, file);
  } catch (e) {
    // Something may be wrong with the editor the user selected. Remove so that
    // next time they can pick a different one.
    GM_alert(GM_stringBundle.GetStringFromName("editor.could_not_launch") + "\n" + e);
    GM_prefRoot.remove("editor");
    throw e;
  }
}

function GM_getEditor(parentWindow, change) {
  var editorPath = GM_prefRoot.getValue("editor");

  if (!change && editorPath) {
    GM_log("Found saved editor preference: " + editorPath);

    var editor = Cc["@mozilla.org/file/local;1"]
                 .createInstance(Ci.nsILocalFile);
    editor.followLinks = true;
    editor.initWithPath(editorPath);

    // make sure the editor preference is still valid
    if (editor.exists() && editor.isExecutable()) {
      return editor;
    } else {
      GM_log("Editor preference either does not exist or is not executable");
      GM_prefRoot.remove("editor");
    }
  }

  // Ask the user to choose a new editor. Sometimes users get confused and
  // pick a non-executable file, so we set this up in a loop so that if they do
  // that we can give them an error and try again.
  while (true) {
    GM_log("Asking user to choose editor...");
    var nsIFilePicker = Ci.nsIFilePicker;
    var filePicker = Cc["@mozilla.org/filepicker;1"]
                         .createInstance(nsIFilePicker);

    filePicker.init(parentWindow,
                    GM_stringBundle.GetStringFromName("editor.prompt"),
                    nsIFilePicker.modeOpen);
    filePicker.appendFilters(nsIFilePicker.filterApplication);
    filePicker.appendFilters(nsIFilePicker.filterAll);

    if (filePicker.show() != nsIFilePicker.returnOK) {
      // The user canceled, return null.
      GM_log("User canceled file picker dialog");
      return null;
    }

    GM_log("User selected: " + filePicker.file.path);

    if (filePicker.file.exists() && filePicker.file.isExecutable()) {
      GM_prefRoot.setValue("editor", filePicker.file.path);
      return filePicker.file;
    } else {
      GM_alert(GM_stringBundle.GetStringFromName("editor.please_pick_executable"));
    }
  }
}

function GM_launchApplicationWithDoc(appFile, docFile) {
  var args = [docFile.path];

  // For the mac, wrap with a call to "open".
  var xulRuntime = Cc["@mozilla.org/xre/app-info;1"]
                       .getService(Ci.nsIXULRuntime);

  if ("Darwin" == xulRuntime.OS) {
    args = ["-a", appFile.path, docFile.path];

    appFile = Cc["@mozilla.org/file/local;1"]
                  .createInstance(Ci.nsILocalFile);
    appFile.followLinks = true;
    appFile.initWithPath("/usr/bin/open");
  }

  var process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
  process.init(appFile);
  process.run(false, args, args.length);
}

function GM_parseScriptName(sourceUri) {
  var name = sourceUri.spec;
  name = name.substring(0, name.indexOf(".user.js"));
  name = name.substring(name.lastIndexOf("/") + 1);
  return name;
}

function GM_getTempFile() {
  var file = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties)
        .get("TmpD", Ci.nsILocalFile);

  file.append("gm-temp");
  file.createUnique(
    Ci.nsILocalFile.NORMAL_FILE_TYPE,
    0640
  );

  return file;
}

function GM_getBinaryContents(file) {
    var channel = ioService.newChannelFromURI(GM_getUriFromFile(file));
    var input = channel.open();

    var bstream = Cc["@mozilla.org/binaryinputstream;1"]
                            .createInstance(Ci.nsIBinaryInputStream);
    bstream.setInputStream(input);

    var bytes = bstream.readBytes(bstream.available());

    return bytes;
}

function GM_getContents(file, charset) {
  if( !charset ) {
    charset = "UTF-8"
  }
  var scriptableStream = Cc["@mozilla.org/scriptableinputstream;1"]
    .getService(Ci.nsIScriptableInputStream);
  // http://lxr.mozilla.org/mozilla/source/intl/uconv/idl/nsIScriptableUConv.idl
  var unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
    .createInstance(Ci.nsIScriptableUnicodeConverter);
  unicodeConverter.charset = charset;

  var channel = ioService.newChannelFromURI(GM_getUriFromFile(file));
  try {
    var input=channel.open();
  } catch (e) {
    GM_logError(new Error("Could not open file: " + file.path));
    return "";
  }

  scriptableStream.init(input);
  var str=scriptableStream.read(input.available());
  scriptableStream.close();
  input.close();

  try {
    return unicodeConverter.ConvertToUnicode(str);
  } catch( e ) {
    return str;
  }
}

function GM_getWriteStream(file) {
  var stream = Cc["@mozilla.org/network/file-output-stream;1"]
                   .createInstance(Ci.nsIFileOutputStream);

  stream.init(file, 0x02 | 0x08 | 0x20, 420, -1);

  return stream;
}

function GM_getUriFromFile(file) {
  return ioService.newFileURI(file);
}

// Todo: replace with nsIVersionComparator?
/**
 * Compares two version numbers
 *
 * @param {String} aV1 Version of first item in 1.2.3.4..9. format
 * @param {String} aV2 Version of second item in 1.2.3.4..9. format
 *
 * @returns {Int}  1 if first argument is higher
 *                 0 if arguments are equal
 *                 -1 if second argument is higher
 */
function GM_compareVersions(aV1, aV2) {
  var v1 = aV1.split(".");
  var v2 = aV2.split(".");
  var numSubversions = (v1.length > v2.length) ? v1.length : v2.length;

  for (var i = 0; i < numSubversions; i++) {
    if (typeof v2[i] == "undefined") {
      return 1;
    }

    if (typeof v1[i] == "undefined") {
      return -1;
    }

    if (parseInt(v2[i], 10) > parseInt(v1[i], 10)) {
      return -1;
    } else if (parseInt(v2[i], 10) < parseInt(v1[i], 10)) {
      return 1;
    }
  }

  // v2 was never higher or lower than v1
  return 0;
}

function GM_isGreasemonkeyable(url) {
  var scheme = ioService.extractScheme(url);

  switch (scheme) {
    case "http":
    case "https":
    case "ftp":
    case "data":
      return true;
    case "about":
      // Always allow "about:blank".
      if (/^about:blank/.test(url)) return true;
      // Conditionally allow the rest of "about:".
      return GM_prefRoot.getValue('aboutIsGreaseable');
    case "file":
      return GM_prefRoot.getValue('fileIsGreaseable');
    case "unmht":
      return GM_prefRoot.getValue('unmhtIsGreaseable');
  }

  return false;
}

function GM_getEnabled() {
  return GM_prefRoot.getValue("enabled", true);
}

function GM_setEnabled(enabled) {
  GM_prefRoot.setValue("enabled", enabled);
}

function GM_uriFromUrl(url, baseUrl) {
  var baseUri = null;
  if (baseUrl) baseUri = GM_uriFromUrl(baseUrl);
  try {
    return ioService.newURI(url, null, baseUri);
  } catch (e) {
    return null;
  }
}
GM_uriFromUrl = GM_memoize(GM_uriFromUrl);

// UTF-8 encodes input, SHA-1 hashes it and returns the 40-char hex version.
function GM_sha1(unicode) {
  var unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
  unicodeConverter.charset = "UTF-8";

  var data = unicodeConverter.convertToByteArray(unicode, {});
  var ch = Cc["@mozilla.org/security/hash;1"]
      .createInstance(Ci.nsICryptoHash);
  ch.init(ch.SHA1);
  ch.update(data, data.length);
  var hash = ch.finish(false); // hash as raw octets

  var hex = [];
  for (var i = 0; i < hash.length; i++) {
    hex.push( ("0" + hash.charCodeAt(i).toString(16)).slice(-2) );
  }
  return hex.join('');
}
GM_sha1 = GM_memoize(GM_sha1);

// Decorate a function with a memoization wrapper, with a limited-size cache
// to reduce peak memory utilization.  Simple usage:
//
// function foo(arg1, arg2) { /* complex operation */ }
// foo = GM_memoize(foo);
//
// The memoized function may have any number of arguments, but they must be
// be serializable, and uniquely.  It's safest to use this only on functions
// that accept primitives.
function GM_memoize(func, limit) {
  limit = limit || 3000;
  var cache = {__proto__: null};
  var keylist = [];

  return function(a) {
    var args = Array.prototype.slice.call(arguments);
    var key = uneval(args);
    if (key in cache) return cache[key];

    var result = func.apply(null, args);

    cache[key] = result;

    if (keylist.push(key) > limit) delete cache[keylist.shift()];

    return result;
  }
}

function GM_newUserScript(parentWindow) {
  var windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
    .getService(Ci.nsIWindowWatcher);
  windowWatcher.openWindow(
    parentWindow, "chrome://greasemonkey/content/newscript.xul", null,
    "chrome,dependent,centerscreen,resizable,dialog", null
  );
};
