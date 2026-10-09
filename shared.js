// Pure helpers: loaded by the service worker via importScripts, and by test.js via require.
const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Starting rule for a newly added site. Users edit it in Settings → Sites.
// series/chapter: read `from` ("url" | "title" | "selector" via sel+attr), apply `re`, take group 1.
const template = (host) => ({
  id: host,
  match: "(?:chapter|ch)[-_/. ]*\\d",
  series: { from: "title", re: "^(.+?)\\s*[-–|:]?\\s*(?:chapter|ch\\.?)\\s*\\d" },
  chapter: { from: "url", re: "(?:chapter|ch)[-_/. ]*(\\d+(?:\\.\\d+)?)" },
});

if (typeof module !== "undefined") module.exports = { slug, template };
