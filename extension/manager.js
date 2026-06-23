let records = [];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateValue = (value) => value ? new Date(value).getTime() || 0 : 0;
const displayDate = (value) => value ? new Date(value).toLocaleString("ja-JP") : "—";

function option(value, label = value) { return `<option value="${esc(value)}">${esc(label)}</option>`; }

async function load() {
  const { books = {} } = await chrome.storage.local.get("books");
  records = Object.values(books);
  const sources = [...new Set(records.map((r) => r.source).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ja"));
  const statuses = [...new Set(records.flatMap((r) => r.statuses || []))].sort((a,b) => a.localeCompare(b,"ja"));
  document.querySelector("#source").innerHTML = option("", "すべて") + sources.map((s) => option(s)).join("");
  document.querySelector("#status-filters").innerHTML = ['<label class="status-check"><input type="checkbox" value="__none__">ステータスなし</label>', ...statuses.map((s) => `<label class="status-check"><input type="checkbox" value="${esc(s)}">${esc(s)}</label>`)].join("");
  document.querySelectorAll("#status-filters input").forEach((input) => input.addEventListener("change", render));
  render();
}

function sortRecords(items, sort) {
  const title = (a, b) => a.title.localeCompare(b.title, "ja", { numeric: true });
  const comparators = {
    "added-desc": (a,b) => dateValue(b.firstSeenAt || b.lastSeenAt) - dateValue(a.firstSeenAt || a.lastSeenAt) || title(a,b),
    "added-asc": (a,b) => dateValue(a.firstSeenAt || a.lastSeenAt) - dateValue(b.firstSeenAt || b.lastSeenAt) || title(a,b),
    "updated-desc": (a,b) => dateValue(b.lastSeenAt) - dateValue(a.lastSeenAt) || title(a,b),
    "title-asc": title,
    "title-desc": (a,b) => -title(a,b),
    "volumes-desc": (a,b) => (b.ownedVolumes?.length || 0) - (a.ownedVolumes?.length || 0) || title(a,b),
    "volumes-asc": (a,b) => (a.ownedVolumes?.length || 0) - (b.ownedVolumes?.length || 0) || title(a,b),
    "source-asc": (a,b) => a.source.localeCompare(b.source,"ja") || title(a,b)
  };
  return [...items].sort(comparators[sort] || comparators["added-desc"]);
}

function render() {
  const q = document.querySelector("#query").value.toLowerCase();
  const source = document.querySelector("#source").value;
  const selectedStatuses = Array.from(document.querySelectorAll("#status-filters input:checked")).map((input) => input.value);
  const sort = document.querySelector("#sort").value;
  let filtered = records.filter((r) => {
    const statuses = r.statuses || [];
    const wantsNoStatus = selectedStatuses.includes("__none__");
    const requested = selectedStatuses.filter((item) => item !== "__none__");
    const statusMatch = !selectedStatuses.length || (wantsNoStatus && statuses.length === 0) || requested.every((item) => statuses.includes(item));
    const searchText = [r.title,r.authors,r.source,r.seriesId,...(r.externalIds || []),...statuses].join(" ").toLowerCase();
    return (!source || r.source === source) && statusMatch && (!q || searchText.includes(q));
  });
  filtered = sortRecords(filtered, sort);
  document.querySelector("#summary").textContent = `${EbookCore.totalItemCount(filtered)}冊（${filtered.length} / ${records.length}シリーズ）`;
  document.querySelector("#rows").innerHTML = filtered.map(rowHtml).join("") || '<tr><td colspan="6" class="empty">条件に一致する書籍がありません</td></tr>';
}

function rowHtml(r) {
  const ids = r.externalIds || [];
  const shownId = r.seriesId || ids[0] || "—";
  const hiddenCount = r.seriesId ? ids.length : Math.max(0, ids.length - 1);
  const allIds = [r.seriesId, ...ids].filter(Boolean).join("\n");
  const badges = (r.statuses || []).map((status) => `<span class="badge">${esc(status)}</span>`).join("") || '<span class="muted">—</span>';
  const cover = r.coverUrl ? `<img class="cover" src="${esc(r.coverUrl)}" alt="" loading="lazy">` : '<div class="cover placeholder"></div>';
  return `<tr><td><div class="book-cell">${cover}<div class="book-meta"><a class="book-title" href="${esc(r.detailUrl)}" target="_blank" rel="noreferrer">${esc(r.title)}</a><span class="book-authors">${esc(r.authors || "著者情報なし")}</span></div></div></td><td><span class="source-label">${esc(r.source)}</span></td><td class="volumes">${esc(EbookCore.formatVolumes(r.ownedVolumes) || "—")}</td><td><div class="badges">${badges}</div></td><td><div class="id-cell" title="${esc(allIds)}"><code>${esc(shownId)}</code>${hiddenCount ? `<span class="id-more">+${hiddenCount}</span>` : ""}</div></td><td class="dates"><span>追加 ${esc(displayDate(r.firstSeenAt || r.lastSeenAt))}</span><span>確認 ${esc(displayDate(r.lastSeenAt))}</span></td></tr>`;
}

for (const selector of ["#query", "#source", "#sort"]) document.querySelector(selector).addEventListener(selector === "#query" ? "input" : "change", render);
document.querySelector("#options").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#guide").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("guide.html") });
document.querySelector("#back-to-top").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
addEventListener("scroll", () => {
  document.querySelector("#back-to-top").classList.toggle("visible", scrollY > 420);
}, { passive: true });
document.querySelector("#csv").onclick = () => {
  const blob = new Blob([EbookCore.toCsv(records)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ebook-list-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
document.querySelector("#clear").onclick = async () => { if (confirm("収集済みデータをすべて削除しますか？")) { await chrome.storage.local.set({ books: {} }); records = []; render(); } };
load();
