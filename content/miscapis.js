function GM_ScriptStorage(script) {
  this.prefMan = new GM_PrefManager(script.prefroot);
}

GM_ScriptStorage.prototype.setValue = function(name, val) {
  if (2 !== arguments.length) {
    throw new Error("Second argument not specified: Value");
  }

  if (!GM_apiLeakCheck("GM_setValue")) {
    return;
  }

  this.prefMan.setValue(name, val);
};

GM_ScriptStorage.prototype.getValue = function(name, defVal) {
  if (!GM_apiLeakCheck("GM_getValue")) {
    return undefined;
  }

  return this.prefMan.getValue(name, defVal);
};

GM_ScriptStorage.prototype.deleteValue = function(name) {
  if (!GM_apiLeakCheck("GM_deleteValue")) {
    return undefined;
  }

  return this.prefMan.remove(name);
};

GM_ScriptStorage.prototype.listValues = function() {
  if (!GM_apiLeakCheck("GM_listValues")) {
    return undefined;
  }

  return this.prefMan.listValues();
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_Resources(script){
  this.script = script;
}

GM_Resources.prototype.getResourceURL = function(name) {
  if (!GM_apiLeakCheck("GM_getResourceURL")) {
    return undefined;
  }

  return this.getDep_(name).dataContent;
};

GM_Resources.prototype.getResourceText = function(name) {
  if (!GM_apiLeakCheck("GM_getResourceText")) {
    return undefined;
  }

  return this.getDep_(name).textContent;
};

GM_Resources.prototype.getDep_ = function(name) {
  var resources = this.script.resources;
  for (var i = 0, resource; resource = resources[i]; i++) {
    if (resource.name == name) {
      return resource;
    }
  }

  throw new Error("No resource with name: " + name); // NOTE: Non localised string
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_ScriptLogger(script) {
  var namespace = script.namespace;

  if (namespace.substring(namespace.length - 1) != "/") {
    namespace += "/";
  }

  this.prefix = [namespace, script.name, ": "].join("");
}

GM_ScriptLogger.prototype.log = function(message) {
  GM_log(this.prefix + message, true);
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_addStyle(doc, css) {
  var head = doc.getElementsByTagName("head")[0];
  if (head) {
    var style = doc.createElement("style");
    style.textContent = css;
    style.type = "text/css";
    head.appendChild(style);
  }
  return style;
}

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_console(script) {
  // based on http://www.getfirebug.com/firebug/firebugx.js
  var names = [
    "debug", "warn", "error", "info", "assert", "dir", "dirxml",
    "group", "groupEnd", "time", "timeEnd", "count", "trace", "profile",
    "profileEnd"
  ];

  for (var i=0, name; name=names[i]; i++) {
    this[name] = function() {};
  }

  // Important to use this private variable so that user scripts can't make
  // this call something else by redefining <this> or <logger>.
  var logger = new GM_ScriptLogger(script);
  this.log = function() {
    logger.log(
      Array.prototype.slice.apply(arguments).join("\n")
    );
  };
}

GM_console.prototype.log = function() {
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_chooseSaveLocation(script) {
  this._script = script;
  this.prefMan = new GM_PrefManager(script.savePaths);

  this._win = Cc['@mozilla.org/appshell/window-mediator;1']
    .getService(Ci.nsIWindowMediator)
    .getMostRecentWindow("navigator:browser");

  this._fp = Cc["@mozilla.org/filepicker;1"]
    .createInstance(Ci.nsIFilePicker);
}

GM_chooseSaveLocation.prototype.choose = function(pathKey) {
  if (!GM_apiLeakCheck("GM_chooseSaveLocation")) return;

  // TODO: localize this string
  this._fp.init(this._win, "Choose where " + this._script.name + " may download files...", 
      Ci.nsIFilePicker.modeGetFolder);
  this._fp.appendFilters(Ci.nsIFilePicker.filterAll);

  if (this._fp.show() == Ci.nsIFilePicker.returnOK) {
    if (pathKey) this.prefMan.setValue(pathKey, this._fp.file.path);
    return this._fp.file;
  } else {
    return null;
  }
};

GM_chooseSaveLocation.prototype.saveFile = function() {
  // TODO: localize this string
  this._fp.init(this._win, "Choose where " + this._script.name + " may save this file...", 
      Ci.nsIFilePicker.modeSave);
  this._fp.appendFilters(Ci.nsIFilePicker.filterAll);

  if (this._fp.show() == Ci.nsIFilePicker.returnOK) {
    return this._fp.file;
  } else {
    return null;
  }
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_downloadFile(script) {
  this._script = script;
}

GM_downloadFile.prototype.download = function(url, pathKey, name, overwritePath) {
  if (!GM_apiLeakCheck("GM_downloadFile")) return;

  var uri = GM_uriFromUrl(url);
  var picker = new GM_chooseSaveLocation(this._script, true);
  var file = null;

  if (!uri || uri.scheme == "file") return;

  // If pathKey is specified retrieve the path
  if (pathKey) {
    var path = picker.prefMan.getValue(pathKey);

    // If the pathKey is not defined, ask the user
    if (overwritePath || "undefined" == typeof path) {
      file = picker.choose(pathKey);
    } else {
      file = Cc["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsILocalFile);  
      file.initWithPath(path);
    }
  }

  // If save location isn't specified or it's invalid
  // ask the user to choose a save location
  if (!pathKey || !file.exists()) {
    file = picker.choose(pathKey);
  }

  // We don't know where to save so we must abort
  if (!file) return;

  // If the name for the new file isn't given, use the remote filename
  if (!name) {
    var lastSlash = uri.path.lastIndexOf("/");
    if (lastSlash > 0 && lastSlash < uri.path.length - 1) {
      var name = uri.path.substring(lastSlash + 1);

      // Get rid of the query part
      var qsplit = name.split('?');
      if (qsplit.length > 1) name = qsplit[0];
    } else {
      // Let the user pick the filename
      var file = picker.saveFile();
      if (!file) return;
    }
  }

  // Create a unique name so we don't overwrite files
  file.append(name);
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0644);

  // Get the iterface goop
  const nsIWBP = Ci.nsIWebBrowserPersist;
  const nsIDM = Ci.nsIDownloadManager;

  var dm = Cc["@mozilla.org/download-manager;1"]
    .getService(nsIDM);

  var persist = Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
    .createInstance(Ci.nsIWebBrowserPersist);
  persist.persistFlags = nsIWBP.PERSIST_FLAGS_BYPASS_CACHE;

  // Add the download to the manager
  var dl = dm.addDownload(nsIDM.DOWNLOAD_TYPE_DOWNLOAD,
    uri,
    GM_getUriFromFile(file),
    file.leafName,
    null,
    new Date(),
    null,
    persist);

  persist.progressListener = dl;

  // Initialize the download
  persist.saveURI(uri, null, null, null, null, file);
};
