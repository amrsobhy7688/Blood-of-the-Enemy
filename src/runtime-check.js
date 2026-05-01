if (typeof React === "undefined" || typeof ReactDOM === "undefined") {
  document.addEventListener("DOMContentLoaded", function() {
    var el = document.createElement("div");
    el.setAttribute("style", "position:fixed;left:16px;right:16px;bottom:16px;background:#1b1212;color:#ffd7d7;border:1px solid #7a2d2d;border-radius:12px;padding:14px 16px;font:13px/1.5 system-ui,sans-serif;z-index:99999");
    el.innerHTML = "<strong>Codex failed to load.</strong> This dashboard could not load its local React runtime. Check that assets/vendor is present beside this HTML file, then reload the page.";
    document.body.appendChild(el);
  });
}
