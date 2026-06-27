async function refresh() {
  const { books = {}, lastImport } = await chrome.storage.local.get(["books", "lastImport"]);
  const records = Object.values(books);
  document.querySelector("#count").textContent = `${EbookCore.itemCountSummary(records)}（${records.length}シリーズ）`;
  if (lastImport) document.querySelector("#last").textContent = `直近: ${lastImport.count}件 / ${new Date(lastImport.at).toLocaleString("ja-JP")}`;
}
document.querySelector("#manager").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
document.querySelector("#guide").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("guide.html") });
document.querySelector("#options").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#rescan").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { await chrome.tabs.sendMessage(tab.id, { type: "RESCAN" }); document.querySelector("#status").textContent = "再解析を要求しました"; setTimeout(refresh, 500); }
  catch { document.querySelector("#status").textContent = "このURLは収集対象ではありません"; }
};
refresh();
