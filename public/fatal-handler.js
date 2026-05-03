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
  window.addEventListener(
    'error',
    function (e) {
      show(String(e.message) + (e.error && e.error.stack ? '\n' + e.error.stack : ''))
    },
    true,
  )
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason
    show(r instanceof Error ? r.message + '\n' + r.stack : String(r))
  })
})()
