
// XPCOM info
const DESCRIPTION = "GM_GreasemonkeyService";
const CONTRACTID = "@greasemonkey.mozdev.org/greasemonkey-service;1";
const CLASSID = Components.ID("{77bf3650-1cd6-11da-8cd6-0800200c9a66}");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const appSvc = Cc["@mozilla.org/appshell/appShellService;1"]
                 .getService(Ci.nsIAppShellService);

const serviceFilename = Components.stack.filename;

var getMaxJSVersion = function(){
  var maxJSVersion = (function() {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"]
        .getService(Ci.nsIXULAppInfo);
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Ci.nsIVersionComparator);

    // Firefox 3.5 and higher supports 1.8.
    if (versionChecker.compare(appInfo.version, "3.5") >= 0) {
      return "1.8";
    }

    // Everything else supports 1.6.
    return "1.6";
  })();

  getMaxJSVersion = function() {
    return maxJSVersion;
  }

  return maxJSVersion;
}

function GM_GreasemonkeyService() {
  this.wrappedJSObject = this;
}

GM_GreasemonkeyService.prototype = {
  classDescription:  DESCRIPTION,
  classID:           CLASSID,
  contractID:        CONTRACTID,
  _xpcom_categories: [{category: "app-startup",
                       entry: DESCRIPTION,
                       value: CONTRACTID,
                       service: true},
                      {category: "content-policy",
                       entry: CONTRACTID,
                       value: CONTRACTID,
                       service: true}],

  // nsISupports
  QueryInterface: XPCOMUtils.generateQI([
      Ci.nsIObserver,
      Ci.nsISupports,
      Ci.nsISupportsWeakReference,
      Ci.nsIContentPolicy
  ]),

  get filename() { return serviceFilename; },
  _scriptFoldername: "gm_scripts",

  _config: null,
  get config() {
    if (!this._config) {
      // check if GM was updated/installed
      this.updateVersion();

      var tools = {};
      Cu.import("resource://greasemonkey/config.js", tools);

      this._config = new tools.Config(this._scriptFoldername);
    }

    return this._config;
  },

  // nsIObserver
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "app-startup") {
      Cu.import("resource://greasemonkey/prefmanager.js");
      Cu.import("resource://greasemonkey/utils.js");
    }
  },

  domContentLoaded: function(wrappedContentWin, chromeWin, gmBrowser) {
    var url = wrappedContentWin.document.location.href;
    var scripts = this.initScripts(url, wrappedContentWin, chromeWin);

    if (scripts.length > 0) {
      this.injectScripts(scripts, url, wrappedContentWin, chromeWin, gmBrowser);
    }
  },

  shouldLoad: function(ct, cl, org, ctx, mt, ext) {
    var ret = Ci.nsIContentPolicy.ACCEPT;

    // block content detection of greasemonkey by denying GM
    // chrome content, unless loaded from chrome
    if (org && org.scheme != "chrome" && cl.scheme == "chrome" &&
        cl.host == "greasemonkey") {
      return Ci.nsIContentPolicy.REJECT_SERVER;
    }

    // don't intercept anything when GM is not enabled
    if (!GM_getEnabled()) {
      return ret;
    }

    // don't interrupt the view-source: scheme
    // (triggered if the link in the error console is clicked)
    if ("view-source" == cl.scheme) {
      return ret;
    }

    if (ct == Ci.nsIContentPolicy.TYPE_DOCUMENT &&
        cl.spec.match(/\.user\.js$/)) {

      dump("shouldload: " + cl.spec + "\n");
      dump("ignorescript: " + this.ignoreNextScript_ + "\n");

      if (!this.ignoreNextScript_ && !this.isTempScript(cl)) {
        var win = Cc['@mozilla.org/appshell/window-mediator;1']
            .getService(Ci.nsIWindowMediator)
            .getMostRecentWindow("navigator:browser");

        if (win && win.GM_BrowserUI) {
          win.GM_BrowserUI.startInstallScript(cl);
          ret = Ci.nsIContentPolicy.REJECT_REQUEST;
        }
      }
    }

    this.ignoreNextScript_ = false;
    return ret;
  },

  shouldProcess: function(ct, cl, org, ctx, mt, ext) {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  ignoreNextScript: function() {
    dump("ignoring next script...\n");
    this.ignoreNextScript_ = true;
  },

  isTempScript: function(uri) {
    if (uri.scheme != "file") {
      return false;
    }

    var fph = Cc["@mozilla.org/network/protocol;1?name=file"]
    .getService(Ci.nsIFileProtocolHandler);

    var file = fph.getFileFromURLSpec(uri.spec);
    var tmpDir = Cc["@mozilla.org/file/directory_service;1"]
    .getService(Ci.nsIProperties)
    .get("TmpD", Ci.nsILocalFile);

    return file.parent.equals(tmpDir) && file.leafName != "newscript.user.js";
  },

  initScripts: function(url, wrappedContentWin, chromeWin) {
    function testMatch(script) {
      return !script.delayInjection && script.enabled && script.matchesURL(url);
    }

    // Todo: Try to implement this w/out global state.
    this.config.wrappedContentWin = wrappedContentWin;
    this.config.chromeWin = chromeWin;

    if (GM_prefRoot.getValue('enableScriptRefreshing')) {
      this.config.updateModifiedScripts();
    }

    return this.config.getMatchingScripts(testMatch);
  },

  injectScripts: function(scripts, url, wrappedContentWin, chromeWin, gmBrowser) {
    var sandbox;
    var script;
    var console;
    var unsafeContentWin = wrappedContentWin.wrappedJSObject;

    var tools = {};
    Cu.import("resource://greasemonkey/api.js", tools);
    Cu.import("resource://greasemonkey/miscapis.js", tools);

    // detect and grab reference to firebug console and context, if it exists
    var firebugConsole = this.getFirebugConsole(unsafeContentWin, chromeWin);

    for (var i = 0; script = scripts[i]; i++) {
      sandbox = new Cu.Sandbox(wrappedContentWin);

      console = firebugConsole ? firebugConsole : new tools.GM_console(script);

      var GM_API = new tools.GM_API(
          script,
          url,
          wrappedContentWin.document,
          unsafeContentWin,
          appSvc.hiddenDOMWindow,
          chromeWin,
          gmBrowser);

      sandbox.window = wrappedContentWin;
      sandbox.document = sandbox.window.document;
      sandbox.unsafeWindow = unsafeContentWin;

      // hack XPathResult since that is so commonly used
      sandbox.XPathResult = Ci.nsIDOMXPathResult;

      // add our own APIs
      for (var funcName in GM_API) {
        sandbox[funcName] = GM_API[funcName]
      }
      sandbox.console = console;

      sandbox.__proto__ = wrappedContentWin;

      var contents = script.textContent;

      var requires = [];
      var offsets = [];
      var offset = 0;

      script.requires.forEach(function(req){
        var contents = req.textContent;
        var lineCount = contents.split("\n").length;
        requires.push(contents);
        offset += lineCount;
        offsets.push(offset);
      });
      script.offsets = offsets;

      var scriptSrc = "\n" + // error line-number calculations depend on these
                         requires.join("\n") +
                         "\n" +
                         contents +
                         "\n";
      if (!script.unwrap)
        scriptSrc = "(function(){"+ scriptSrc +"})()";
      if (!this.evalInSandbox(scriptSrc, url, sandbox, script) && script.unwrap)
        this.evalInSandbox("(function(){"+ scriptSrc +"})()",
                           url, sandbox, script); // wrap anyway on early return
    }
  },

  evalInSandbox: function(code, codebase, sandbox, script) {
    if (!(Cu && Cu.Sandbox)) {
      var e = new Error("Could not create sandbox.");
      GM_logError(e, 0, e.fileName, e.lineNumber);
      return true;
    }
    try {
      // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=307984
      var lineFinder = new Error();
      Cu.evalInSandbox(code, sandbox, getMaxJSVersion());
    } catch (e) { // catches errors while running the script code
      try {
        if (e && "return not in function" == e.message)
          return false; // means this script depends on the function enclosure

        // try to find the line of the actual error line
        var line = e && e.lineNumber;
        if (4294967295 == line) {
          // Line number is reported as max int in edge cases.  Sometimes
          // the right one is in the "location", instead.  Look there.
          if (e.location && e.location.lineNumber) {
            line = e.location.lineNumber;
          } else {
            // Reporting maxint is useless, if we couldn't find it in location
            // either, forget it.  A value of 0 isn't shown in the console.
            line = 0;
          }
        }

        if (line) {
          var err = this.findError(script, line - lineFinder.lineNumber - 1);
          GM_logError(
            e, // error obj
            0, // 0 = error (1 = warning)
            err.uri,
            err.lineNumber
          );
        } else {
          GM_logError(
            e, // error obj
            0, // 0 = error (1 = warning)
            script.fileURL,
            0
          );
        }
      } catch (e) { // catches errors we cause trying to inform the user
        // Do nothing. More importantly: don't stop script incovation sequence.
      }
    }
    return true; // did not need a (function() {...})() enclosure.
  },

  findError: function(script, lineNumber){
    var start = 0;
    var end = 1;

    for (var i = 0; i < script.offsets.length; i++) {
      end = script.offsets[i];
      if (lineNumber < end) {
        return {
          uri: script.requires[i].fileURL,
          lineNumber: (lineNumber - start)
        };
      }
      start = end;
    }

    return {
      uri: script.fileURL,
      lineNumber: (lineNumber - end)
    };
  },

  getFirebugConsole: function(unsafeContentWin, chromeWin) {
    // If we can't find this object, there's no chance the rest of this
    // function will work.
    if ('undefined'==typeof chromeWin.Firebug) return null;

    try {
      chromeWin = chromeWin.top;
      var fbVersion = parseFloat(chromeWin.Firebug.version, 10);
      var fbConsole = chromeWin.Firebug.Console;
      var fbContext = chromeWin.TabWatcher &&
        chromeWin.TabWatcher.getContextByWindow(unsafeContentWin);

      // Firebug 1.4 will give no context, when disabled for the current site.
      // We can't run that way.
      if ('undefined'==typeof fbContext) {
        return null;
      }

      function findActiveContext() {
        for (var i=0; i<fbContext.activeConsoleHandlers.length; i++) {
          if (fbContext.activeConsoleHandlers[i].window == unsafeContentWin) {
            return fbContext.activeConsoleHandlers[i];
          }
        }
        return null;
      }

      if (!fbConsole.isEnabled(fbContext)) return null;

      if (1.2 == fbVersion) {
        var tools = {};
        Cc["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(Ci.mozIJSSubScriptLoader)
            .loadSubScript("chrome://global/content/XPCNativeWrapper.js", tools);
        var safeWin = new tools.XPCNativeWrapper(unsafeContentWin);

        if (fbContext.consoleHandler) {
          for (var i = 0; i < fbContext.consoleHandler.length; i++) {
            if (fbContext.consoleHandler[i].window == safeWin) {
              return fbContext.consoleHandler[i].handler;
            }
          }
        }

        var dummyElm = safeWin.document.createElement("div");
        dummyElm.setAttribute("id", "_firebugConsole");
        safeWin.document.documentElement.appendChild(dummyElm);
        chromeWin.Firebug.Console.injector.addConsoleListener(fbContext, safeWin);
        dummyElm.parentNode.removeChild(dummyElm);

        return fbContext.consoleHandler.pop().handler;
      } else if (fbVersion >= 1.3) {
        fbConsole.injector.attachIfNeeded(fbContext, unsafeContentWin);
        return findActiveContext();
      }
    } catch (e) {
      dump('Greasemonkey getFirebugConsole() error:\n'+uneval(e)+'\n');
    }

    return null;
  },

  /**
   * Checks whether the version has changed since the last run and performs
   * any necessary upgrades.
   */
  updateVersion: function() {
    GM_log("> GM_updateVersion");

    // this is the last version which has been run at least once
    var initialized = GM_prefRoot.getValue("version", "0.0");

    // check if this is the first launch
    if ("0.0" == initialized) {
      // find an open window.
      var chromeWin = Cc['@mozilla.org/appshell/window-mediator;1']
          .getService(Ci.nsIWindowMediator)
          .getMostRecentWindow("navigator:browser");

      // if we found it, use it to open a welcome tab
      if (chromeWin.gBrowser) {
        // the setTimeout makes sure we do not execute too early -- sometimes
        // the window isn't quite ready to add a tab yet
        chromeWin.setTimeout(
            "gBrowser.selectedTab = gBrowser.addTab(" +
            "'http://wiki.greasespot.net/Welcome')", 500);
      }
    }

    // check if this is an upgrade from a version less than 0.8
    if (GM_compareVersions(initialized, "0.8") == -1) {
      /**
       * In Greasemonkey 0.8 there was a format change to the gm_scripts folder and
       * testing found several bugs where the entire folder would get nuked. So we
       * are paranoid and backup the folder the first time 0.8 runs.
       */
      var scriptDir = GM_getProfileFile(this._scriptFoldername);
      var scriptDirBackup = scriptDir.clone();
      scriptDirBackup.leafName += "_08bak";
      if (scriptDir.exists() && !scriptDirBackup.exists()) {
        scriptDir.copyTo(scriptDirBackup.parent, scriptDirBackup.leafName);
      }
    }

    // update the currently initialized version so we don't do this work again.
    if ("@mozilla.org/extensions/manager;1" in Cc) {
      // Firefox <= 3.6.*
      var extMan = Cc["@mozilla.org/extensions/manager;1"]
          .getService(Ci.nsIExtensionManager);
      var item = extMan.getItemForID(GM_GUID);

      GM_prefRoot.setValue("version", item.version);
    } else {
      // Firefox 3.7+
      var tools = {};
      Cu.import("resource://gre/modules/AddonManager.jsm", tools);

      tools.AddonManager.getAddonByID(GM_GUID, function(addon) {
         GM_prefRoot.setValue("version", addon.version);
      });
    }

    this.updateVersion = function() {};

    GM_log("< GM_updateVersion");
  }
};

// XPCOM module registration.
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule([GM_GreasemonkeyService]);
}
