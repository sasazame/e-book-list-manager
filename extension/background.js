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
  await chrome.action.setBadgeText({ text: String(EbookCore.totalItemCount(records)) });
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
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
      else mergeDefaultRuleUpdates(existing, defaultRule);
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
});
