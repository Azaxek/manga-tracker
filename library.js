const TABS = [["new", "New"], ["reading", "Reading"], ["plan", "Plan to read"], ["completed", "Completed"], ["dropped", "Dropped"], ["all", "All"]];
let d = { series: {}, progress: {} }, tab = null, q = "";
const open = (u) => chrome.tabs.create({ url: u });
const toast = (t) => { $("#toast").textContent = t; $("#toast").classList.add("on"); setTimeout(() => $("#toast").classList.remove("on"), 2500); };
const unread = (s) => d.progress[s.id]?.unread && !["dropped", "completed"].includes(s.status);
const inTab = (s, t) => t === "all" || (t === "new" ? unread(s) : s.status === t);

const SORT = {
  recent: (a, b) => lastTouched(b, d.progress[b.id]) - lastTouched(a, d.progress[a.id]),
  unread: (a, b) => !!unread(b) - !!unread(a) || SORT.recent(a, b),
  title: (a, b) => a.title.localeCompare(b.title),
  added: (a, b) => b.added - a.added,
};

function card(s) {
  const p = d.progress[s.id] || {};
  const go = target(s, p);
  const n = newCount(p);
  return h("article", { className: "card" },
    h("a", { className: "cv", href: "#", title: s.description || s.title, onclick: (e) => { e.preventDefault(); go && open(go); } },
      cover(s, "c"), unread(s) ? h("span", { className: "badge", textContent: n > 1 ? `${n} new` : "NEW" }) : ""),
    h("b", { textContent: s.title, title: s.title }),
    h("span", { className: "sub", textContent: p.chapter !== undefined ? `Ch. ${p.chapter}${p.latest > p.chapter ? " of " + p.latest : ""}` : "Not started" }),
    h("div", { className: "acts" },
      h("button", { className: "go " + (unread(s) ? "primary" : ""), textContent: readLabel(s, p), disabled: !go, onclick: () => go && open(go) }),
      p.unread ? h("button", { className: "icon", title: "Mark read up to the latest chapter", textContent: "✓", onclick: () => send({ type: "markRead", id: s.id }) }) : "",
      Object.assign(h("select", { title: "Status", onchange: (e) => send({ type: "setStatus", id: s.id, status: e.target.value }) },
        ...[["reading", "Reading"], ["plan", "Plan"], ["completed", "Done"], ["dropped", "Dropped"]].map(([v, t]) => h("option", { value: v, textContent: t }))), { value: s.status }),
      h("button", { className: "icon", title: "Wrong cover or no new-chapter alerts? Re-match by title", textContent: "⟳", onclick: () => {
        const t = prompt("Match this series on AniList and MangaDex as:", s.title);
        if (t) { send({ type: "rematch", id: s.id, title: t.trim() }); toast("Re-matching…"); }
      } }),
      h("button", { className: "icon", title: "Remove", textContent: "×", onclick: () => confirm(`Remove “${s.title}”?`) && send({ type: "remove", id: s.id }) })));
}

function render() {
  const all = Object.values(d.series);
  $("#empty").hidden = all.length > 0;
  $("#tabs").hidden = $("#grid").hidden = !all.length;
  if (tab === null) tab = all.some(unread) ? "new" : "all";
  const word = q.trim().toLowerCase();
  $("#tabs").replaceChildren(...TABS.map(([k, label]) =>
    h("button", { className: k === tab ? "on" : "", onclick: () => { tab = k; render(); } }, label, h("small", { textContent: all.filter((s) => inTab(s, k)).length }))));
  const rows = all.filter((s) => inTab(s, tab) && s.title.toLowerCase().includes(word)).sort(SORT[$("#sort").value]);
  $("#grid").replaceChildren(...(rows.length ? rows.map(card) : [h("p", { className: "mut", textContent: word ? "No matches." : "Nothing in this tab." })]));
}

const refresh = async () => { d = await chrome.storage.local.get({ series: {}, progress: {} }); render(); };
chrome.storage.onChanged.addListener(refresh);
$("#q").oninput = (e) => { q = e.target.value; render(); };
$("#sort").onchange = render;
addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); } });
$("#opts").onclick = () => chrome.runtime.openOptionsPage();
$("#add").onsubmit = async (e) => { e.preventDefault(); await send({ type: "add", title: e.target.t.value.trim() }); e.target.reset(); toast("Added."); };

// ---- import ----
let staged;
const pv = (t) => ($("#pv").textContent = t);
const fail = (e) => { staged = null; $("#go").hidden = true; pv(e.message || String(e)); };

async function stage(kind, payload) {
  const r = await send(kind === "json" ? { type: "importData", data: payload, dry: true } : { type: "importList", items: payload, dry: true });
  if (r.error) return fail(new Error(r.error));
  staged = { kind, payload };
  pv(`${r.added} new series, ${r.dupes} already in your library.`);
  $("#go").hidden = false;
}

const MAL_STATUS = { 1: "reading", 2: "completed", 3: "plan", 4: "dropped", 6: "plan" };
async function parseMal(file) {
  const text = file.name.endsWith(".gz")
    ? await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : await file.text();
  const x = new DOMParser().parseFromString(text, "text/xml");
  if (x.querySelector("parsererror")) throw new Error("That file isn't valid XML.");
  const items = [...x.querySelectorAll("manga")].map((m) => {
    const g = (t) => m.querySelector(t)?.textContent.trim() || "";
    const st = g("my_status").toLowerCase();
    return {
      title: g("manga_title"),
      status: MAL_STATUS[st] || (st.includes("read") && !st.includes("plan") ? "reading" : st.includes("complet") ? "completed" : st.includes("drop") ? "dropped" : "plan"),
      chapter: +g("my_read_chapters") || 0,
      meta: { malId: +g("manga_mangadb_id") || undefined },
    };
  }).filter((i) => i.title);
  if (!items.length) throw new Error("No manga found. Is this the anime export?");
  return items;
}

$("#mal").onchange = async (e) => { try { pv("Reading…"); await stage("list", await parseMal(e.target.files[0])); } catch (err) { fail(err); } };
$("#bak").onchange = async (e) => { try { await stage("json", JSON.parse(await e.target.files[0].text())); } catch (err) { fail(err); } };
$("#alb").onclick = async () => {
  const user = $("#alu").value.trim();
  if (!user) return;
  pv("Fetching…");
  const r = await send({ type: "fetchAniList", user });
  r.error ? fail(new Error(r.error)) : stage("list", r.items);
};
$("#go").onclick = async () => {
  const r = await send(staged.kind === "json" ? { type: "importData", data: staged.payload } : { type: "importList", items: staged.payload });
  $("#dlg").close();
  toast(r.error || `Imported ${r.added} series. Covers and new-chapter alerts fill in over the next few minutes.`);
  staged = null;
};
const openImport = () => { pv(""); $("#go").hidden = true; $("#dlg").showModal(); };
$("#imp").onclick = $("#imp2").onclick = openImport;
$("#close").onclick = () => $("#dlg").close();

refresh().then(() => { if (location.hash === "#import") openImport(); });
