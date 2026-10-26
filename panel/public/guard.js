// Boot guard (plain script, runs before the app). If the panel cannot start in this browser,
// show the reason on screen instead of a blank page, so a screenshot is enough to diagnose it.
(function () {
  var box = null;
  var started = function () {
    var app = document.getElementById("app");
    return !!(app && app.childElementCount);
  };
  function show(msg) {
    if (box || started()) return;
    window.__amBootError = msg;
    box = document.createElement("div");
    box.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;overflow:auto;box-sizing:border-box;padding:28px 20px;direction:rtl;text-align:right;" +
        "font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14161a;background:#fff",
    );
    box.innerHTML =
      '<div style="font-size:20px;font-weight:700;margin:0 0 6px">הפאנל לא נטען בדפדפן הזה</div>' +
      '<div style="margin:0 0 14px;color:#4b4f58">צלמו את המסך הזה ושלחו לנו — הפרטים למטה יגידו לנו מה לתקן.</div>' +
      '<pre dir="ltr" style="text-align:left;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;background:#f3f2f5;padding:12px;border-radius:10px;margin:0 0 16px"></pre>' +
      '<a href="/" style="color:#A3195B;font-weight:600">חזרה לדף הבית</a>';
    box.querySelector("pre").textContent = msg + "\n\n" + navigator.userAgent + "\n" + location.href;
    (document.body || document.documentElement).appendChild(box);
    // the app may still come up (a slow network): then the notice goes away by itself
    var t = setInterval(function () {
      if (started()) {
        clearInterval(t);
        if (box && box.parentNode) box.parentNode.removeChild(box);
      }
    }, 1000);
  }
  window.addEventListener(
    "error",
    function (e) {
      var el = e.target;
      if (el && el !== window) {
        // a file failed to load; only the app's own script is fatal
        if (el.tagName === "SCRIPT") show("לא נטען קובץ: " + (el.src || "script"));
        return;
      }
      show((e.message || "Error") + (e.filename ? "\n@ " + e.filename.split("/").pop() + ":" + e.lineno + ":" + e.colno : "") + (e.error && e.error.stack ? "\n" + String(e.error.stack).slice(0, 600) : ""));
    },
    true,
  );
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    show("Unhandled: " + ((r && (r.stack || r.message)) || String(r)));
  });
  if (!("noModule" in document.createElement("script"))) show("הדפדפן ישן מדי: אין בו תמיכה במודולים של JavaScript.");
  var tries = 0;
  (function wait() {
    if (started()) return;
    // only judge once every script has loaded and run; on a slow network keep waiting (up to ~40 s)
    if (document.readyState === "complete" || ++tries > 20) return void setTimeout(function () {
      if (!started()) show("האפליקציה לא עלתה (אין שגיאה מפורשת).");
    }, 1500);
    setTimeout(wait, 2000);
  })();
})();
