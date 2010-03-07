function GM_ScriptStorage(script) {
  this.prefMan = new GM_PrefManager(["scriptvals.",
                                     script.namespace,
                                     "/",
                                     script.name,
                                     "."].join(""));
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

/*
 * Based upon Mozilla's MicrosummaryResource from
 * http://mxr.mozilla.org/mozilla/source/browser/components/microsummaries/src/nsMicrosummaryService.js
 * Used by permission under GPL. See above link for license details.
 */
function GM_Parser(win, safeWin, unsafeWin) {
  this._chromeWin = win;
  this._safeWin = safeWin;
  this._unsafeWin = unsafeWin;
}

GM_Parser.prototype = {
  // Contains refernce to the chrome window, where we put our iframe
  _chromeWin: null,

  // Contains reference to the sandbox window, which will need for
  // security
  _safeWin: null,

  // Contains reference to the unsafe (interwebz exposed) window
  // We will use this to pop the callback back into the sandbox scope securly
  _unsafeWin: null,

  // Contains the callback function which we will pass the document
  callback: null,

  // The main interface of the API
  parse: function(text, contentType) {
    if (!GM_apiLeakCheck("GM_parse")) {
      return false;
    }

    if ('string' !== typeof text)
      throw new Error('GM_Parser: Expecting first arguments as a string. Instead found: ' +
                      typeof text);

    this.callback = arguments[arguments.length - 1];
    if ('function' !== typeof this.callback)
      throw new Error('GM_Parser: Expecting last argument as a function. Instead found: ' +
                      typeof this.callback);

    if (this.callback === contentType)
      contentType = null;

    contentType = typeof contentType === 'string' ? contentType.toLowerCase() :
                  'text/html';

    if (contentType === 'text/html') {
      this._parseFromHtml(text);
      return true;
    }

    else if (contentType === 'text/xml') {
      this._parseFromXml(text);
      return true;
    }

    throw new Error("GM_Parser: Unexpected Content-Type '" + contentType +
                    "'. Expected 'text/html' or 'text/xml'");
  },

  // Parse XML using the DOM parser
  _parseFromXml: function(text) {
    var domParser = new XPCNativeWrapper(this._unsafeWin, "DOMParser()").DOMParser;
    domParser = new domParser();

    try {
      var doc = domParser.parseFromString(text, "text/xml");
    } catch (error) {
      throw new Error("GM_Parser: Error parsing XML. \n" + uneval(error));
      // TODO : Error message needs revising. 
    }

    // Perform a clean up
    domParser = null;

    // Pass to our callback
    this._onParse(doc);
  },

  // Uses a hidden iframe to parse HTML, as the native DOM Parser does not support HTML.
  _parseFromHtml: function(text) {
    var iframe = this._chromeWin.document.createElement('iframe');

    // Making sure we are secure and hidden
    iframe.setAttribute("collapsed", true);
    iframe.setAttribute("type", "content");

    this._chromeWin.document.documentElement.appendChild(iframe);

    // Do a little garbage collection
    iframe.docShell.allowAuth = false;
    iframe.docShell.allowImages = false;
    iframe.docShell.allowJavascript = false;
    iframe.docShell.allowMetaRedirects = false;
    iframe.docShell.allowPlugins = false;
    iframe.docShell.allowSubframes = false;

    // DOMContentLoaded is triggered when DOM is ready
    var self = this;
    iframe.addEventListener("DOMContentLoaded", function(event) {
      // Clean up our mess and trigger callback
      this.removeEventListener("DOMContentLoaded", arguments.callee, false);
      self._onParse.call(self, event.currentTarget.contentDocument);
      this.parentNode.removeChild(this);
    }, true);

    // Convert HTML text into a input stream
    var convertor = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                       createInstance(Ci.nsIScriptableUnicodeConverter);
    convertor.charset = "UTF-8";
    var stream = convertor.convertToInputStream(text);

    // Create the URI object
    var ioService = Cc["@mozilla.org/network/io-service;1"].
                       getService(Ci.nsIIOService);
    var URI = ioService.newURI(this._safeWin.location.href, null, null);

    // Set up a channel
    var channel = Cc["@mozilla.org/network/input-stream-channel;1"].
                     createInstance(Ci.nsIInputStreamChannel);
    channel.setURI(URI);
    channel.contentStream = stream;

    // Prevent web progress listeners from triggering
    var request = channel.QueryInterface(Ci.nsIRequest);
    request.loadFlags |= Ci.nsIRequest.LOAD_BACKGROUND;

    // Prevent "unknown type" dialog
    var baseChannel = channel.QueryInterface(Ci.nsIChannel);
    baseChannel.contentType = "text/html";
    baseChannel.contentCharset = "UTF-8";

    // Load content
    var uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
    uriLoader.openURI(channel, true, iframe.docShell);

    // Clean up potential memory leaks
    converter = ioService = URI = request = baseChannel = uriLoader = null;
  },

  _onParse: function(doc) {
    var self = this;
    new XPCNativeWrapper(this._unsafeWin, "setTimeout()")
        .setTimeout(function(doc) {
      self.callback.call(self._safeWin, doc);
      self.callback = null;
    }, 0, doc);
  }
};

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
