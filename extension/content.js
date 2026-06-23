(async function () {
  "use strict";
  const { rules: savedRules } = await chrome.storage.local.get("rules");
  const rules = savedRules || globalThis.EBOOK_DEFAULT_RULES;
  const rule = rules.find((candidate) => candidate.enabled && EbookCore.matchesUrl(location.href, candidate.urlPatterns));
  if (!rule) return;

  let timer;
  let lastSignature = "";
  async function scan() {
    const raw = EbookCore.parseDocument(document, rule, location.href);
    const records = EbookCore.aggregateRecords(raw.map((item) => EbookCore.normalizeRecord(item, rule, location.href)));
    const signature = records.map((r) => r.key + r.title + r.statuses.join(",") + r.ownedVolumes.join(",")).sort().join("|");
    if (!records.length || signature === lastSignature) return;
    lastSignature = signature;
    try { await chrome.runtime.sendMessage({ type: "UPSERT_BOOKS", records, ruleId: rule.id }); } catch { /* extension reloaded */ }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 350); }

  await scan();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  chrome.runtime.onMessage.addListener((message) => { if (message.type === "RESCAN") schedule(); });
})();
