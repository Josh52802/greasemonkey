const EXPORTED_SYMBOLS = ['scriptMatchesUrlAndRuns'];

function scriptMatchesUrlAndRuns(script, url, when, safeWin) {
  var dontRun = false;

  if ('any' == when) {
    for (var i = 0, len = script.alreadyExec.length; i < len; ++i) {
	  if (script.alreadyExec[i].closed) {
	    script.alreadyExec.splice(i, 1);
	  } else if (script.alreadyExec[i] === safeWin) {
        script.alreadyExec.splice(i, 1);
		dontRun = script.runAt == 'document-end';
		break;
	  }
    }
  }

  return !dontRun
      && !script.pendingExec.length
      && script.enabled
      && !script.needsUninstall
      && (script.runAt == when || 'any' == when)
      && script.matchesURL(url);
}
