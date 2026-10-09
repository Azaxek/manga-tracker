// Injected only on sites the user approved. Reads series + chapter using that site's rule.
if (!window.__mt) {
  window.__mt = 1;
  const host = location.hostname;
  const pick = (s) => {
    if (!s) return;
    const t = s.from === "url" ? location.href : s.from === "title" ? document.title : document.querySelector(s.sel)?.[s.attr || "textContent"];
    const m = (t || "").match(new RegExp(s.re || "(.+)", "i"));
    return m && (m[1] ?? m[0]).trim();
  };
  const extract = (rule) =>
    rule && new RegExp(rule.match || ".", "i").test(location.href)
      ? { matched: true, series: pick(rule.series), chapter: parseFloat(pick(rule.chapter)), url: location.href }
      : { matched: false };
  const getRule = async () => (await chrome.storage.local.get({ rules: {} })).rules[host];

  let seen = "", bad = "";
  const iv = setInterval(async () => {
    try {
      const r = extract(await getRule());
      if (!r.matched) return;
      const key = location.href + "|" + r.series + "|" + r.chapter;
      if (key === seen) return;
      if (r.series && !isNaN(r.chapter)) {
        seen = key;
        chrome.runtime.sendMessage({ type: "read", series: r.series, chapter: r.chapter, url: r.url, host });
      } else if (key === bad) { // failed twice in a row: title may still have been loading once
        seen = key;
        chrome.runtime.sendMessage({ type: "fail", host });
      } else bad = key;
    } catch { clearInterval(iv); } // extension reloaded: this script is orphaned
  }, 1000);

  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m.type !== "extract") return;
    getRule().then((r) => send(extract(r)));
    return true;
  });
}
