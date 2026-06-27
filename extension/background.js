"use strict";
importScripts("default-rules.js");
importScripts("core.js");

function mergeByDescription(existingItems = [], defaultItems = []) {
  const result = Array.isArray(existingItems) ? [...existingItems] : [];
  for (const item of defaultItems || []) {
    const key = item.description || item.key || item.match || JSON.stringify(item);
    if (!result.some((existing) => (existing.description || existing.key || existing.match || JSON.stringify(existing)) === key)) result.push(item);
  }
  return result;
}

function mergeDefaultRuleUpdates(existing, defaultRule) {
  if (!existing.importGuide && defaultRule.importGuide) existing.importGuide = defaultRule.importGuide;
  if (defaultRule.bibliographicField && !existing.bibliographicField) existing.bibliographicField = defaultRule.bibliographicField;
  if (defaultRule.coverRequiresBibliographicField && !existing.coverRequiresBibliographicField) existing.coverRequiresBibliographicField = true;
  existing.titleCleanup = mergeByDescription(existing.titleCleanup, defaultRule.titleCleanup);
  existing.statusRules = mergeByDescription(existing.statusRules, defaultRule.statusRules);
  if (defaultRule.seriesGrouping) {
    existing.seriesGrouping = existing.seriesGrouping || {};
    if (!existing.seriesGrouping.description) existing.seriesGrouping.description = defaultRule.seriesGrouping.description;
    if (!("keyField" in existing.seriesGrouping)) existing.seriesGrouping.keyField = defaultRule.seriesGrouping.keyField;
    existing.seriesGrouping.volumePatterns = mergeByDescription(existing.seriesGrouping.volumePatterns, defaultRule.seriesGrouping.volumePatterns);
  }
}

function reindexBooks(books = {}, rules = []) {
  const result = {};
  for (const old of Object.values(books || {})) {
    const rule = rules.find((item) => item.id === old.sourceId || item.collectionId === old.sourceId);
    if (!rule) {
      result[old.key] = EbookCore.mergeRecords(result[old.key], old);
      continue;
    }
    const normalized = EbookCore.normalizeRecord({
      ...old,
      externalId: old.externalId || old.externalIds?.[0],
      externalIds: old.externalIds || [],
      statuses: old.status && old.status !== "購入" ? [old.status] : (old.statuses || []),
      ownedVolumes: old.ownedVolumes || []
    }, rule, old.pageUrl || "", old.lastSeenAt || old.firstSeenAt || new Date().toISOString());
    result[normalized.key] = EbookCore.mergeRecords(result[normalized.key], normalized);
  }
  return result;
}

async function updateBadge(books) {
  const records = Object.values(books || {});
  await chrome.action.setBadgeText({ text: String(EbookCore.knownItemCount(records)) });
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

function dmmVolumesUrl(seriesId) {
  return `https://book.dmm.com/product/${encodeURIComponent(seriesId)}/volumes/?tab=purchased`;
}

function dmmBffContentsUrl(seriesId, page = 1, perPage = 100) {
  const params = new URLSearchParams({
    shop_name: "general",
    series_id: seriesId,
    page: String(page),
    per_page: String(perPage),
    last_read_position: "0",
    order: "asc",
    purchase_status: "purchased",
    format_webp: "1"
  });
  return `https://book.dmm.com/ajax/bff/contents/?${params}`;
}

function dmmProductRule(rules = globalThis.EBOOK_DEFAULT_RULES) {
  return rules.find((rule) => rule.id === "dmm-books-product");
}

async function fetchDmmVolumesJson(seriesId, rule, pageUrl) {
  const perPage = 100;
  const records = [];
  let totalCount = null;
  for (let page = 1; page <= 20; page += 1) {
    const apiUrl = dmmBffContentsUrl(seriesId, page, perPage);
    const response = await fetch(apiUrl, {
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const data = await response.json();
    records.push(...EbookCore.parseDmmPurchasedVolumesJson(data, rule, pageUrl, seriesId));
    totalCount = Number(data?.pager?.total_count ?? totalCount);
    const loaded = page * Number(data?.pager?.per_page || perPage);
    if (!totalCount || loaded >= totalCount) break;
  }
  return records;
}

async function upsertFetchedDmmVolumes(seriesId, records, rule, pageUrl) {
  if (!records.length) return 0;
  const { books = {}, excludedBooks = {} } = await chrome.storage.local.get(["books", "excludedBooks"]);
  const normalized = EbookCore.aggregateRecords(records.map((item) => EbookCore.normalizeRecord(item, rule, pageUrl)))
    .filter((record) => !EbookCore.isExcludedRecord(record, excludedBooks));
  for (const record of normalized) books[record.key] = EbookCore.mergeRecords(books[record.key], record, { replaceStatuses: true });
  await chrome.storage.local.set({
    books,
    lastImport: { count: normalized.length, ruleId: rule.id, at: new Date().toISOString(), pageUrl, manualFetch: true, seriesId }
  });
  await updateBadge(books);
  return normalized.length;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["rules", "rulesVersion", "books"]);
  if (!current.rules || !current.rulesVersion || current.rulesVersion < 2) {
    const migrated = {};
    for (const old of Object.values(current.books || {})) {
      const rule = globalThis.EBOOK_DEFAULT_RULES.find((item) => item.id === old.sourceId);
      if (!rule) continue;
      const normalized = EbookCore.normalizeRecord({
        ...old,
        externalId: old.externalId || old.externalIds?.[0],
        statuses: old.status && old.status !== "購入" ? [old.status] : (old.statuses || [])
      }, rule, old.pageUrl || "", old.lastSeenAt);
      migrated[normalized.key] = EbookCore.mergeRecords(migrated[normalized.key], normalized);
    }
    await chrome.storage.local.set({
      rules: globalThis.EBOOK_DEFAULT_RULES,
      rulesVersion: globalThis.EBOOK_RULES_VERSION,
      books: migrated,
      previousRules: current.rules || null
    });
    await updateBadge(migrated);
    return;
  }
  if (current.rulesVersion < globalThis.EBOOK_RULES_VERSION) {
    const rules = [...current.rules];
    for (const defaultRule of globalThis.EBOOK_DEFAULT_RULES) {
      const existing = rules.find((rule) => rule.id === defaultRule.id);
      if (!existing) rules.push(defaultRule);
      else if (current.rulesVersion < 7 && defaultRule.id === "ebookjapan") Object.assign(existing, defaultRule);
      else {
        mergeDefaultRuleUpdates(existing, defaultRule);
        if (current.rulesVersion < 13 && /^dmm-books/.test(defaultRule.id) && defaultRule.importGuide) existing.importGuide = defaultRule.importGuide;
      }
    }
    const update = { rules, rulesVersion: globalThis.EBOOK_RULES_VERSION };
    if (current.rulesVersion < 9) update.books = reindexBooks(current.books || {}, rules);
    await chrome.storage.local.set(update);
    await updateBadge(update.books || current.books || {});
    return;
  }
  await updateBadge(current.books || {});
});

chrome.runtime.onStartup.addListener(async () => {
  const { books = {} } = await chrome.storage.local.get("books");
  await updateBadge(books);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.books) return;
  updateBadge(changes.books.newValue || {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPSERT_BOOKS") {
    (async () => {
      const { books = {}, excludedBooks = {} } = await chrome.storage.local.get(["books", "excludedBooks"]);
      const incomingRecords = (message.records || []).filter((record) => !EbookCore.isExcludedRecord(record, excludedBooks));
      for (const record of incomingRecords) books[record.key] = EbookCore.mergeRecords(books[record.key], record, { replaceStatuses: true });
      await chrome.storage.local.set({ books, lastImport: { count: incomingRecords.length, ruleId: message.ruleId, at: new Date().toISOString(), pageUrl: sender.tab?.url || "" } });
      const records = Object.values(books);
      await updateBadge(books);
      sendResponse({ ok: true, total: EbookCore.totalItemCount(records), seriesTotal: records.length });
    })();
    return true;
  }
  if (message.type === "FETCH_DMM_VOLUMES") {
    (async () => {
      const seriesId = String(message.seriesId || "");
      if (!seriesId) {
        sendResponse({ ok: false, error: "seriesId is required" });
        return;
      }
      const { rules: savedRules } = await chrome.storage.local.get("rules");
      const rule = dmmProductRule(savedRules || globalThis.EBOOK_DEFAULT_RULES);
      if (!rule?.enabled) {
        sendResponse({ ok: false, error: "DMM購入済み全巻一覧ルールが無効です" });
        return;
      }
      const pageUrl = dmmVolumesUrl(seriesId);
      try {
        const records = await fetchDmmVolumesJson(seriesId, rule, pageUrl);
        const count = await upsertFetchedDmmVolumes(seriesId, records, rule, pageUrl);
        sendResponse({ ok: count > 0, count, parsed: records.length, pageUrl, source: "api", error: records.length ? "" : "購入済み巻を解析できませんでした" });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "DMM API fetch failed", pageUrl, source: "api" });
      }
    })();
    return true;
  }
});
