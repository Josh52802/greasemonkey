/**** BEGIN LICENSE BLOCK *****
Version: MPL 1.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

The Original Code is Mozilla.org Code.

The Initial Developer of the Original Code is
Netscape Communications Corporation.
Portions created by the Initial Developer are Copyright (C) 2001
the Initial Developer. All Rights Reserved.

Contributor(s):
  Blake Ross <blakeross@telocity.com> (Original Author)
  Ben Goodger <ben@bengoodger.com> (v2.0)
  Dan Mosedale <dmose@mozilla.org>
  Fredrik Holmqvist <thesuckiestemail@yahoo.se>
  Josh Aas <josh@mozilla.com>
  Shawn Wilsher <me@shawnwilsher.com> (v3.0)
  Edward Lee <edward.lee@engineering.uiuc.edu>

  Anthony Lieuallen <arantius@gmail.com>
  Mike Medley <medleymind@gmail.com>
  Tim Smart
***** END LICENSE BLOCK ****/

function GM_openFolder(aFile) {
  try {
    // Show the directory containing the file and select the file.
    aFile.reveal();
  } catch (e) {
    // Either the file doesn't exist or reveal is not implemented
    var fParent = aFile.parent;

    try {
      // Lauch the parent directory if the file doesn't exist.
      if (fParent.exists()) fParent.launch();
    } catch (e) {
      // If launch also fails let the OS handler try to open the parent.
      var uri = Components.classes["@mozilla.org/network/io-service;1"]
          .getService(Components.interfaces.nsIIOService)
          .newFileURI(fParent);
      var protocolSvc = Components
          .classes["@mozilla.org/uriloader/external-protocol-service;1"]
          .getService(Components.interfaces.nsIExternalProtocolService);

      protocolSvc.loadUrl(uri);
    }
  }
}

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

/*
 * Based upon Mozilla's MicrosummaryResource from
 * http://mxr.mozilla.org/mozilla/source/browser/components/microsummaries/src/nsMicrosummaryService.js
 */
function GM_HtmlParser(win, safeWin, unsafeWin) {
  this._chromeWin = win;
  this._safeWin = safeWin;
  this._unsafeWin = unsafeWin;
}

GM_HtmlParser.prototype = {
  // Contains refernce to the chrome window, where we put our iframe
  _chromeWin: null,

  // Contains reference to the sandbox window, which will need for
  // security
  _safeWin: null,

  // Contains reference to the unsafe (interwebz exposed) window
  // We will use this to pop the callback back into the sandbox scope securly
  _unsafeWin: null,

  // Contains the callback function which we will pass the document
  _callback: null,

  // The main interface of the API
  parse: function(text, callback) {
    if (!GM_apiLeakCheck("GM_parseHtml")) {
      return false;
    }

    if ('string' !== typeof text) {
      throw new Error('GM_parseHtml: Expecting first arguments as a string. Instead found: ' +
                      typeof text);
    }

    if ('function' !== typeof callback) {
      throw new Error('GM_parseHtml: Expecting second argument as a function. Instead found: ' +
                      typeof callback);
    }

    this._callback = callback;
    this._parseFromHtml(text);

    throw new Error("GM_parseHtml: Unexpected Content-Type '" + contentType +
                    "'. Expected 'text/html'");
  },

  // Uses a hidden iframe to parse HTML
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
      self._callback.call(self._safeWin, doc);
      self._callback = null;
    }, 0, doc);
  }
};
