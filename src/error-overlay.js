window.addEventListener('error', function (e) {
  try {
    var existing = document.getElementById('bote-error-overlay');
    if (existing) return;
    var box = document.createElement('div');
    box.id = 'bote-error-overlay';
    box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;background:#1b1212;color:#ffd7d7;border:1px solid #7a2d2d;border-radius:12px;padding:14px 16px;font:13px/1.5 system-ui, sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.45)';
    box.innerHTML = '<strong style="display:block;margin-bottom:6px">Dashboard script error</strong>' +
      '<div>This file is meant to open directly in a browser. If the page is blank, the browser likely blocked a script or the local React runtime files are missing.</div>' +
      '<div style="margin-top:8px;opacity:.9"><code>' + String(e.message || 'Unknown error') + '</code></div>';
    document.body.appendChild(box);
  } catch (_) {}
});
