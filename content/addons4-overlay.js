// This file is concerned with altering the Firefox 4+ Add-ons Manager window,
// for those sorts of functionality we want that the API does not handle.  (As
// opposed to addons4.jsm which is responsible for what the API does handle.)
(function() {
window.addEventListener('load', init, false);

function addonIsInstalledScript(aAddon) {
  if (!aAddon) return false;
  if ('user-script' != aAddon.type) return false;
  if (aAddon._script.needsUninstall) return false;
  return true;
}

function init() {
  gViewController.commands.cmd_userscript_edit = {
      isEnabled: addonIsInstalledScript,
      doCommand: function(aAddon) { GM_openInEditor(aAddon._script); }
    };
  gViewController.commands.cmd_userscript_show = {
      isEnabled: addonIsInstalledScript,
      doCommand: function(aAddon) { GM_openFolder(aAddon._script.file); }
    };

  document.getElementById('addonitem-popup').addEventListener(
      'popupshowing', onContextPopupShowing, false);

  // Inject this content into an XBL binding (where it can't be overlayed).
  var sortExecuteOrderButton = document.createElement('button');
  sortExecuteOrderButton.setAttribute('checkState', '0');
  sortExecuteOrderButton.setAttribute('class', 'sorter');
  sortExecuteOrderButton.setAttribute('label', 'Execution Order');
  sortExecuteOrderButton.setAttribute('tooltiptext', 'Sort by execution order');
  sortExecuteOrderButton.setAttribute('id', 'btn-userscript-execution');
  sortExecuteOrderButton.setAttribute('oncommand', 'this.parentNode._handleChange("executionIndex");');
  var sortersContainer = document.getElementById('list-sorters');
  sortersContainer.appendChild(sortExecuteOrderButton);
}

function onContextPopupShowing(aEvent) {
  var popup = aEvent.target;
  var viewIsUserScripts = (
      'addons://list/user-script' == gViewController.currentViewId);
  for (var i = 0, menuitem = null; menuitem = popup.children[i]; i++) {
    var menuitemIsUserScript = ('user-script' == menuitem.getAttribute('type'));
    menuitem.collapsed = viewIsUserScripts != menuitemIsUserScript;
  }
}

// Patch the default createItem() to add our custom property.
_createItemOrig = createItem;
createItem = function GM_createItem(aObj, aIsInstall, aIsRemote) {
  var item = _createItemOrig(aObj, aIsInstall, aIsRemote);
  if ('user-script' == aObj.type) {
    item.setAttribute('executionIndex',
        // String format with leading zeros, so it will sort properly.
        ('0000' + aObj.executionIndex).substr(-5));
  }
  return item;
}

})();
