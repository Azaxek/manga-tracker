// Helpers shared by popup.js and library.js.
const $ = (s) => document.querySelector(s);
const h = (t, p = {}, ...k) => { const e = Object.assign(document.createElement(t), p); e.append(...k); return e; };
const send = (m) => chrome.runtime.sendMessage(m);
const ago = (t) => { const m = (Date.now() - t) / 6e4; return m < 60 ? `${Math.max(1, m | 0)}m ago` : m < 1440 ? `${(m / 60) | 0}h ago` : `${(m / 1440) | 0}d ago`; };

// Where "Continue" goes: the new chapter if there is one, else where you left off, else the series page.
const target = (s, p = {}) =>
  (p.unread ? p.latestUrl : p.url || p.latestUrl) ||
  (s.mdId && "https://mangadex.org/title/" + s.mdId) ||
  (s.anilistId && "https://anilist.co/manga/" + s.anilistId);
const newCount = (p) => (p?.unread ? Math.max(1, Math.round(p.latest - p.chapter)) : 0);
const readLabel = (s, p = {}) => (p.unread ? `Read Ch. ${p.latest}` : p.chapter !== undefined ? `Continue Ch. ${p.chapter}` : "Open");
const lastTouched = (s, p = {}) => p.time || s.added || 0;
const cover = (s, cls) => (s.cover ? h("img", { className: cls, src: s.cover, loading: "lazy" }) : h("div", { className: cls + " ph", textContent: s.title[0] || "?" }));
