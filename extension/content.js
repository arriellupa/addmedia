// Reads page identity for AddMedia. Never modifies the page.
(() => {
  const abs = (href) => {
    try {
      return href ? new URL(href, location.href).href : null;
    } catch {
      return null;
    }
  };
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || null;

  function read() {
    const optout = (meta('meta[name="addmedia"]') || "").toLowerCase();
    const icon =
      document.querySelector('link[rel~="icon"][sizes="32x32"]') ||
      document.querySelector('link[rel~="icon"]') ||
      document.querySelector('link[rel="apple-touch-icon"]');
    return {
      url: location.href,
      canonical: abs(document.querySelector('link[rel="canonical"]')?.getAttribute("href")) || abs(meta('meta[property="og:url"]')),
      ogTitle: (meta('meta[property="og:title"]') || "").trim().slice(0, 200),
      docTitle: (document.title || "").trim().slice(0, 200),
      favicon: abs(icon?.getAttribute("href")) || abs("/favicon.ico"),
      themeColor: meta('meta[name="theme-color"]'),
      optout,
      // privacy: the panel stays off on pages with password fields
      sensitive: !!document.querySelector('input[type="password"]'),
    };
  }

  // the page's text, only when the reader asks for the opening card (never read on its own, never on password pages)
  function readText() {
    if (document.querySelector('input[type="password"]')) return "";
    const clean = (el) => ((el && el.innerText) || "").replace(/\s+/g, " ").trim();
    let t = clean(document.querySelector("article") || document.querySelector('[role="main"]') || document.querySelector("main"));
    if (t.length < 400) t = clean(document.body);
    return t.slice(0, 12000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.t === "meta") reply(read());
    else if (msg?.t === "text") reply({ text: readText() });
  });
})();
