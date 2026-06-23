const area = document.querySelector("#rules");
const status = document.querySelector("#status");
function validate(rules) {
  if (!Array.isArray(rules) || !rules.length) throw new Error("ルールは1件以上の配列にしてください");
  const ids = new Set();
  for (const rule of rules) {
    if (!rule.id || !rule.name || !Array.isArray(rule.urlPatterns) || !rule.bookSelector || !Array.isArray(rule.fields)) throw new Error(`必須項目が不足しています: ${rule.id || "IDなし"}`);
    if (!rule.fields.some((field) => field.key === "title")) throw new Error(`title項目がありません: ${rule.id}`);
    if (ids.has(rule.id)) throw new Error(`idが重複しています: ${rule.id}`); ids.add(rule.id);
    if (rule.importGuide && (!rule.importGuide.url || !rule.importGuide.summary || !Array.isArray(rule.importGuide.steps))) throw new Error(`importGuideの必須項目が不足しています: ${rule.id}`);
    document.createDocumentFragment().querySelector(rule.bookSelector);
    for (const spec of rule.fields) { if (!spec.key || !spec.label) throw new Error(`key/labelがない項目があります: ${rule.id}`); if (spec.match) new RegExp(spec.match, spec.flags || ""); }
    for (const transform of rule.titleCleanup || []) new RegExp(transform.match, transform.flags || "g");
    for (const statusRule of rule.statusRules || []) { if (!statusRule.field || !statusRule.status) throw new Error(`statusRulesの必須項目が不足しています: ${rule.id}`); new RegExp(statusRule.match, statusRule.flags || "i"); }
    for (const volume of rule.seriesGrouping?.volumePatterns || []) new RegExp(volume.match, volume.flags || "i");
  }
}
async function load() { const { rules } = await chrome.storage.local.get("rules"); area.value = JSON.stringify(rules || EBOOK_DEFAULT_RULES, null, 2); }
document.querySelector("#format").onclick = () => { try { area.value = JSON.stringify(JSON.parse(area.value), null, 2); status.textContent = "整形しました"; } catch (e) { status.textContent = `JSONエラー: ${e.message}`; } };
document.querySelector("#save").onclick = async () => { try { const rules = JSON.parse(area.value); validate(rules); await chrome.storage.local.set({ rules, rulesVersion: EBOOK_RULES_VERSION }); status.textContent = "保存しました。対象ページを再読み込みしてください。"; } catch (e) { status.textContent = `保存できません: ${e.message}`; } };
document.querySelector("#reset").onclick = async () => { if (confirm("標準ルールに戻しますか？")) { area.value = JSON.stringify(EBOOK_DEFAULT_RULES, null, 2); await chrome.storage.local.set({ rules: EBOOK_DEFAULT_RULES, rulesVersion: EBOOK_RULES_VERSION }); status.textContent = "標準ルールに戻しました"; } };
load();
