let books = {};
let excludedBooks = {};
let records = [];
let editingStatusKey = "";
let rowActionKey = "";
let cancelDmmFetch = false;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateValue = (value) => value ? new Date(value).getTime() || 0 : 0;
const displayDate = (value) => value ? new Date(value).toLocaleString("ja-JP") : "—";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serviceKey = (record) => record.sourceId || record.source || "";
const recordStatuses = (record) => EbookCore.recordStatuses ? EbookCore.recordStatuses(record) : [...new Set([...(record.statuses || []), ...(record.manualStatuses || [])])];
const detailUrlFor = (record) => {
  if ((record.sourceId || "") === "dmm-books" && record.seriesId) return `https://book.dmm.com/product/${encodeURIComponent(record.seriesId)}/volumes/?tab=purchased`;
  return record.detailUrl || "#";
};
const itemCountFor = (record) => EbookCore.recordItemCount ? EbookCore.recordItemCount(record) : Math.max(record.ownedVolumes?.length || 0, record.externalIds?.length || 0, 1);
const ownedVolumesText = (record) => {
  if (EbookCore.hasUnknownOwnedVolumes?.(record)) return "不明";
  const volumes = EbookCore.formatVolumes(record.ownedVolumes);
  const count = itemCountFor(record);
  const volumeCount = new Set((record.ownedVolumes || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)).size;
  const idCount = EbookCore.countableExternalIds ? EbookCore.countableExternalIds(record).length : (record.externalIds || []).length;
  if (volumes && count > volumeCount && idCount > volumeCount) return `${volumes}（${count}冊）`;
  return volumes || `${count}冊`;
};

function option(value, label = value) { return `<option value="${esc(value)}">${esc(label)}</option>`; }
function closeActionMenu() {
  document.querySelector("#action-menu").hidden = true;
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
}
function closeRowActionMenu() {
  document.querySelector("#row-action-popover").hidden = true;
  rowActionKey = "";
}

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
  const statuses = [...new Set(records.flatMap(recordStatuses))].sort((a,b) => a.localeCompare(b,"ja"));
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
    "volumes-desc": (a,b) => itemCountFor(b) - itemCountFor(a) || title(a,b),
    "volumes-asc": (a,b) => itemCountFor(a) - itemCountFor(b) || title(a,b),
    "source-asc": (a,b) => a.source.localeCompare(b.source,"ja") || title(a,b)
  };
  return [...items].sort(comparators[sort] || comparators["added-asc"]);
}

function render() {
  const q = document.querySelector("#query").value.toLowerCase();
  const source = document.querySelector("#source").value;
  const favoriteOnly = document.querySelector("#favorite-only").checked;
  const selectedStatuses = Array.from(document.querySelectorAll("#status-filters input:checked")).map((input) => input.value);
  const sort = document.querySelector("#sort").value;
  let filtered = records.filter((r) => {
    const statuses = recordStatuses(r);
    const wantsNoStatus = selectedStatuses.includes("__none__");
    const requested = selectedStatuses.filter((item) => item !== "__none__");
    const statusMatch = !selectedStatuses.length || (wantsNoStatus && statuses.length === 0) || requested.every((item) => statuses.includes(item));
    const searchText = [r.title,r.authors,r.source,r.seriesId,r.favorite ? "お気に入り favorite" : "",...(r.externalIds || []),...statuses].join(" ").toLowerCase();
    return (!favoriteOnly || r.favorite) && (!source || serviceKey(r) === source) && statusMatch && (!q || searchText.includes(q));
  });
  filtered = sortRecords(filtered, sort);
  document.querySelector("#summary").textContent = `${EbookCore.itemCountSummary(filtered)}（${filtered.length} / ${records.length}シリーズ）`;
  const deleteServiceButton = document.querySelector("#delete-service");
  deleteServiceButton.disabled = source === "";
  deleteServiceButton.setAttribute("aria-disabled", String(source === ""));
  document.querySelector("#fetch-dmm-volumes").hidden = source !== "dmm-books";
  document.querySelector("#rows").innerHTML = filtered.map(rowHtml).join("") || '<tr><td colspan="7" class="empty">条件に一致する書籍がありません</td></tr>';
  renderExclusions();
}

function rowHtml(r) {
  const badges = recordStatuses(r).map((status) => `<span class="badge">${esc(status)}</span>`).join("") || '<span class="muted">—</span>';
  const cover = r.coverUrl ? `<img class="cover" src="${esc(r.coverUrl)}" alt="" loading="lazy">` : '<div class="cover placeholder"></div>';
  return `<tr><td class="favorite-cell"><button class="favorite-button${r.favorite ? " active" : ""}" data-favorite-key="${esc(r.key)}" aria-label="${r.favorite ? "お気に入りから外す" : "お気に入りに追加"}" title="${r.favorite ? "お気に入りから外す" : "お気に入りに追加"}">${r.favorite ? "★" : "☆"}</button></td><td><div class="book-cell">${cover}<div class="book-meta"><a class="book-title" href="${esc(detailUrlFor(r))}" target="_blank" rel="noreferrer">${esc(r.title)}</a><span class="book-authors">${esc(r.authors || "著者情報なし")}</span></div></div></td><td><span class="source-label">${esc(r.source)}</span></td><td class="volumes">${esc(ownedVolumesText(r))}</td><td><div class="badges">${badges}</div></td><td class="dates"><span>追加 ${esc(displayDate(r.firstSeenAt || r.lastSeenAt))}</span><span>確認 ${esc(displayDate(r.lastSeenAt))}</span></td><td><button class="icon-menu-button" data-row-menu-key="${esc(r.key)}" aria-haspopup="menu" aria-label="操作メニュー">⋮</button></td></tr>`;
}

function parseManualStatuses(value) {
  return [...new Set(String(value || "").split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean))];
}

function setManualStatuses(statuses) {
  document.querySelector("#manual-statuses").value = statuses.join("\n");
  syncStatusChoices(statuses);
}

function syncStatusChoices(statuses = parseManualStatuses(document.querySelector("#manual-statuses").value)) {
  document.querySelectorAll("#status-picker input").forEach((input) => {
    input.checked = statuses.includes(input.value);
  });
}

function statusCandidates() {
  return [...new Set(records.flatMap(recordStatuses))].sort((a,b) => a.localeCompare(b,"ja"));
}

function openStatusEditor(record) {
  editingStatusKey = record.key;
  document.querySelector("#status-target").textContent = `${record.source} / ${record.title}`;
  const automaticStatuses = record.statuses || [];
  const manualStatuses = record.manualStatuses || [];
  document.querySelector("#auto-statuses").innerHTML = automaticStatuses.map((status) => `<span class="badge">${esc(status)}</span>`).join("") || '<span class="muted">—</span>';
  document.querySelector("#status-picker").innerHTML = statusCandidates().map((status) => `<label class="status-choice"><input type="checkbox" value="${esc(status)}"${manualStatuses.includes(status) ? " checked" : ""}>${esc(status)}</label>`).join("") || '<span class="muted">既存ステータスはありません</span>';
  setManualStatuses(manualStatuses);
  document.querySelector("#status-dialog").showModal();
}

function openRowActionMenu(button) {
  const popover = document.querySelector("#row-action-popover");
  const rect = button.getBoundingClientRect();
  rowActionKey = button.dataset.rowMenuKey;
  popover.hidden = false;
  const width = popover.offsetWidth;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - popover.offsetHeight - 8)}px`;
}

function dmmTargetSeries() {
  const seen = new Set();
  return records.filter((record) => serviceKey(record) === "dmm-books" && record.seriesId)
    .filter((record) => {
      if (seen.has(record.seriesId)) return false;
      seen.add(record.seriesId);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ja", { numeric: true }));
}

async function refreshBooksOnly() {
  const stored = await chrome.storage.local.get(["books", "excludedBooks"]);
  books = stored.books || {};
  excludedBooks = stored.excludedBooks || {};
  records = Object.values(books);
  refreshFilters();
  render();
}

async function fetchDmmVolumes() {
  const targets = dmmTargetSeries();
  const dialog = document.querySelector("#dmm-fetch-dialog");
  const progress = document.querySelector("#dmm-fetch-progress");
  const detail = document.querySelector("#dmm-fetch-detail");
  const spinner = dialog.querySelector(".spinner");
  const closeButton = document.querySelector("#close-dmm-fetch");
  const cancelButton = document.querySelector("#cancel-dmm-fetch");
  if (!targets.length) {
    document.querySelector("#status").textContent = "DMM Booksのシリーズがありません。";
    return;
  }
  cancelDmmFetch = false;
  spinner.hidden = false;
  closeButton.hidden = true;
  cancelButton.hidden = false;
  progress.textContent = `0 / ${targets.length} 件`;
  detail.textContent = "DMM Booksへログイン済みの状態で実行してください。";
  dialog.showModal();
  let ok = 0, failed = 0;
  const errors = [];
  for (let index = 0; index < targets.length; index += 1) {
    if (cancelDmmFetch) break;
    const target = targets[index];
    progress.textContent = `${index + 1} / ${targets.length} 件`;
    detail.textContent = target.title;
    try {
      const response = await chrome.runtime.sendMessage({ type: "FETCH_DMM_VOLUMES", seriesId: target.seriesId });
      if (response?.ok) ok += 1;
      else {
        failed += 1;
        errors.push(`${target.title}: ${response?.error || "取得できませんでした"}`);
      }
    } catch {
      failed += 1;
      errors.push(`${target.title}: 取得できませんでした`);
    }
    if (!cancelDmmFetch && index < targets.length - 1) await sleep(1000);
  }
  await refreshBooksOnly();
  progress.textContent = cancelDmmFetch ? "キャンセルしました" : "取得が完了しました";
  detail.textContent = `成功 ${ok} 件 / 失敗 ${failed} 件${errors.length ? `（${errors[0]}）` : ""}`;
  spinner.hidden = true;
  cancelButton.hidden = true;
  closeButton.hidden = false;
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
  document.querySelector("#show-exclusions").textContent = exclusions.length ? `除外リスト（${exclusions.length}）` : "除外リスト";
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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("CSVを読み込めませんでした"));
    reader.readAsText(file);
  });
}

function mergeImportedRecords(importedRecords) {
  const nextBooks = { ...books };
  for (const record of importedRecords) nextBooks[record.key] = EbookCore.mergeRecords(nextBooks[record.key], record);
  return nextBooks;
}

async function importCsvFile(file) {
  if (!file) return;
  try {
    const importedRecords = EbookCore.fromCsv(await readFileAsText(file), { rules: globalThis.EBOOK_DEFAULT_RULES || [] });
    if (!importedRecords.length) {
      document.querySelector("#status").textContent = "取り込めるCSVデータがありません。";
      return;
    }
    const beforeCount = Object.keys(books).length;
    const mergedBooks = mergeImportedRecords(importedRecords);
    const added = Object.keys(mergedBooks).length - beforeCount;
    await saveState(mergedBooks);
    document.querySelector("#status").textContent = `CSVから${importedRecords.length}件を取り込みました（新規${added}件 / 更新${importedRecords.length - added}件）。`;
  } catch (error) {
    document.querySelector("#status").textContent = `CSV取込に失敗しました: ${error.message || error}`;
  }
}

for (const selector of ["#query", "#source", "#sort", "#favorite-only"]) document.querySelector(selector).addEventListener(selector === "#query" ? "input" : "change", render);
document.querySelector("#options").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#guide").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("guide.html") });
document.querySelector("#menu-toggle").onclick = () => {
  const menu = document.querySelector("#action-menu");
  const isOpen = !menu.hidden;
  menu.hidden = isOpen;
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", String(!isOpen));
};
document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-shell")) closeActionMenu();
  if (!event.target.closest("#row-action-popover") && !event.target.closest("[data-row-menu-key]")) closeRowActionMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeActionMenu();
    closeRowActionMenu();
  }
});
for (const selector of ["#csv", "#csv-import", "#guide", "#options", "#clear", "#show-exclusions"]) document.querySelector(selector).addEventListener("click", closeActionMenu);
document.querySelector("#show-exclusions").onclick = () => document.querySelector("#excluded-dialog").showModal();
document.querySelector("#close-exclusions").onclick = () => document.querySelector("#excluded-dialog").close();
document.querySelector("#fetch-dmm-volumes").onclick = fetchDmmVolumes;
document.querySelector("#cancel-dmm-fetch").onclick = () => { cancelDmmFetch = true; };
document.querySelector("#close-dmm-fetch").onclick = () => document.querySelector("#dmm-fetch-dialog").close();
document.querySelector("#back-to-top").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
addEventListener("scroll", () => {
  document.querySelector("#back-to-top").classList.toggle("visible", scrollY > 420);
  closeRowActionMenu();
}, { passive: true });
document.querySelector("#csv").onclick = () => {
  const blob = new Blob([EbookCore.toCsv(records)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ebook-list-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
document.querySelector("#csv-import").onclick = () => document.querySelector("#csv-file").click();
document.querySelector("#csv-file").onchange = async (event) => {
  await importCsvFile(event.target.files?.[0]);
  event.target.value = "";
};
document.querySelector("#rows").onclick = async (event) => {
  const favoriteButton = event.target.closest("[data-favorite-key]");
  if (favoriteButton) {
    const record = books[favoriteButton.dataset.favoriteKey];
    if (!record) return;
    await saveState({ ...books, [record.key]: { ...record, favorite: !record.favorite } });
    return;
  }
  const menuButton = event.target.closest("[data-row-menu-key]");
  if (menuButton) {
    openRowActionMenu(menuButton);
    return;
  }
};
document.querySelector("#row-action-popover").onclick = async (event) => {
  const action = event.target.closest("[data-popover-action]")?.dataset.popoverAction;
  if (!action || !rowActionKey) return;
  const record = books[rowActionKey];
  closeRowActionMenu();
  if (!record) return;
  if (action === "edit-status") {
    openStatusEditor(record);
    return;
  }
  if (!record || !confirm(`「${record.title}」を削除しますか？`)) return;
  const shouldExclude = confirm("このシリーズを今後の収集からも除外しますか？");
  const nextBooks = { ...books };
  delete nextBooks[record.key];
  await saveState(nextBooks, shouldExclude ? addExclusions(excludedBooks, [record]) : excludedBooks);
};
document.querySelector("#manual-statuses").addEventListener("input", () => {
  syncStatusChoices();
});
document.querySelector("#status-picker").onchange = (event) => {
  const input = event.target.closest("input");
  if (!input) return;
  const statuses = parseManualStatuses(document.querySelector("#manual-statuses").value);
  const next = input.checked ? [...new Set([...statuses, input.value])] : statuses.filter((status) => status !== input.value);
  setManualStatuses(next);
};
document.querySelector("#status-form").addEventListener("submit", async (event) => {
  if (event.submitter?.id !== "save-statuses") return;
  event.preventDefault();
  const record = books[editingStatusKey];
  if (!record) return;
  await saveState({ ...books, [record.key]: { ...record, manualStatuses: parseManualStatuses(document.querySelector("#manual-statuses").value) } });
  document.querySelector("#status-dialog").close();
});
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
