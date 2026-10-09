importScripts("shared.js");

const DAY = 864e5;
const MD = "https://api.mangadex.org";
const MD_RATINGS = ["safe", "suggestive", "erotica", "pornographic"].map((r) => `&contentRating[]=${r}`).join("");
const DEF = { interval: 60, notify: true, metadata: true };
const store = chrome.storage.local;

const load = async () => {
  const d = await store.get({ series: {}, progress: {}, rules: {}, settings: {}, warnings: {} });
  d.settings = { ...DEF, ...d.settings };
  return d;
};

// All read-modify-write goes through one queue so concurrent messages can't clobber each other.
let chain = Promise.resolve();
const locked = (fn) => {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
};

// ponytail: throttle slots live in memory; a worker restart forgets them. Backoff is persisted.
const nextSlot = {};
async function http(url, opts) {
  const host = new URL(url).host;
  const { backoff = {} } = await store.get("backoff");
  const b = backoff[host];
  if (b && b.until > Date.now()) throw new Error("backing off " + host);
  const at = Math.max(Date.now(), nextSlot[host] || 0);
  nextSlot[host] = at + (host.includes("anilist") ? 2100 : 1000) + Math.random() * 500; // anilist: stay under its 30/min fallback
  await new Promise((r) => setTimeout(r, at - Date.now()));
  const r = await fetch(url, opts);
  if (r.status === 429 || r.status === 403) {
    const ms = Math.max((+r.headers.get("retry-after") || 0) * 1000, (b?.ms || 30000) * 2);
    backoff[host] = { until: Date.now() + ms, ms };
    await store.set({ backoff });
    throw new Error(`${r.status} from ${host}`);
  }
  if (!r.ok) throw new Error(`${r.status} from ${host}`);
  if (b) { delete backoff[host]; await store.set({ backoff }); }
  return r.json();
}

async function badge() {
  const { series, progress } = await load();
  const n = Object.values(series).filter((s) => ["reading", "plan"].includes(s.status) && progress[s.id]?.unread).length;
  chrome.action.setBadgeText({ text: n ? String(n) : "" });
}

const looking = new Set();
const AL = "https://graphql.anilist.co";
const alPost = (query, variables) =>
  http(AL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
const clean = (t) => (t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const needsLookup = (s) => !s.metaDone || (!s.mdId && !s.mdTried);

// AniList (cover/description) and MangaDex (id for new-chapter checks) are looked up independently.
// A step is only marked done when its request succeeded, so failures retry on the next check.
async function lookup(id) {
  if (looking.has(id) || !(await load()).settings.metadata) return;
  looking.add(id);
  try {
    const s = (await load()).series[id];
    if (!s) return;
    const meta = {};
    if (!s.metaDone) {
      try {
        const byMal = !!s.malId;
        const j = await alPost(
          `query(${byMal ? "$m:Int" : "$s:String"}){Media(${byMal ? "idMal:$m" : "search:$s"},type:MANGA){id coverImage{medium} description(asHtml:false)}}`,
          byMal ? { m: s.malId } : { s: s.title });
        const m = j.data?.Media;
        if (m) Object.assign(meta, { anilistId: m.id, cover: m.coverImage?.medium, description: clean(m.description) });
        meta.metaDone = true;
      } catch {}
    }
    if (!s.mdId && !s.mdTried) {
      try {
        const j = await http(`${MD}/manga?title=${encodeURIComponent(s.title)}&limit=1&order[relevance]=desc${MD_RATINGS}`);
        if (j.data?.[0]) meta.mdId = j.data[0].id;
        meta.mdTried = true;
      } catch {}
    }
    await locked(async () => {
      const { series } = await load();
      if (series[id]) { Object.assign(series[id], meta); await store.set({ series }); }
    });
  } finally { looking.delete(id); }
}

async function check(force) {
  for (const s of Object.values((await load()).series)) if (needsLookup(s)) await lookup(s.id);
  const { series, settings } = await load();
  const now = Date.now();
  for (const s of Object.values(series)) {
    if (s.status !== "reading" || !s.mdId) continue; // completed/dropped/plan are never polled
    const old = (await load()).progress[s.id] || {};
    if (!force && now - (old.newAt || s.added) > 30 * DAY && now - (s.checked || 0) < DAY) continue;
    let c, n;
    try {
      c = (await http(`${MD}/manga/${s.mdId}/feed?limit=1&order[chapter]=desc&translatedLanguage[]=en${MD_RATINGS}`)).data?.[0];
      n = parseFloat(c?.attributes.chapter);
    } catch { continue; }
    let announce = false;
    await locked(async () => {
      const d = await load();
      if (!d.series[s.id]) return;
      const p = (d.progress[s.id] ??= {});
      d.series[s.id].checked = now;
      if (n > (p.latest ?? 0)) {
        announce = p.latest !== undefined; // first sighting just records the baseline
        Object.assign(p, { latest: n, latestUrl: "https://mangadex.org/chapter/" + c.id, newAt: now });
      }
      p.unread = p.chapter !== undefined && p.latest > p.chapter;
      await store.set({ series: d.series, progress: d.progress });
    });
    if (announce && settings.notify)
      chrome.notifications.create("new:" + s.id, {
        type: "basic", iconUrl: chrome.runtime.getURL("icon.png"), title: s.title, message: `Chapter ${n} is out`,
      });
  }
  await exportReminder();
  await badge();
}

async function exportReminder() {
  const { series, settings } = await load();
  const added = Object.values(series).map((s) => s.added);
  const last = settings.lastExport ?? Math.min(...added);
  const now = Date.now();
  if (!settings.notify || !added.length || now - last < 30 * DAY || now - (settings.remindedAt || 0) < 30 * DAY) return;
  await store.set({ settings: { ...settings, remindedAt: now } });
  chrome.notifications.create("export", {
    type: "basic", iconUrl: chrome.runtime.getURL("icon.png"), title: "Back up your manga library",
    message: "The browser can wipe extension data. Export a JSON copy from Settings.",
  });
}

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  if (id === "export") return chrome.runtime.openOptionsPage();
  const p = (await load()).progress[id.slice(4)];
  if (p?.latestUrl) chrome.tabs.create({ url: p.latestUrl });
});

async function setup() {
  const { settings } = await load();
  const a = await chrome.alarms.get("check");
  if (a?.periodInMinutes !== settings.interval) chrome.alarms.create("check", { periodInMinutes: settings.interval });
  badge();
}
chrome.runtime.onInstalled.addListener((e) => {
  setup();
  if (e.reason === "install") chrome.tabs.create({ url: "library.html" });
});
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener((a) => a.name === "check" && check(false));
chrome.storage.onChanged.addListener((c) => c.settings && setup());
setup();

const handlers = {
  async read({ series: title, chapter, url, host }) {
    const id = slug(title);
    if (!id) return;
    const now = Date.now();
    let s;
    await locked(async () => {
      const d = await load();
      s = d.series[id] ??= { id, title, status: "reading", added: now };
      if (s.status === "plan") s.status = "reading";
      s.updated = now;
      const p = (d.progress[id] ??= {});
      Object.assign(p, { chapter, url, time: now });
      if (chapter >= (p.latest ?? 0)) Object.assign(p, { latest: chapter, latestUrl: url });
      p.unread = p.latest > chapter;
      delete d.warnings[host];
      await store.set({ series: d.series, progress: d.progress, warnings: d.warnings });
    });
    chrome.action.setBadgeText({ text: "Ch." + chapter });
    setTimeout(badge, 3000);
    if (needsLookup(s)) lookup(id);
  },
  async fail({ host }) {
    await locked(async () => store.set({ warnings: { ...(await load()).warnings, [host]: Date.now() } }));
  },
  async add({ title }) {
    const id = slug(title);
    if (!id) return;
    await locked(async () => {
      const { series } = await load();
      series[id] ??= { id, title, status: "reading", added: Date.now(), updated: Date.now() };
      await store.set({ series });
    });
    lookup(id);
  },
  async markRead({ id }) {
    await locked(async () => {
      const { series, progress } = await load();
      const p = progress[id];
      if (!p || p.latest === undefined) return;
      Object.assign(p, { chapter: p.latest, url: p.latestUrl ?? p.url, time: Date.now(), unread: false });
      series[id].updated = Date.now();
      await store.set({ series, progress });
    });
    badge();
  },
  async setStatus({ id, status }) {
    await locked(async () => {
      const { series } = await load();
      if (series[id]) { Object.assign(series[id], { status, updated: Date.now() }); await store.set({ series }); }
    });
    badge();
  },
  async remove({ id }) {
    await locked(async () => {
      const { series, progress } = await load();
      delete series[id]; delete progress[id];
      await store.set({ series, progress });
    });
    badge();
  },
  async rematch({ id, title }) {
    await locked(async () => {
      const { series } = await load();
      if (series[id]) {
        for (const k of ["metaDone", "mdTried", "mdId", "malId", "anilistId", "cover", "description"]) delete series[id][k];
        series[id].title = title;
        await store.set({ series });
      }
    });
    await lookup(id);
    check(true);
  },
  // Public AniList list by username: no login. Returns items for importList.
  async fetchAniList({ user }) {
    let j;
    try {
      j = await alPost(
        "query($u:String){MediaListCollection(userName:$u,type:MANGA){lists{entries{status progress media{id idMal title{romaji english} coverImage{medium} description(asHtml:false)}}}}}",
        { u: user });
    } catch (e) { throw new Error(/^404/.test(e.message) ? "No public AniList list for that username." : e.message); }
    const map = { CURRENT: "reading", REPEATING: "reading", COMPLETED: "completed", DROPPED: "dropped", PAUSED: "plan", PLANNING: "plan" };
    const items = (j.data?.MediaListCollection?.lists || []).flatMap((l) => l.entries).map((e) => ({
      title: e.media.title.romaji || e.media.title.english,
      status: map[e.status] || "plan",
      chapter: e.progress || 0,
      meta: { anilistId: e.media.id, malId: e.media.idMal || undefined, cover: e.media.coverImage?.medium, description: clean(e.media.description), metaDone: true },
    }));
    if (!items.length) throw new Error("That list is empty (or private).");
    return { items };
  },
  // items: [{title, status, chapter, meta}]. Existing series keep their furthest chapter.
  importList({ items, dry }) {
    return locked(async () => {
      const d = await load();
      const now = Date.now();
      const r = { added: 0, dupes: 0 };
      for (const it of items) {
        const id = slug(it.title);
        if (!id) continue;
        if (d.series[id]) r.dupes++;
        else { r.added++; if (!dry) d.series[id] = { id, title: it.title, status: it.status, added: now, updated: now, ...it.meta }; }
        if (!dry && it.chapter > 0) {
          const p = (d.progress[id] ??= {});
          if ((p.chapter ?? 0) < it.chapter) p.chapter = it.chapter;
          p.unread = p.latest > p.chapter;
        }
      }
      if (!dry) { await store.set({ series: d.series, progress: d.progress }); badge(); }
      return r;
    });
  },
  async addSite({ origin, host, tabId }) {
    try { await chrome.scripting.unregisterContentScripts({ ids: ["site-" + host] }); } catch {}
    await chrome.scripting.registerContentScripts([
      { id: "site-" + host, matches: [origin], js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true },
    ]);
    await locked(async () => {
      const { rules } = await load();
      rules[host] ??= { ...template(host), origin };
      await store.set({ rules });
    });
    if (tabId) await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  },
  async removeSite({ host }) {
    const { rules } = await load();
    try { await chrome.scripting.unregisterContentScripts({ ids: ["site-" + host] }); } catch {}
    if (rules[host]?.origin) await chrome.permissions.remove({ origins: [rules[host].origin] });
    delete rules[host];
    await store.set({ rules });
  },
  async check() { await check(true); },
  importData({ data, dry }) {
    if (data?.version !== 1) throw new Error("Not a Manga Tracker export");
    return locked(async () => {
      const d = await load();
      const raw = (await store.get({ settings: {} })).settings;
      const r = { added: 0, dupes: 0, rules: 0 };
      for (const [id, s] of Object.entries(data.series || {})) {
        const cur = d.series[id];
        if (!cur) { r.added++; d.series[id] = s; }
        else { r.dupes++; if ((s.updated || 0) > (cur.updated || 0)) Object.assign(cur, s); }
        const p = data.progress?.[id], q = d.progress[id];
        if (p) {
          const m = { ...(!q || (p.time || 0) > (q.time || 0) ? p : q), latest: Math.max(p.latest || 0, q?.latest || 0) || undefined };
          m.unread = m.chapter !== undefined && m.latest > m.chapter;
          d.progress[id] = m;
        }
      }
      for (const [h, rule] of Object.entries(data.rules || {})) if (!d.rules[h]) { r.rules++; d.rules[h] = rule; }
      if (!dry) {
        await store.set({ series: d.series, progress: d.progress, rules: d.rules, settings: { ...data.settings, ...raw } });
        badge();
      }
      return r;
    });
  },
};

chrome.runtime.onMessage.addListener((m, _s, send) => {
  const f = handlers[m.type];
  if (!f) return;
  Promise.resolve(f(m)).then((r) => send(r ?? {}), (e) => send({ error: String(e.message || e) }));
  return true;
});
