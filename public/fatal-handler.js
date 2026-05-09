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

  window.addEventListener(
    'error',
    function (e) {
      var head =
        e.message != null && String(e.message).length
          ? String(e.message)
          : '(error event without message)'
      var tail = e.error && e.error.stack ? '\n' + e.error.stack : ''
      show(head + tail)
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
