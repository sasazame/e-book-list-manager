const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");

require("../extension/default-rules.js");
const core = require("../extension/core.js");
const rules = globalThis.EBOOK_DEFAULT_RULES;

function documentOf(name) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return parseHTML(html).document;
}
function documentFrom(html) {
  return parseHTML(html).document;
}

test("Kindle sampleからJSONとDOMの書籍を抽出する", () => {
  const rule = rules.find((r) => r.id === "kindle");
  const books = core.parseDocument(documentOf("kindle.html"), rule, "https://read.amazon.co.jp/kindle-library");
  assert.ok(books.length >= 9, `抽出件数: ${books.length}`);
  const book = books.find((b) => b.externalId === "KINDLE001");
  assert.equal(book.title.includes("Japanese Edition"), false);
  assert.match(book.authors, /サンプル著者Z/);
  assert.match(book.coverUrl, /^https:\/\//);

  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, "https://read.amazon.co.jp/kindle-library")));
  const accounting = series.find((item) => item.title.startsWith("巻数サンプル作品"));
  assert.deepEqual(accounting.ownedVolumes, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(accounting.externalIds.length, 8);
  assert.equal(accounting.statuses.length, 0);
});

test("Kindleの分冊・話数・電子限定特典表記をシリーズ集約する", () => {
  const rule = rules.find((r) => r.id === "kindle");
  const url = "https://read.amazon.co.jp/kindle-library";
  const html = `
    <div id="library-item-option-B001"><div id="title-B001">story巻数サンプル story03</div><div id="author-B001">著者A</div><img id="cover-B001" src="https://example.test/1.jpg"></div>
    <div id="library-item-option-B002"><div id="title-B002">story巻数サンプル story04</div><div id="author-B002">著者A</div><img id="cover-B002" src="https://example.test/2.jpg"></div>
    <div id="library-item-option-B003"><div id="title-B003">特典除去サンプル （4）電子限定描きおろし特典つき</div><div id="author-B003">著者B</div><img id="cover-B003" src="https://example.test/3.jpg"></div>
    <div id="library-item-option-B004"><div id="title-B004">特典除去サンプル （5）電子版限定特典付き</div><div id="author-B004">著者B</div><img id="cover-B004" src="https://example.test/4.jpg"></div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  const story = series.find((item) => item.title === "story巻数サンプル");
  assert.deepEqual(story.ownedVolumes, [3, 4]);
  assert.deepEqual(story.statuses, ["分冊版"]);
  const work = series.find((item) => item.title === "特典除去サンプル");
  assert.deepEqual(work.ownedVolumes, [4, 5]);
  assert.deepEqual(work.statuses, []);
});

test("Kindleは巻数の後ろにレーベル括弧が続くタイトルをシリーズ集約する", () => {
  const rule = rules.find((r) => r.id === "kindle");
  const url = "https://read.amazon.co.jp/kindle-library";
  const html = `
    <div id="library-item-option-B001"><div id="title-B001">中盤巻数サンプル(1) (角川コミックス・エース)</div><div id="author-B001">サンプル著者M</div><img id="cover-B001" src="https://example.test/1.jpg"></div>
    <div id="library-item-option-B002"><div id="title-B002">中盤巻数サンプル(2) (角川コミックス・エース)</div><div id="author-B002">サンプル著者M</div><img id="cover-B002" src="https://example.test/2.jpg"></div>
    <div id="library-item-option-B003"><div id="title-B003">中盤巻数サンプル(IV) (角川コミックス・エース)</div><div id="author-B003">サンプル著者M</div><img id="cover-B003" src="https://example.test/3.jpg"></div>
    <div id="library-item-option-B004"><div id="title-B004">レーベル巻数サンプル (角川コミックス・エース)</div><div id="author-B004">サンプル著者N</div><img id="cover-B004" src="https://example.test/4.jpg"></div>
    <div id="library-item-option-B005"><div id="title-B005">レーベル巻数サンプル(1) (角川コミックス・エース)</div><div id="author-B005">サンプル著者O; サンプル著者N</div><img id="cover-B005" src="https://example.test/5.jpg"></div>
    <div id="library-item-option-B006"><div id="title-B006">レーベル巻数サンプル(2) (角川コミックス・エース)</div><div id="author-B006">サンプル著者O; サンプル著者N</div><img id="cover-B006" src="https://example.test/6.jpg"></div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  const maoyu = series.find((item) => item.title === "中盤巻数サンプル (角川コミックス・エース)");
  assert.deepEqual(maoyu.ownedVolumes, [1, 2, 4]);
  assert.equal(maoyu.externalIds.length, 3);
  const another = series.find((item) => item.title === "レーベル巻数サンプル (角川コミックス・エース)");
  assert.deepEqual(another.ownedVolumes, [1, 2]);
  assert.equal(another.externalIds.length, 3);
  assert.equal(core.recordItemCount(another), 3);
});

test("DMM sampleから本棚カードを抽出する", () => {
  const rule = rules.find((r) => r.id === "dmm-books");
  const books = core.parseDocument(documentOf("dmm-books.html"), rule, "https://book.dmm.com/shelf/?tab=library&page=1");
  assert.ok(books.length >= 2, `抽出件数: ${books.length}`);
  const book = books.find((b) => b.externalId === "dmmcontent001");
  assert.equal(book.title, "サンプル異世界シリーズ【単行本版】");
  assert.deepEqual(book.statuses, ["未購入続刊あり"]);
  assert.equal(book.seriesId, "dmmseries001");
  assert.equal(book.detailUrl, "https://book.dmm.com/product/dmmseries001/volumes/?tab=purchased");
  assert.equal(books.some((item) => item.statuses.includes("完結")), true);
});

test("DMM本棚は分冊表記をステータスへ追加する", () => {
  const rule = rules.find((r) => r.id === "dmm-books");
  const url = "https://book.dmm.com/shelf/?tab=library&page=1";
  const html = `
    <div data-testid="purchasable-library-book">
      <a href="/product/series001/content001/"><img data-testid="book-image" alt="分冊サンプル（分冊版） 【第4話】" src="https://example.test/1.jpg"></a>
      <div data-testid="library-book-authors"><span>著者A</span></div><div>コミック</div>
    </div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  assert.deepEqual(series[0].statuses, ["分冊版"]);
  assert.deepEqual(series[0].ownedVolumes, []);
});

test("DMM本棚だけで個別巻数未取得のシリーズは所持巻数を不明にする", () => {
  const rule = rules.find((r) => r.id === "dmm-books");
  const url = "https://book.dmm.com/shelf/?tab=library&page=1";
  const series = core.aggregateRecords(core.parseDocument(documentOf("dmm-books.html"), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  const book = series.find((item) => item.seriesId === "dmmseries001");
  assert.equal(core.hasUnknownOwnedVolumes(book), true);
  assert.equal(core.recordItemCount(book), 1);
  assert.equal(core.knownItemCount([book]), 0);
  assert.equal(core.unknownOwnedVolumeSeriesCount([book]), 1);
  assert.equal(core.itemCountSummary([book]), "0冊 + 不明1シリーズ");
  assert.match(core.toCsv([book]), /"不明"/);
});

test("DMM購入済み全巻一覧から購入済み巻だけを既存シリーズへ追加する", () => {
  const rule = rules.find((r) => r.id === "dmm-books-product");
  const url = "https://book.dmm.com/product/dmmseries999/volumes/?tab=purchased";
  const books = core.parseDocument(documentOf("dmm-books-product.html"), rule, url);
  assert.equal(books.length, 6);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)))[0];
  assert.equal(series.key, "dmm-books:series:dmmseries999");
  assert.equal(series.title, "サンプル冒険譚");
  assert.deepEqual(series.ownedVolumes, [1, 2, 3, 4, 5]);
  assert.equal(series.externalIds.includes("dmmvol005"), true);
  assert.equal(series.externalIds.includes("dmmvol006"), true);
  assert.equal(series.detailUrl, "https://book.dmm.com/product/dmmseries999/volumes/?tab=purchased");
  assert.equal(core.recordItemCount(series), 6);

  const existing = { ...series, title: "既存の本棚タイトル", authors: "既存著者", statuses: ["未購入続刊あり"], ownedVolumes: [] };
  const merged = core.mergeRecords(existing, series, { replaceStatuses: true });
  assert.deepEqual(merged.ownedVolumes, [1, 2, 3, 4, 5]);
  assert.deepEqual(merged.statuses, ["未購入続刊あり"]);
  assert.equal(merged.authors, "既存著者");
});

test("DMM購入済み全巻一覧はfetch用HTML文字列からも抽出できる", () => {
  const rule = rules.find((r) => r.id === "dmm-books-product");
  const url = "https://book.dmm.com/product/dmmseries999/volumes/?tab=purchased";
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "dmm-books-product.html"), "utf8");
  const books = core.parseDmmPurchasedVolumesHtml(html, rule, url);
  assert.equal(books.length, 6);
  assert.equal(books[5].externalId, "dmmvol006");
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)))[0];
  assert.equal(series.key, "dmm-books:series:dmmseries999");
  assert.deepEqual(series.ownedVolumes, [1, 2, 3, 4, 5]);
  assert.equal(core.recordItemCount(series), 6);
});

test("DMM fetch用HTML文字列はdownloadリンクがなくても購入済み巻を抽出する", () => {
  const rule = rules.find((r) => r.id === "dmm-books-product");
  const url = "https://book.dmm.com/product/dmmseries999/volumes/?tab=purchased";
  const html = `
    <div data-testid="purchased-volume-book">
      <a href="/product/dmmseries999/dmmvol001/"><img data-testid="book-image" alt="サンプル冒険譚 （1）" src="https://ebook-assets.dmm.com/digital/e-book/dmmvol001/dmmvol001ps.webp"></a>
    </div>
    <div data-testid="purchased-volume-book">
      <a href="/product/dmmseries999/latest/"><img data-testid="book-image" alt="サンプル冒険譚 （2）" src="https://ebook-assets.dmm.com/digital/e-book/dmmvol002/dmmvol002ps.webp"></a>
    </div>
  `;
  const books = core.parseDmmPurchasedVolumesHtml(html, rule, url);
  assert.equal(books.length, 2);
  assert.equal(books[0].externalId, "dmmvol001");
  assert.equal(books[1].externalId, "dmmvol002");
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)))[0];
  assert.deepEqual(series.ownedVolumes, [1, 2]);
});

test("DMM BFF APIレスポンスからcontent_idとvolume_numberを抽出する", () => {
  const rule = rules.find((r) => r.id === "dmm-books-product");
  const url = "https://book.dmm.com/product/102691/volumes/?tab=purchased";
  const data = {
    volume_books: [
      {
        content_id: "b371bhkss00210",
        title: "夏目友人帳 1",
        volume_number: 1,
        image_urls: { pt: "https://example.test/1.webp" },
        product_url: "https://book.dmm.com/product/102691/b371bhkss00210/",
        product_path: "/product/102691/b371bhkss00210/",
        purchased: { download_url: "https://book.dmm.com/download/?product_id=b371bhkss00210" }
      },
      {
        content_id: "b371khkss08364",
        title: "夏目友人帳33",
        volume_number: 33,
        image_urls: { ps: "https://example.test/33.webp" },
        product_url: "https://book.dmm.com/product/102691/latest/",
        product_path: "/product/102691/latest/",
        purchased: { download_url: "https://book.dmm.com/download/?product_id=b371khkss08364" }
      },
      {
        content_id: "unpurchased001",
        title: "夏目友人帳 34",
        volume_number: 34,
        product_path: "/product/102691/unpurchased001/",
        purchased: null
      }
    ],
    pager: { page: 1, per_page: 100, total_count: 3 }
  };
  const books = core.parseDmmPurchasedVolumesJson(data, rule, url, "102691");
  assert.equal(books.length, 2);
  assert.equal(books[1].externalId, "b371khkss08364");
  assert.equal(books[1].title, "夏目友人帳");
  assert.deepEqual(books[1].ownedVolumes, [33]);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)))[0];
  assert.equal(series.key, "dmm-books:series:102691");
  assert.equal(series.title, "夏目友人帳");
  assert.deepEqual(series.ownedVolumes, [1, 33]);
  assert.deepEqual(series.externalIds, ["b371bhkss00210", "b371khkss08364"]);
});

test("DMM個別ページは分冊・話数・電子限定特典表記をシリーズへ追加する", () => {
  const rule = rules.find((r) => r.id === "dmm-books-product");
  const url = "https://book.dmm.com/product/series001/content001/";
  const html = `
    <div data-testid="purchased-volume-book"><a href="/product/series001/content001/"><img data-testid="book-image" alt="分冊サンプル（分冊版） 【第4話】" src="https://example.test/1.jpg"></a></div>
    <div data-testid="purchased-volume-book"><a href="/product/series001/content002/"><img data-testid="book-image" alt="分冊サンプル（分冊版） 【第5話】" src="https://example.test/2.jpg"></a></div>
    <div data-testid="purchased-volume-book"><a href="/product/series002/content003/"><img data-testid="book-image" alt="特典除去サンプル （4）電子限定描きおろし特典つき" src="https://example.test/3.jpg"></a></div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  const split = series.find((item) => item.seriesId === "series001");
  assert.equal(split.title, "分冊サンプル（分冊版）");
  assert.deepEqual(split.ownedVolumes, [4, 5]);
  assert.deepEqual(split.statuses, ["分冊版"]);
  const work = series.find((item) => item.seriesId === "series002");
  assert.equal(work.title, "特典除去サンプル");
  assert.deepEqual(work.ownedVolumes, [4]);
});

test("DMM購入完了ページから購入品と予約品をシリーズへ追加する", () => {
  const rule = rules.find((r) => r.id === "dmm-books-thanks");
  const url = "https://book.dmm.com/thanks/";
  const books = core.parseDocument(documentOf("dmm-books-thanks.html"), rule, url);
  assert.equal(books.length, 5);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url, "2026-06-22T12:00:00.000Z")));
  const purchased = series.find((item) => item.seriesId === "dmmseries001");
  assert.equal(purchased.title, "サンプル異世界シリーズ【単行本版】");
  assert.deepEqual(purchased.ownedVolumes, [5]);
  assert.deepEqual(purchased.statuses, []);
  assert.equal(purchased.firstSeenAt, "2026-06-22T12:00:00.000Z");
  const reserved = series.find((item) => item.seriesId === "dmmseriesReserved");
  assert.deepEqual(reserved.ownedVolumes, [4]);
  assert.deepEqual(reserved.statuses, ["予約済み"]);
});

test("DMM購入完了ページは分冊版と予約済みステータスを併存できる", () => {
  const rule = rules.find((r) => r.id === "dmm-books-thanks");
  const url = "https://book.dmm.com/thanks/";
  const html = `
    <main>
      <div data-variant="wide">
        <a href="/product/series001/content001/"><img data-testid="book-image" alt="分冊サンプル（分冊版） 【第4話】" src="https://example.test/1.jpg"></a>
        <div data-color="black" data-is-read="true">2026年7月1日 配信開始予定</div>
      </div>
      <div data-variant="wide">
        <a href="/product/series001/content002/"><img data-testid="book-image" alt="分冊サンプル（分冊版） 【第5話】" src="https://example.test/2.jpg"></a>
      </div>
    </main>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  assert.equal(series[0].title, "分冊サンプル（分冊版）");
  assert.deepEqual(series[0].ownedVolumes, [4, 5]);
  assert.deepEqual(series[0].statuses, ["予約済み", "分冊版"]);
});

test("ebookjapanのリストビューからタイトルと著者を抽出する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const books = core.parseDocument(documentOf("ebookjapan-list.html"), rule, url);
  assert.ok(books.length >= 1, `抽出件数: ${books.length}`);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)));
  const book = series.find((item) => item.title === "サンプル婚 目が覚めたらテスト上司の妻だった！？");
  assert.equal(book.authors, "サンプル著者E");
  assert.deepEqual(book.ownedVolumes, [2]);
  assert.match(book.coverUrl, /^https:\/\/cache2-ebookjapan\.akamaized\.net\//);
  assert.equal(book.externalIds.includes("EJLIST001"), true);
});

test("ebookjapan単話リストからタイトル・著者・所持話数を抽出する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan-stories");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/stories/";
  const books = core.parseDocument(documentOf("ebookjapan-single-list.html"), rule, url);
  assert.ok(books.length >= 5, `抽出件数: ${books.length}`);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)));
  const loop = series.find((item) => item.title.includes("長い単話サンプル"));
  assert.ok(loop);
  assert.equal(loop.sourceId, "ebookjapan");
  assert.equal(loop.authors, "単話著者A");
  assert.deepEqual(loop.statuses, ["分冊版"]);
  assert.equal(loop.ownedVolumes.length, 61);
  assert.equal(core.formatVolumes(loop.ownedVolumes), "1-61");
  assert.match(loop.coverUrl, /\/thumb\//);
  assert.match(loop.detailUrl, /^https:\/\/ebookjapan\.yahoo\.co\.jp\/bookshelf\/stories\//);
  const split = series.find((item) => item.title === "分冊件数サンプル");
  assert.equal(split.authors, "単話著者B");
  assert.deepEqual(split.statuses, ["分冊版"]);
  assert.equal(split.ownedVolumes.length, 59);
});

test("ebookjapan単話URLでは単話専用ルールが通常本棚ルールより先に一致する", () => {
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/stories/";
  const rule = rules.find((candidate) => candidate.enabled && core.matchesUrl(url, candidate.urlPatterns));
  assert.equal(rule.id, "ebookjapan-stories");
});

test("ebookjapanの本棚ビューから複数巻をシリーズ集約する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const books = core.parseDocument(documentOf("ebookjapan-countview.html"), rule, url);
  assert.ok(books.length >= 4, `抽出件数: ${books.length}`);
  const series = core.aggregateRecords(books.map((item) => core.normalizeRecord(item, rule, url)));
  const book = series.find((item) => item.title === "サンプル婚 目が覚めたらテスト上司の妻だった！？");
  assert.deepEqual(book.ownedVolumes, [2, 3, 4, 5]);
  assert.equal(book.externalIds.length, 4);
  assert.equal(book.authors, "");
  assert.equal(book.bibliographicComplete, false);
});

test("ebookjapanのリストビューと本棚ビューをマージして著者と所持巻数を補完する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const list = core.aggregateRecords(core.parseDocument(documentOf("ebookjapan-list.html"), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url, "2026-06-23T10:00:00.000Z")));
  const shelf = core.aggregateRecords(core.parseDocument(documentOf("ebookjapan-countview.html"), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url, "2026-06-23T10:05:00.000Z")));
  const merged = new Map();
  for (const item of [...list, ...shelf]) merged.set(item.key, core.mergeRecords(merged.get(item.key), item));
  const book = merged.get("ebookjapan:series:サンプル婚 目が覚めたらテスト上司の妻だった！？");
  assert.equal(book.authors, "サンプル著者E");
  assert.deepEqual(book.ownedVolumes, [2, 3, 4, 5]);
  assert.equal(book.externalIds.length, 4);
  assert.equal(book.firstSeenAt, "2026-06-23T10:00:00.000Z");
  assert.equal(book.bibliographicComplete, true);
});

test("ebookjapanの分冊版と話数表記をシリーズ集約してステータス化する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const html = `
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJSPLIT004.jpg" alt="分冊サンプル（分冊版） 【第4話】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJSPLIT005.jpg" alt="分冊サンプル（分冊版） 【第5話】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJSTORY003.jpg" alt="story巻数サンプル story03"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJSTORY004.jpg" alt="story巻数サンプル story04"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJBERRY002.jpg" alt="話数末尾サンプル（分冊版）2話"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJBERRY003.jpg" alt="話数末尾サンプル（分冊版）3話"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJBONUS004.jpg" alt="特典除去サンプル （4）電子限定描きおろし特典つき"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJBONUS005.jpg" alt="特典除去サンプル （5）電子限定描きおろし特典つき"></div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  const split = series.find((item) => item.title === "分冊サンプル（分冊版）");
  assert.deepEqual(split.ownedVolumes, [4, 5]);
  assert.deepEqual(split.statuses, ["分冊版"]);
  const story = series.find((item) => item.title === "story巻数サンプル");
  assert.deepEqual(story.ownedVolumes, [3, 4]);
  assert.deepEqual(story.statuses, ["分冊版"]);
  const berry = series.find((item) => item.title === "話数末尾サンプル（分冊版）");
  assert.deepEqual(berry.ownedVolumes, [2, 3]);
  assert.deepEqual(berry.statuses, ["分冊版"]);
  const work = series.find((item) => item.title === "特典除去サンプル");
  assert.deepEqual(work.ownedVolumes, [4, 5]);
  assert.deepEqual(work.statuses, []);
});

test("ebookjapanの特典表記・直結数字・副題前数字・ローマ数字をシリーズ集約する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const html = `
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJBONUS001.jpg" alt="ｓｈａｒｅ【電子版限定特典付き】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/W9100103842361.jpg" alt="しょうもないのうりょく 2 【特典ペーパー付き／カラーページ増量版】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJDIRECT003.jpg" alt="直結数字サンプル3"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/G6100263415161.jpg" alt="残り一日で破滅フラグ全部へし折ります ３ ざまぁRTA記録24Hr."></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJROMAN003.jpg" alt="ローマ数字サンプル III"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJPAREN002.jpg" alt="括弧巻数サンプル （2） 【おまけ漫画付】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/Z4100254897961.jpg" alt="天堂家物語 （13）【通常版】"></div>
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJCOMPLETE001.jpg" alt="完結表記サンプル（完）"></div>
  `;
  const series = core.aggregateRecords(core.parseDocument(documentFrom(html), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url)));
  assert.equal(series.find((item) => item.title === "ｓｈａｒｅ").title, "ｓｈａｒｅ");
  assert.deepEqual(series.find((item) => item.title === "しょうもないのうりょく").ownedVolumes, [2]);
  assert.deepEqual(series.find((item) => item.title === "直結数字サンプル").ownedVolumes, [3]);
  assert.deepEqual(series.find((item) => item.title === "残り一日で破滅フラグ全部へし折ります ざまぁRTA記録24Hr.").ownedVolumes, [3]);
  assert.deepEqual(series.find((item) => item.title === "ローマ数字サンプル").ownedVolumes, [3]);
  assert.deepEqual(series.find((item) => item.title === "括弧巻数サンプル").ownedVolumes, [2]);
  assert.deepEqual(series.find((item) => item.title === "天堂家物語").ownedVolumes, [13]);
  assert.equal(series.find((item) => item.title === "完結表記サンプル").ownedVolumes.length, 0);
});

test("ebookjapanは同一URLのリストビュー表紙を背表紙ビュー表紙より優先する", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const url = "https://ebookjapan.yahoo.co.jp/bookshelf/";
  const listHtml = `
    <div class="book-item">
      <img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/thumb/s/N4100061292461.jpg" alt="リスト表紙サンプル（３）【ebookjapan限定特典付】">
      <p class="book-item__author">長田亜弓</p>
    </div>
  `;
  const spineHtml = `
    <div class="book-item"><img class="book-item__image" src="https://cache2-ebookjapan.akamaized.net/contents/images-b/EJCOVER004.jpg" alt="リスト表紙サンプル（４）【ebookjapan限定特典＆電子限定特典付】"></div>
  `;
  const list = core.aggregateRecords(core.parseDocument(documentFrom(listHtml), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url, "2026-06-23T10:00:00.000Z")));
  const spine = core.aggregateRecords(core.parseDocument(documentFrom(spineHtml), rule, url)
    .map((item) => core.normalizeRecord(item, rule, url, "2026-06-23T10:05:00.000Z")));
  const merged = core.mergeRecords(list[0], spine[0]);
  assert.equal(merged.key, "ebookjapan:series:リスト表紙サンプル");
  assert.equal(merged.title, "リスト表紙サンプル");
  assert.equal(merged.authors, "長田亜弓");
  assert.deepEqual(merged.ownedVolumes, [3, 4]);
  assert.match(merged.coverUrl, /\/thumb\//);
  assert.equal(spine[0].coverUrl, "");
});

test("保存済みebookjapanレコードの再正規化でも特典表記とローマ数字を畳む", () => {
  const rule = rules.find((r) => r.id === "ebookjapan");
  const old = core.normalizeRecord({
    sourceId: "ebookjapan",
    externalIds: ["EJROMAN003"],
    title: "ローマ数字サンプル III",
    statuses: [],
    ownedVolumes: [],
    pageUrl: "https://ebookjapan.yahoo.co.jp/bookshelf/",
    firstSeenAt: "2026-06-23T10:00:00.000Z",
    lastSeenAt: "2026-06-23T10:00:00.000Z"
  }, rule, "https://ebookjapan.yahoo.co.jp/bookshelf/");
  assert.equal(old.key, "ebookjapan:series:ローマ数字サンプル");
  assert.equal(old.title, "ローマ数字サンプル");
  assert.deepEqual(old.ownedVolumes, [3]);
});

test("ebookjapanは本棚ビューの空書誌でリストビューの書誌を上書きしない", () => {
  const previous = { key:"ebookjapan:series:x", title:"リストビュータイトル", authors:"著者A", detailUrl:"list", coverUrl:"list-cover", bibliographicComplete:true, externalIds:["a"], statuses:[], ownedVolumes:[1], firstSeenAt:"2026-01-01T00:00:00Z" };
  const incoming = { key:"ebookjapan:series:x", title:"背表紙タイトル", authors:"", detailUrl:"shelf", coverUrl:"shelf-cover", bibliographicComplete:false, externalIds:["b"], statuses:[], ownedVolumes:[2], firstSeenAt:"2026-01-02T00:00:00Z" };
  const merged = core.mergeRecords(previous, incoming);
  assert.equal(merged.title, "リストビュータイトル");
  assert.equal(merged.authors, "著者A");
  assert.equal(merged.detailUrl, "list");
  assert.deepEqual(merged.ownedVolumes, [1, 2]);
});

test("ebookjapanは本棚ビューを先に読んでも後続のリストビュー書誌で補完する", () => {
  const previous = { key:"ebookjapan:series:x", title:"背表紙タイトル", authors:"", detailUrl:"shelf", coverUrl:"shelf-cover", bibliographicComplete:false, externalIds:["a"], statuses:[], ownedVolumes:[1], firstSeenAt:"2026-01-01T00:00:00Z" };
  const incoming = { key:"ebookjapan:series:x", title:"リストビュータイトル", authors:"著者A", detailUrl:"list", coverUrl:"list-cover", bibliographicComplete:true, externalIds:["b"], statuses:[], ownedVolumes:[2], firstSeenAt:"2026-01-02T00:00:00Z" };
  const merged = core.mergeRecords(previous, incoming);
  assert.equal(merged.title, "リストビュータイトル");
  assert.equal(merged.authors, "著者A");
  assert.equal(merged.detailUrl, "list");
  assert.deepEqual(merged.ownedVolumes, [1, 2]);
});

test("マージ後も初回追加日時を維持する", () => {
  const previous = { key:"x", externalIds:["a"], statuses:[], ownedVolumes:[1], firstSeenAt:"2025-01-01T00:00:00Z" };
  const incoming = { key:"x", externalIds:["b"], statuses:[], ownedVolumes:[2], firstSeenAt:"2026-01-01T00:00:00Z", lastSeenAt:"2026-01-01T00:00:00Z" };
  const merged = core.mergeRecords(previous, incoming);
  assert.equal(merged.firstSeenAt, "2025-01-01T00:00:00Z");
  assert.deepEqual(merged.ownedVolumes, [1,2]);
});

test("CSVはExcel向けBOM、固定列、引用符エスケープを持つ", () => {
  const csv = core.toCsv([{ source: "DMM", title: '題名, "特別"', statuses: ["完結"], manualStatuses: ["注目"], favorite: true, ownedVolumes: [1,2,3,5,7,8,9] }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"題名, ""特別"""/);
  assert.match(csv, /"サービス","シリーズID","書籍ID一覧"/);
  assert.match(csv, /"完結; 注目"/);
  assert.match(csv, /"TRUE"/);
  assert.match(csv, /"1-3, 5, 7-9"/);
});

test("巻数表示は連番を範囲にまとめる", () => {
  assert.equal(core.formatVolumes([15, 1, 3, 2, 7, 9, 10, 11, 12, 13, 14]), "1-3, 7, 9-15");
});

test("冊数カウントは所持巻数を優先し、巻数不明時は書籍IDで数える", () => {
  assert.equal(core.recordItemCount({ ownedVolumes: [1, 2, 2], externalIds: ["a"] }), 2);
  assert.equal(core.recordItemCount({ ownedVolumes: [], externalIds: ["a", "b", "b"] }), 2);
  assert.equal(core.recordItemCount({ ownedVolumes: [1, 2], externalIds: ["a", "b", "extra"] }), 3);
  assert.equal(core.recordItemCount({ ownedVolumes: [], externalIds: [] }), 1);
  assert.equal(core.totalItemCount([
    { ownedVolumes: [1, 2, 3], externalIds: ["a"] },
    { ownedVolumes: [], externalIds: ["b", "c"] }
  ]), 5);
});

test("DMMの冊数カウントはシリーズURL由来の疑似IDを除外する", () => {
  const base = { sourceId: "dmm-books", seriesId: "4001776", ownedVolumes: [1, 2, 3] };
  assert.deepEqual(core.countableExternalIds({ ...base, externalIds: ["4001776", "latest", "volumes"] }), []);
  assert.equal(core.recordItemCount({ ...base, externalIds: ["4001776", "latest", "volumes"] }), 3);
  assert.equal(core.recordItemCount({ ...base, externalIds: ["4001776", "latest", "dmmvol004"] }), 3);
  assert.equal(core.recordItemCount({ ...base, externalIds: ["dmmvol001", "dmmvol002", "dmmvol003", "dmmvolBonus"] }), 4);
});

test("除外リストはキー・シリーズID・書籍IDで収集対象を判定する", () => {
  const record = { key: "dmm-books:series:s1", source: "DMM Books", sourceId: "dmm-books", seriesId: "s1", externalIds: ["c1"], title: "除外サンプル" };
  const exclusion = core.createExclusion(record, "2026-06-26T00:00:00.000Z");
  assert.equal(exclusion.excludedAt, "2026-06-26T00:00:00.000Z");
  assert.equal(core.isExcludedRecord(record, { [exclusion.key]: exclusion }), true);
  assert.equal(core.isExcludedRecord({ ...record, key: "dmm-books:series:renamed" }, { [exclusion.key]: exclusion }), true);
  assert.equal(core.isExcludedRecord({ ...record, key: "dmm-books:series:other", seriesId: "", externalIds: ["c1"] }, { [exclusion.key]: exclusion }), true);
  assert.equal(core.isExcludedRecord({ ...record, key: "kindle:series:s1", sourceId: "kindle" }, { [exclusion.key]: exclusion }), false);
});

test("手動ステータスは自動ステータスと合算し、再収集マージ後も維持する", () => {
  const previous = { key: "x", statuses: ["完結"], manualStatuses: ["お気に入り"], favorite: true, externalIds: [], ownedVolumes: [] };
  const incoming = { key: "x", statuses: ["未購入続刊あり"], statusesObserved: true, externalIds: [], ownedVolumes: [] };
  const merged = core.mergeRecords(previous, incoming, { replaceStatuses: true });
  assert.deepEqual(merged.statuses, ["未購入続刊あり"]);
  assert.deepEqual(merged.manualStatuses, ["お気に入り"]);
  assert.equal(merged.favorite, true);
  assert.deepEqual(core.recordStatuses(merged), ["未購入続刊あり", "お気に入り"]);
});

test("URLワイルドカードはパスとクエリを判定する", () => {
  assert.equal(core.matchesUrl("https://book.dmm.com/shelf/?tab=library&page=3", ["https://book.dmm.com/shelf/*"]), true);
  assert.equal(core.matchesUrl("https://book.dmm.com/product/1/", ["https://book.dmm.com/shelf/*"]), false);
  assert.equal(core.matchesUrl("https://book.dmm.com/product/4001776/volumes/?tab=purchased", ["https://book.dmm.com/product/*"]), true);
});

test("有効な標準ルールは取り込みガイド情報を持つ", () => {
  for (const rule of rules.filter((item) => item.enabled)) {
    assert.match(rule.importGuide.url, /^https:\/\//);
    assert.ok(rule.importGuide.summary.length > 0);
    assert.ok(rule.importGuide.steps.length > 0);
  }
});
