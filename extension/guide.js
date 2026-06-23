const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function load() {
  const { rules } = await chrome.storage.local.get("rules");
  const defaultsById = new Map(EBOOK_DEFAULT_RULES.map((rule) => [rule.id, rule]));
  const activeRules = (rules || EBOOK_DEFAULT_RULES)
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ({ ...defaultsById.get(rule.id), ...rule, importGuide: rule.importGuide || defaultsById.get(rule.id)?.importGuide }))
    .filter((rule) => rule.importGuide);
  document.querySelector("#guides").innerHTML = activeRules.map((rule) => {
    const guide = rule.importGuide;
    const navigable = !guide.url.includes("<");
    const action = navigable
      ? `<a class="guide-button" href="${esc(guide.url)}" target="_blank" rel="noreferrer">ページを開く</a>`
      : '<span class="guide-auto">対象ページから自動取り込み</span>';
    return `<article class="card guide-card"><div class="guide-heading"><div><span class="guide-service">${esc(rule.collectionName || rule.name)}</span><h2>${esc(rule.name)}</h2></div>${action}</div><p>${esc(guide.summary)}</p><div class="guide-url"><span>対象URL</span><code>${esc(guide.url)}</code></div><ol>${(guide.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol>${guide.note ? `<div class="guide-note">${esc(guide.note)}</div>` : ""}</article>`;
  }).join("") || '<div class="card empty">有効な取り込みガイドがありません。</div>';
}

document.querySelector("#manager").onclick = () => location.href = chrome.runtime.getURL("manager.html");
document.querySelector("#options").onclick = () => chrome.runtime.openOptionsPage();
load();
