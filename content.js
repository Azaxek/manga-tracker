// Injected only on sites the user approved. Reads series + chapter using that site's rule.
// Cheap on purpose: the rule is cached and regexes compiled once; each 1s tick is a string compare
// unless the URL or title changed.
if (!window.__mt) {
  window.__mt = 1;
  const host = location.hostname;
  const re = (s) => new RegExp(s?.re || "(.+)", "i");
  let rule, rx;

  const setRule = (r) => {
    last = failing = "";
    try {
      rule = r;
      rx = r && { match: new RegExp(r.match || ".", "i"), series: re(r.series), chapter: re(r.chapter) };
    } catch { rule = rx = null; } // a hand-edited rule with a bad regex: stay quiet
  };

  const pick = (spec, regex) => {
    if (!spec) return;
    const t = spec.from === "url" ? location.href : spec.from === "title" ? document.title : document.querySelector(spec.sel)?.[spec.attr || "textContent"];
    const m = (t || "").match(regex);
    return m && (m[1] ?? m[0]).trim();
  };
  const extract = () =>
    rx && rx.match.test(location.href)
      ? { matched: true, series: pick(rule.series, rx.series), chapter: parseFloat(pick(rule.chapter, rx.chapter)), url: location.href }
      : { matched: false };

  let last = "", failing = "";
  const tick = () => {
    if (!rx) return;
    const sig = location.href + "\n" + document.title;
    if (sig === last) return;
    const r = extract();
    if (!r.matched) { last = sig; return; }
    if (r.series && !isNaN(r.chapter)) {
      last = sig;
      chrome.runtime.sendMessage({ type: "read", series: r.series, chapter: r.chapter, url: r.url, host });
    } else if (sig === failing) { // failed on two looks in a row: the title may just have been loading
      last = sig;
      chrome.runtime.sendMessage({ type: "fail", host });
    } else failing = sig;
  };

  const ready = chrome.storage.local.get({ rules: {} }).then(({ rules }) => setRule(rules[host]));
  chrome.storage.onChanged.addListener((c) => c.rules && setRule(c.rules.newValue?.[host]));
  const iv = setInterval(() => {
    try { tick(); } catch { clearInterval(iv); } // extension reloaded: this script is orphaned
  }, 1000);
  ready.then(tick);

  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m.type !== "extract") return;
    ready.then(() => send(extract()));
    return true;
  });
}
