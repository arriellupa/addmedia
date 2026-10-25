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

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.t === "meta") reply(read());
  });
})();
