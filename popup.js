let tab, url;
const open = (u) => chrome.tabs.create({ url: u });

async function render() {
  const d = await chrome.storage.local.get({ series: {}, progress: {}, rules: {}, warnings: {} });
  const all = Object.values(d.series);
  // What you'd actually want to resume: unread first, then most recently read. Only series you're reading.
  const rows = all.filter((s) => s.status === "reading")
    .sort((a, b) => !!d.progress[b.id]?.unread - !!d.progress[a.id]?.unread || lastTouched(b, d.progress[b.id]) - lastTouched(a, d.progress[a.id]));

  $("#empty").hidden = all.length > 0;
  $("#count").textContent = all.length ? `${rows.length} reading · ${all.length} total` : "";
  $("#site").hidden = !url || !!d.rules[url.hostname];
  $("#test").hidden = !url || !d.rules[url.hostname];
  const w = Object.keys(d.warnings);
  $("#warn").hidden = !w.length;
  $("#warn").textContent = w.length ? `Couldn't read a page on ${w.join(", ")}. Fix its rule in Settings → Sites.` : "";

  $("#list").replaceChildren(...rows.map((s) => {
    const p = d.progress[s.id] || {};
    const go = target(s, p);
    return h("li", {},
      cover(s, "c"),
      h("a", { className: "i", href: "#", title: s.description || "", onclick: (e) => { e.preventDefault(); go && open(go); } },
        h("b", { textContent: s.title }),
        h("span", { className: p.unread ? "new" : "", textContent: p.unread ? `${newCount(p)} new · Ch. ${p.latest} is out` : p.chapter !== undefined ? `Ch. ${p.chapter}${p.time ? " · " + ago(p.time) : ""}` : "Not started" })),
      h("button", { className: "primary", textContent: readLabel(s, p), disabled: !go, onclick: () => go && open(go) }),
      p.unread ? h("button", { className: "icon", title: "Mark read up to the latest chapter", textContent: "✓", onclick: () => send({ type: "markRead", id: s.id }) }) : "");
  }));
}

$("#lib").onclick = () => open(chrome.runtime.getURL("library.html"));
$("#imp").onclick = () => open(chrome.runtime.getURL("library.html#import"));
$("#opts").onclick = () => chrome.runtime.openOptionsPage();
$("#site").onclick = async () => {
  const origin = `${url.protocol}//${url.hostname}/*`;
  if (!(await chrome.permissions.request({ origins: [origin] }))) return;
  const r = await send({ type: "addSite", origin, host: url.hostname, tabId: tab.id });
  if (r.error) alert(r.error);
};
$("#test").onclick = async () => {
  let r;
  try { r = await chrome.tabs.sendMessage(tab.id, { type: "extract" }); }
  catch { r = { error: "Content script isn't on this tab. Reload the page." }; }
  $("#out").hidden = false;
  $("#out").textContent = JSON.stringify(r, null, 2);
};

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { url = /^https?:/.test(tab?.url) ? new URL(tab.url) : null; } catch {}
  chrome.storage.onChanged.addListener(render);
  render();
})();
