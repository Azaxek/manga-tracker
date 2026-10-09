const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);
const say = (t) => ($("#msg").textContent = t);
const DEF = { interval: 60, notify: true, metadata: true };
const getSettings = async () => ({ ...DEF, ...(await chrome.storage.local.get({ settings: {} })).settings });
const saveSettings = async (patch) => chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });

(async () => {
  const s = await getSettings();
  $("#interval").value = s.interval;
  $("#notify").checked = s.notify;
  $("#metadata").checked = s.metadata;
  await hosts();
})();
$("#interval").onchange = (e) => saveSettings({ interval: Math.max(15, +e.target.value || 60) });
$("#notify").onchange = (e) => saveSettings({ notify: e.target.checked });
$("#metadata").onchange = (e) => saveSettings({ metadata: e.target.checked });
$("#checknow").onclick = async (e) => { e.target.disabled = true; await send({ type: "check" }); e.target.disabled = false; };

$("#export").onclick = async () => {
  const data = { version: 1, ...(await chrome.storage.local.get({ series: {}, progress: {}, rules: {}, settings: {} })) };
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })),
    download: `manga-tracker-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  saveSettings({ lastExport: Date.now() });
};

async function hosts() {
  const { rules } = await chrome.storage.local.get({ rules: {} });
  $("#host").replaceChildren(...Object.keys(rules).map((h) => new Option(h)));
  $("#rule").value = rules[$("#host").value] ? JSON.stringify(rules[$("#host").value], null, 2) : "";
}
$("#host").onchange = hosts;
$("#save").onclick = async () => {
  try {
    const rule = JSON.parse($("#rule").value);
    [rule.match, rule.series?.re, rule.chapter?.re].forEach((r) => r && new RegExp(r)); // throws on bad regex
    const { rules } = await chrome.storage.local.get({ rules: {} });
    rules[$("#host").value] = rule;
    await chrome.storage.local.set({ rules });
    say("Saved.");
  } catch (e) { say("Invalid: " + e.message); }
};
$("#del").onclick = async () => { await send({ type: "removeSite", host: $("#host").value }); hosts(); };
