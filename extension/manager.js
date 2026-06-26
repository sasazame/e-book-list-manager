let books = {};
let excludedBooks = {};
let records = [];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateValue = (value) => value ? new Date(value).getTime() || 0 : 0;
const displayDate = (value) => value ? new Date(value).toLocaleString("ja-JP") : "—";
const serviceKey = (record) => record.sourceId || record.source || "";

function option(value, label = value) { return `<option value="${esc(value)}">${esc(label)}</option>`; }

async function load() {
  const stored = await chrome.storage.local.get(["books", "excludedBooks"]);
  books = stored.books || {};
  excludedBooks = stored.excludedBooks || {};
  records = Object.values(books);
  refreshFilters();
  render();
}

function refreshFilters() {
  const sourceSelect = document.querySelector("#source");
  const selectedSource = sourceSelect.value;
  const selectedStatuses = new Set(Array.from(document.querySelectorAll("#status-filters input:checked")).map((input) => input.value));
  const sources = [...new Map(records.map((r) => [serviceKey(r), r.source]).filter(([value]) => value)).entries()].sort((a,b) => a[1].localeCompare(b[1],"ja"));
  const statuses = [...new Set(records.flatMap((r) => r.statuses || []))].sort((a,b) => a.localeCompare(b,"ja"));
  sourceSelect.innerHTML = option("", "すべて") + sources.map(([value, label]) => option(value, label)).join("");
  sourceSelect.value = sources.some(([value]) => value === selectedSource) ? selectedSource : "";
  document.querySelector("#status-filters").innerHTML = ['<label class="status-check"><input type="checkbox" value="__none__">ステータスなし</label>', ...statuses.map((s) => `<label class="status-check"><input type="checkbox" value="${esc(s)}">${esc(s)}</label>`)].join("");
  document.querySelectorAll("#status-filters input").forEach((input) => {
    input.checked = selectedStatuses.has(input.value);
    input.addEventListener("change", render);
  });
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
    return (!source || serviceKey(r) === source) && statusMatch && (!q || searchText.includes(q));
  });
  filtered = sortRecords(filtered, sort);
  document.querySelector("#summary").textContent = `${EbookCore.totalItemCount(filtered)}冊（${filtered.length} / ${records.length}シリーズ）`;
  document.querySelector("#delete-service").disabled = !source;
  document.querySelector("#rows").innerHTML = filtered.map(rowHtml).join("") || '<tr><td colspan="7" class="empty">条件に一致する書籍がありません</td></tr>';
  renderExclusions();
}

function rowHtml(r) {
  const ids = r.externalIds || [];
  const shownId = r.seriesId || ids[0] || "—";
  const hiddenCount = r.seriesId ? ids.length : Math.max(0, ids.length - 1);
  const allIds = [r.seriesId, ...ids].filter(Boolean).join("\n");
  const badges = (r.statuses || []).map((status) => `<span class="badge">${esc(status)}</span>`).join("") || '<span class="muted">—</span>';
  const cover = r.coverUrl ? `<img class="cover" src="${esc(r.coverUrl)}" alt="" loading="lazy">` : '<div class="cover placeholder"></div>';
  return `<tr><td><div class="book-cell">${cover}<div class="book-meta"><a class="book-title" href="${esc(r.detailUrl)}" target="_blank" rel="noreferrer">${esc(r.title)}</a><span class="book-authors">${esc(r.authors || "著者情報なし")}</span></div></div></td><td><span class="source-label">${esc(r.source)}</span></td><td class="volumes">${esc(EbookCore.formatVolumes(r.ownedVolumes) || "—")}</td><td><div class="badges">${badges}</div></td><td><div class="id-cell" title="${esc(allIds)}"><code>${esc(shownId)}</code>${hiddenCount ? `<span class="id-more">+${hiddenCount}</span>` : ""}</div></td><td class="dates"><span>追加 ${esc(displayDate(r.firstSeenAt || r.lastSeenAt))}</span><span>確認 ${esc(displayDate(r.lastSeenAt))}</span></td><td><button class="danger row-delete" data-delete-key="${esc(r.key)}">削除</button></td></tr>`;
}

function exclusionStorageKey(exclusion) {
  return exclusion.key || [exclusion.sourceId, exclusion.seriesId, exclusion.title].filter(Boolean).join(":");
}

function addExclusions(target, items) {
  const next = { ...target };
  for (const record of items) {
    const exclusion = EbookCore.createExclusion(record);
    next[exclusionStorageKey(exclusion)] = exclusion;
  }
  return next;
}

function renderExclusions() {
  const exclusions = Object.values(excludedBooks).sort((a,b) => (a.source || "").localeCompare(b.source || "","ja") || (a.title || "").localeCompare(b.title || "","ja"));
  document.querySelector("#excluded-summary").textContent = exclusions.length ? `${exclusions.length} 件を今後の収集から除外します` : "除外中のシリーズはありません";
  document.querySelector("#excluded-rows").innerHTML = exclusions.map(exclusionHtml).join("") || '<tr><td colspan="5" class="empty">除外リストは空です</td></tr>';
}

function exclusionHtml(exclusion) {
  const ids = [exclusion.seriesId, ...(exclusion.externalIds || [])].filter(Boolean);
  const shownId = ids[0] || exclusion.key || "—";
  const allIds = ids.join("\n");
  const cover = exclusion.coverUrl ? `<img class="cover" src="${esc(exclusion.coverUrl)}" alt="" loading="lazy">` : '<div class="cover placeholder"></div>';
  return `<tr><td><div class="book-cell">${cover}<div class="book-meta"><span class="book-title">${esc(exclusion.title || "タイトルなし")}</span><span class="book-authors">${esc(exclusion.authors || "著者情報なし")}</span></div></div></td><td><span class="source-label">${esc(exclusion.source || "—")}</span></td><td><div class="id-cell" title="${esc(allIds)}"><code>${esc(shownId)}</code>${ids.length > 1 ? `<span class="id-more">+${ids.length - 1}</span>` : ""}</div></td><td class="dates"><span>${esc(displayDate(exclusion.excludedAt))}</span></td><td><button class="secondary row-delete" data-unexclude-key="${esc(exclusionStorageKey(exclusion))}">除外解除</button></td></tr>`;
}

async function saveState(nextBooks, nextExcludedBooks = excludedBooks) {
  books = nextBooks;
  excludedBooks = nextExcludedBooks;
  await chrome.storage.local.set({ books, excludedBooks });
  records = Object.values(books);
  refreshFilters();
  render();
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
document.querySelector("#rows").onclick = async (event) => {
  const button = event.target.closest("[data-delete-key]");
  if (!button) return;
  const record = books[button.dataset.deleteKey];
  if (!record || !confirm(`「${record.title}」を削除しますか？`)) return;
  const shouldExclude = confirm("このシリーズを今後の収集からも除外しますか？");
  const nextBooks = { ...books };
  delete nextBooks[record.key];
  await saveState(nextBooks, shouldExclude ? addExclusions(excludedBooks, [record]) : excludedBooks);
};
document.querySelector("#delete-service").onclick = async () => {
  const selectedSource = document.querySelector("#source").value;
  if (!selectedSource) return;
  const sourceLabel = records.find((record) => serviceKey(record) === selectedSource)?.source || selectedSource;
  const deleteRecords = records.filter((record) => serviceKey(record) === selectedSource);
  if (!deleteRecords.length || !confirm(`${sourceLabel} の ${deleteRecords.length} シリーズを削除しますか？`)) return;
  const shouldExclude = confirm(`${sourceLabel} の削除対象を今後の収集からも除外しますか？`);
  await saveState(
    Object.fromEntries(Object.entries(books).filter(([, record]) => serviceKey(record) !== selectedSource)),
    shouldExclude ? addExclusions(excludedBooks, deleteRecords) : excludedBooks
  );
};
document.querySelector("#excluded-rows").onclick = async (event) => {
  const button = event.target.closest("[data-unexclude-key]");
  if (!button) return;
  const exclusion = excludedBooks[button.dataset.unexcludeKey];
  if (!exclusion || !confirm(`「${exclusion.title || exclusion.key}」を除外リストから削除しますか？`)) return;
  const nextExcludedBooks = { ...excludedBooks };
  delete nextExcludedBooks[button.dataset.unexcludeKey];
  await saveState(books, nextExcludedBooks);
};
document.querySelector("#clear").onclick = async () => {
  if (!confirm("収集済みデータをすべて削除しますか？")) return;
  const shouldExclude = records.length && confirm("削除対象を今後の収集からも除外しますか？");
  await saveState({}, shouldExclude ? addExclusions(excludedBooks, records) : excludedBooks);
};
load();
