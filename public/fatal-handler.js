;(function () {
  var shown = false
  var log = 'Brezn fatal-handler:'

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

  function trim(v) {
    if (v == null) return ''
    return String(v).trim()
  }

  function pickErrMsg(err) {
    if (!err || typeof err !== 'object') return ''
    var m = err.message
    return m != null && String(m).trim().length ? String(m).trim() : ''
  }

  function pickErrStack(err) {
    if (!err || typeof err !== 'object') return ''
    var s = err.stack
    return s != null && String(s).trim().length ? String(s).trim() : ''
  }

  /** One pass: decide if this error is worth full-screen + build the same text we would show. */
  function collectScriptError(e) {
    try {
      var err = e.error
      var evMsg = trim(e.message)
      if (evMsg.indexOf('ResizeObserver loop') !== -1) {
        return { actionable: false, text: '' }
      }

      var fn = trim(e.filename)
      var errMsg = err && typeof err === 'object' ? pickErrMsg(err) : ''
      var errStack = err && typeof err === 'object' ? pickErrStack(err) : ''

      var jsonAny = ''
      if (err != null && typeof err === 'object') {
        try {
          var j = JSON.stringify(err)
          if (j && j !== '{}' && j !== 'null') jsonAny = j
        } catch {}
      }

      var stringErr = err != null ? trim(String(err)) : ''
      var actionable =
        !!evMsg ||
        !!fn ||
        (err != null && (!!errMsg || !!errStack || !!jsonAny || stringErr.length > 0))

      if (!actionable) {
        return { actionable: false, text: '' }
      }

      var msg = evMsg
      if (!msg && err) msg = errMsg
      if (!msg && fn) {
        msg =
          'Script error (no message). ' +
          e.filename +
          ':' +
          (e.lineno != null ? e.lineno : '?') +
          ':' +
          (e.colno != null ? e.colno : '?')
      }
      if (!msg && err && errStack) msg = '(See stack below)'
      if (!msg && err && typeof err === 'object' && !(err instanceof Error) && jsonAny) {
        msg = jsonAny
      }
      if (!msg) msg = 'Unknown script error'

      var parts = [msg]
      if (fn && msg.indexOf(fn) === -1 && errStack.indexOf(fn) === -1) {
        parts.push(
          'Location: ' +
            fn +
            ':' +
            (e.lineno != null ? e.lineno : '?') +
            ':' +
            (e.colno != null ? e.colno : '?'),
        )
      }
      if (errStack) parts.push(errStack)
      else if (err && typeof err === 'object' && !(err instanceof Error)) {
        try {
          parts.push(String(err))
        } catch {}
      }
      return { actionable: true, text: parts.join('\n') }
    } catch {
      var fallbackMsg = ''
      try {
        fallbackMsg = trim(e.message)
      } catch {}
      return {
        actionable: true,
        text: fallbackMsg || 'Unknown script error',
      }
    }
  }

  /** Full-screen rejections: real Error/DOMException only; skip abort/empty/non-objects. */
  function rejectionShowsFullscreen(reason) {
    if (reason === undefined || reason === null) return false
    if (typeof reason === 'string' && !reason.trim()) return false
    try {
      if (reason && typeof reason === 'object' && reason.name === 'AbortError') return false
    } catch {}
    try {
      if (reason instanceof Error) return true
      if (typeof DOMException !== 'undefined' && reason instanceof DOMException) return true
    } catch {}
    return false
  }

  function formatRejection(reason) {
    var head = pickErrMsg(reason) || '(no message)'
    var tail = pickErrStack(reason)
    return tail ? head + '\n' + tail : head
  }

  window.addEventListener(
    'error',
    function (e) {
      var got = collectScriptError(e)
      if (!got.actionable) {
        try {
          console.warn(log, 'ignored script error (nothing actionable)', e.message, e.filename)
        } catch {}
        return
      }
      try {
        console.error(log, 'error', e.message, e.filename, e.lineno, e.error)
      } catch {}
      show(got.text)
    },
    true,
  )

  window.addEventListener('unhandledrejection', function (e) {
    try {
      console.error(log, 'unhandled rejection', e.reason)
      if (!rejectionShowsFullscreen(e.reason)) return
      show(formatRejection(e.reason))
    } catch {}
  })
})()
