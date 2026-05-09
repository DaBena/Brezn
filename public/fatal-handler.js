;(function () {
  var shown = false
  function show(msg) {
    if (shown) return
    shown = true
    var el = document.getElementById('root')
    if (!el) return
    el.textContent = ''
    var pre = document.createElement('pre')
    pre.style.cssText =
      'margin:0;padding:16px;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:#b91c1c;background:#fef2f2'
    pre.textContent = msg
    el.appendChild(pre)
  }

  /** Avoid misleading "undefined" when Error.message or rejection reason is missing (common on iOS / minified stacks). */
  function formatRejectionReason(r) {
    if (r instanceof Error) {
      var head =
        r.message != null && String(r.message).length
          ? String(r.message)
          : '(Error without message)'
      var tail = r.stack ? '\n' + r.stack : ''
      return head + tail
    }
    if (r === undefined) {
      return (
        'Unhandled promise rejection: reason was undefined.\n' +
        '(Often a bare Promise.reject(), an async path that rejects with no value, or a dependency bug.)\n' +
        'Check Safari Web Inspector → Console for the preceding stack.'
      )
    }
    if (r === null) return 'Unhandled promise rejection: reason was null.'
    if (typeof r === 'object') {
      try {
        return JSON.stringify(r)
      } catch (e) {
        /* fall through */
      }
    }
    return String(r)
  }

  /** Same-origin gives message; cross-origin scripts often clear message+filename; iOS Safari sometimes omits message only. */
  function formatErrorEvent(e) {
    var msg = e.message != null && String(e.message).length ? String(e.message) : ''
    if (
      !msg &&
      e.error &&
      e.error instanceof Error &&
      e.error.message != null &&
      String(e.error.message).length
    ) {
      msg = String(e.error.message)
    }
    if (!msg && e.filename) {
      msg =
        'Script/runtime error (no message text). Source: ' +
        e.filename +
        ':' +
        (e.lineno != null ? e.lineno : '?') +
        ':' +
        (e.colno != null ? e.colno : '?')
    }
    if (!msg) {
      msg =
        '(error event without message — typical for cross-origin scripts or stripped errors; open Safari Web Inspector → Console.)'
    }
    var parts = [msg]
    if (
      e.filename &&
      msg.indexOf(e.filename) === -1 &&
      !(e.error && e.error.stack && String(e.error.stack).indexOf(e.filename) !== -1)
    ) {
      parts.push(
        'Location: ' +
          e.filename +
          ':' +
          (e.lineno != null ? e.lineno : '?') +
          ':' +
          (e.colno != null ? e.colno : '?'),
      )
    }
    if (e.error && e.error.stack) {
      parts.push(String(e.error.stack))
    } else if (e.error && !(e.error instanceof Error)) {
      try {
        parts.push(String(e.error))
      } catch (err) {
        /* ignore */
      }
    }
    return parts.join('\n')
  }

  window.addEventListener(
    'error',
    function (e) {
      try {
        console.error('Brezn fatal-handler: error event', e.message, e.filename, e.lineno, e.error)
      } catch (err) {
        /* ignore */
      }
      show(formatErrorEvent(e))
    },
    true,
  )
  window.addEventListener('unhandledrejection', function (e) {
    try {
      console.error('Brezn fatal-handler: unhandled rejection', e.reason)
    } catch (err) {
      /* ignore */
    }
    show(formatRejectionReason(e.reason))
  })
})()
