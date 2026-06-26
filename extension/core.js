(function (root) {
  "use strict";

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const unique = (values) => [...new Set((values || []).filter((value) => value !== "" && value != null))];

  function wildcardToRegExp(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`);
  }

  function matchesUrl(url, patterns) {
    return (patterns || []).some((pattern) => {
      try { return wildcardToRegExp(pattern).test(url); } catch { return false; }
    });
  }

  function fieldSpecs(rule) {
    if (Array.isArray(rule.fields)) return rule.fields;
    return Object.entries(rule.fields || {}).map(([key, spec]) => ({
      key, selector: spec.selector, value: spec.source, attribute: spec.attribute,
      match: spec.regex, flags: spec.flags, replace: spec.replacement,
      join: spec.join, default: spec.default, resolveUrl: spec.resolveUrl
    }));
  }

  function readField(item, spec, baseUrl) {
    let nodes = [item];
    if (spec.selector) {
      try { nodes = Array.from(item.querySelectorAll(spec.selector)); } catch { return spec.type === "array" ? [] : (spec.default || ""); }
    }
    if (!nodes.length) return spec.type === "array" ? [] : (spec.default || "");
    if (spec.join === undefined && spec.type !== "array") nodes = nodes.slice(0, 1);
    let values = nodes.map((node) => {
      if (spec.value === "attribute") return node.getAttribute(spec.attribute || "") || "";
      if (spec.value === "html") return node.innerHTML || "";
      return node.textContent || "";
    }).map(clean).filter(Boolean);
    if (spec.type === "array") return unique(values);
    let value = values.join(spec.join ?? "") || spec.default || "";
    if (spec.match) {
      try { value = value.replace(new RegExp(spec.match, spec.flags || ""), spec.replace ?? "$1"); } catch { /* invalid user regex */ }
    }
    if (spec.resolveUrl && value) {
      try { value = new URL(value, baseUrl).href; } catch { /* keep original */ }
    }
    return clean(value);
  }

  function cleanupTitle(title, rules) {
    let result = clean(title);
    for (const transform of rules || []) {
      try { result = clean(result.replace(new RegExp(transform.match, transform.flags || "g"), transform.replace ?? "")); } catch { /* invalid user regex */ }
    }
    return result;
  }

  function parseDom(document, rule, baseUrl) {
    let items;
    try { items = Array.from(document.querySelectorAll(rule.bookSelector || rule.itemSelector)); } catch { return []; }
    return items.map((item) => {
      const record = {};
      for (const spec of fieldSpecs(rule)) record[spec.key] = readField(item, spec, baseUrl);
      record.originalTitle = record.title;
      record.title = cleanupTitle(record.title, rule.titleCleanup || rule.transforms?.filter((t) => t.field === "title").map((t) => ({ match: t.regex, flags: t.flags, replace: t.replacement })));
      return record;
    }).filter((record) => record.title && (record.externalId || record.detailUrl));
  }

  function parseKindleJson(document, rule) {
    const script = document.querySelector("script#itemViewResponse");
    if (!script?.textContent) return [];
    try {
      const data = JSON.parse(script.textContent);
      return (data.itemsList || []).map((item) => ({
        externalId: clean(item.asin),
        title: cleanupTitle(item.title, rule.titleCleanup),
        authors: (item.authors || []).flatMap((a) => a.split(":" )).map(clean).filter(Boolean).join("; "),
        detailUrl: item.webReaderUrl || `https://www.amazon.co.jp/dp/${item.asin}`,
        coverUrl: item.productUrl || "",
        statuses: [],
        percentageRead: Number(item.percentageRead || 0),
        resourceType: clean(item.resourceType)
      }));
    } catch { return []; }
  }

  function parseDocument(document, rule, baseUrl) {
    const domItems = parseDom(document, rule, baseUrl);
    if (rule.parser !== "kindle") return domItems;
    const byId = new Map(parseKindleJson(document, rule).map((item) => [item.externalId, item]));
    for (const item of domItems) byId.set(item.externalId, { ...byId.get(item.externalId), ...item });
    return Array.from(byId.values());
  }

  function toAsciiNumber(value) {
    const romanNumber = romanToNumber(value);
    if (romanNumber) return romanNumber;
    const normalized = String(value).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const number = Number.parseInt(normalized, 10);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function rangeFromCount(value) {
    const count = toAsciiNumber(value);
    if (!count || count > 2000) return [];
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  function romanToNumber(value) {
    const romanMap = { "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X" };
    const roman = String(value ?? "").trim().replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, (c) => romanMap[c] || c).toUpperCase();
    if (!/^[IVXLCDM]+$/.test(roman)) return null;
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let index = 0; index < roman.length; index += 1) {
      const current = values[roman[index]];
      const next = values[roman[index + 1]] || 0;
      total += current < next ? -current : current;
    }
    return total > 0 ? total : null;
  }

  function deriveSeries(record, rule) {
    let seriesTitle = clean(record.title);
    let volume = null;
    for (const volumeRule of rule.seriesGrouping?.volumePatterns || []) {
      try {
        const regex = new RegExp(volumeRule.match, volumeRule.flags || "i");
        const match = regex.exec(seriesTitle);
        if (!match) continue;
        volume = toAsciiNumber(match[volumeRule.volumeGroup || 1]);
        if (volumeRule.removeFromSeriesTitle) seriesTitle = clean(seriesTitle.replace(regex, volumeRule.replaceInSeriesTitle ?? ""));
        break;
      } catch { /* invalid user regex */ }
    }
    return { seriesTitle, volume };
  }

  function normalizeRecord(record, rule, pageUrl, now = new Date().toISOString()) {
    const cleanedRecord = { ...record, originalTitle: record.originalTitle || record.title, title: cleanupTitle(record.title, rule.titleCleanup || []) };
    const { seriesTitle, volume } = deriveSeries(cleanedRecord, rule);
    const collectionId = rule.collectionId || rule.id;
    const explicitKey = rule.seriesGrouping?.keyField && record[rule.seriesGrouping.keyField];
    const seriesKey = explicitKey || seriesTitle.toLocaleLowerCase("ja");
    const kindleDetailUrl = rule.id === "kindle" && cleanedRecord.externalId ? `https://www.amazon.co.jp/dp/${cleanedRecord.externalId}` : pageUrl;
    const statuses = Array.isArray(cleanedRecord.statuses) ? [...cleanedRecord.statuses] : cleanedRecord.status ? [cleanedRecord.status] : [];
    for (const statusRule of rule.statusRules || []) {
      try { if (new RegExp(statusRule.match, statusRule.flags || "i").test(String(cleanedRecord[statusRule.field] || ""))) statuses.push(statusRule.status); } catch { /* invalid user regex */ }
    }
    const bibliographicComplete = rule.bibliographicField ? Boolean(cleanedRecord[rule.bibliographicField]) : (cleanedRecord.bibliographicComplete ?? true);
    const coverUrl = rule.coverRequiresBibliographicField && !bibliographicComplete ? "" : (cleanedRecord.coverUrl || "");
    return {
      key: `${collectionId}:series:${seriesKey}`,
      source: rule.collectionName || rule.name,
      sourceId: collectionId,
      externalIds: unique([...(cleanedRecord.externalIds || []), cleanedRecord.externalId]),
      seriesId: cleanedRecord.seriesId || "",
      title: seriesTitle,
      authors: cleanedRecord.authors || "",
      category: cleanedRecord.category || "",
      statuses: unique(statuses.filter((status) => status !== "購入")),
      statusesObserved: fieldSpecs(rule).some((field) => field.key === "statuses"),
      ownedVolumes: unique([...(cleanedRecord.ownedVolumes || []), volume, ...rangeFromCount(cleanedRecord.ownedCount)]).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
      detailUrl: cleanedRecord.detailUrl || kindleDetailUrl,
      coverUrl,
      percentageRead: cleanedRecord.percentageRead ?? "",
      resourceType: cleanedRecord.resourceType || "",
      pageUrl,
      firstSeenAt: cleanedRecord.firstSeenAt || now,
      lastSeenAt: now,
      bibliographicComplete
    };
  }

  function coverScore(url) {
    const value = String(url || "");
    if (!value) return 0;
    if (/\/thumb\//.test(value)) return 3;
    if (/\/contents\/images-b\//.test(value)) return 1;
    return 2;
  }

  function chooseCoverUrl(previous, incoming, preferIncomingBibliography) {
    if (preferIncomingBibliography && incoming.coverUrl) return incoming.coverUrl;
    if (coverScore(incoming.coverUrl) > coverScore(previous.coverUrl)) return incoming.coverUrl;
    return previous.coverUrl || incoming.coverUrl || "";
  }

  function mergeRecords(previous, incoming, options = {}) {
    if (!previous) return incoming;
    const preferIncomingBibliography = incoming.bibliographicComplete && !previous.bibliographicComplete;
    return {
      ...previous,
      ...incoming,
      externalIds: unique([...(previous.externalIds || []), ...(incoming.externalIds || [])]),
      statuses: options.replaceStatuses && incoming.statusesObserved
        ? unique(incoming.statuses || [])
        : unique([...(previous.statuses || []), ...(incoming.statuses || [])]),
      manualStatuses: unique([...(previous.manualStatuses || []), ...(incoming.manualStatuses || [])]),
      favorite: Boolean(previous.favorite || incoming.favorite),
      ownedVolumes: unique([...(previous.ownedVolumes || []), ...(incoming.ownedVolumes || [])]).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
      title: preferIncomingBibliography ? incoming.title : (previous.title || incoming.title),
      authors: incoming.authors || previous.authors,
      category: incoming.category || previous.category,
      seriesId: incoming.seriesId || previous.seriesId,
      detailUrl: preferIncomingBibliography ? (incoming.detailUrl || previous.detailUrl) : (previous.detailUrl || incoming.detailUrl),
      coverUrl: chooseCoverUrl(previous, incoming, preferIncomingBibliography),
      bibliographicComplete: previous.bibliographicComplete || incoming.bibliographicComplete,
      firstSeenAt: previous.firstSeenAt || incoming.firstSeenAt
    };
  }

  function aggregateRecords(records) {
    const result = new Map();
    for (const record of records) result.set(record.key, mergeRecords(result.get(record.key), record));
    return Array.from(result.values());
  }

  function formatVolumes(volumes) {
    const sorted = unique((volumes || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)).sort((a, b) => a - b);
    if (!sorted.length) return "";
    const ranges = [];
    let start = sorted[0], end = sorted[0];
    for (const number of sorted.slice(1)) {
      if (number === end + 1) { end = number; continue; }
      ranges.push(start === end ? String(start) : `${start}-${end}`); start = end = number;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    return ranges.join(", ");
  }

  function recordItemCount(record) {
    const volumeCount = unique((record.ownedVolumes || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)).length;
    const idCount = unique(record.externalIds || []).length;
    return Math.max(volumeCount, idCount, 1);
  }

  function totalItemCount(records) {
    return (records || []).reduce((sum, record) => sum + recordItemCount(record), 0);
  }

  function recordStatuses(record) {
    return unique([...(record.statuses || []), ...(record.manualStatuses || [])]);
  }

  function createExclusion(record, now = new Date().toISOString()) {
    return {
      key: record.key || "",
      source: record.source || "",
      sourceId: record.sourceId || "",
      seriesId: record.seriesId || "",
      externalIds: unique(record.externalIds || []),
      title: record.title || "",
      authors: record.authors || "",
      coverUrl: record.coverUrl || "",
      excludedAt: now
    };
  }

  function isExcludedRecord(record, exclusions = {}) {
    const recordIds = new Set(record.externalIds || []);
    return Object.values(exclusions || {}).some((exclusion) => {
      if (exclusion.key && exclusion.key === record.key) return true;
      if (exclusion.sourceId && exclusion.seriesId && exclusion.sourceId === record.sourceId && exclusion.seriesId === record.seriesId) return true;
      if (exclusion.sourceId && exclusion.sourceId === record.sourceId && (exclusion.externalIds || []).some((id) => recordIds.has(id))) return true;
      return false;
    });
  }

  const csvColumns = [
    { key: "source", label: "サービス" }, { key: "seriesId", label: "シリーズID" },
    { key: "externalIds", label: "書籍ID一覧" }, { key: "title", label: "タイトル" },
    { key: "authors", label: "著者" }, { key: "category", label: "カテゴリ" },
    { key: "statuses", label: "ステータス" }, { key: "ownedVolumes", label: "所持巻数" },
    { key: "detailUrl", label: "詳細URL" }, { key: "coverUrl", label: "表紙URL" },
    { key: "favorite", label: "お気に入り" }, { key: "pageUrl", label: "収集元URL" }, { key: "firstSeenAt", label: "本棚追加日時" },
    { key: "lastSeenAt", label: "最終確認日時" }
  ];
  const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  function csvValue(record, key) {
    if (key === "ownedVolumes") return formatVolumes(record.ownedVolumes);
    if (key === "statuses") return recordStatuses(record).join("; ");
    if (key === "favorite") return record.favorite ? "TRUE" : "";
    if (Array.isArray(record[key])) return record[key].join("; ");
    return record[key] ?? "";
  }
  function toCsv(records) {
    return "\uFEFF" + [csvColumns.map((c) => c.label), ...records.map((r) => csvColumns.map((c) => csvValue(r, c.key)))]
      .map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  const api = { clean, matchesUrl, parseDom, parseKindleJson, parseDocument, deriveSeries, normalizeRecord, mergeRecords, aggregateRecords, formatVolumes, recordItemCount, totalItemCount, recordStatuses, createExclusion, isExcludedRecord, toCsv, csvColumns, toAsciiNumber };
  root.EbookCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
