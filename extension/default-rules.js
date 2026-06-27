(function (root) {
  root.EBOOK_RULES_VERSION = 13;
  root.EBOOK_DEFAULT_RULES = [
    {
      "id": "kindle",
      "name": "Kindle ライブラリ",
      "enabled": true,
      "urlPatterns": [
        "https://read.amazon.co.jp/kindle-library*"
      ],
      "importGuide": {
        "url": "https://read.amazon.co.jp/kindle-library",
        "summary": "Kindleライブラリを開くと自動で取り込みます。",
        "steps": [
          "Amazonへログインした状態でURLを開く",
          "一覧を下へスクロールし、取り込みたい書籍を画面に読み込ませる",
          "拡張アイコンの保存件数を確認する"
        ],
        "note": "遅延読み込みされた書籍も順次追加されます。大量にある場合は一覧の最後までスクロールしてください。"
      },
      "parser": "kindle",
      "bookSelector": "[id^='library-item-option-']",
      "fields": [
        {
          "key": "externalId",
          "label": "Amazon ASIN",
          "value": "attribute",
          "attribute": "id",
          "match": "^library-item-option-(.+)$",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "タイトル",
          "selector": "[id^='title-']",
          "value": "text"
        },
        {
          "key": "authors",
          "label": "著者",
          "selector": "[id^='author-']",
          "value": "text"
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": "img[id^='cover-']",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "titleCleanup": [
        {
          "description": "言語表記を削除",
          "match": "\\s*\\(Japanese Edition\\)\\s*$",
          "replace": ""
        },
        {
          "description": "電子限定・特典表記をシリーズ名から外す",
          "match": "\\s*(?:【[^】]*(?:電子|特典|限定)[^】]*】|[（(][^）)]*(?:電子|特典|限定)[^）)]*[）)]|電子(?:版)?限定.*?特典(?:付き|つき)|特典ペーパー付き(?:／カラーページ増量版)?|カラーページ増量版)\\s*$",
          "replace": ""
        }
      ],
      "statusRules": [
        {
          "description": "分冊版・話数表記をステータス化する",
          "field": "title",
          "match": "分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話(?:\\s|$)",
          "status": "分冊版"
        }
      ],
      "seriesGrouping": {
        "description": "上から順に巻数パターンを試し、最初に一致した数字を所持巻数としてシリーズ化します",
        "keyField": "",
        "volumePatterns": [
          {
            "description": "『作品名 story03』",
            "match": "\\s*story\\s*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 【第4話】』",
            "match": "\\s*【\\s*第\\s*([0-9０-９]+)\\s*話\\s*】\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 （2）』『作品名(2)』",
            "match": "\\s*[（(]\\s*([0-9０-９]+)\\s*[）)]\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名(2) (レーベル)』",
            "match": "\\s*[（(]\\s*([0-9０-９IVXLCDMⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\\s*[）)](?=\\s*[（(][^）)]*[）)]\\s*$)",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『第3巻』『３巻』『3冊』『3話』",
            "match": "\\s*(?:第\\s*)?([0-9０-９]+)\\s*(?:巻|冊|話)(?=\\s|$|[（(【])",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『THE COMIC 2 (レーベル)』『作品名 2』",
            "match": "[\\s　:：]+([0-9０-９]+)(?=\\s*(?:[（(]|$))",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          }
        ]
      }
    },
    {
      "id": "dmm-books",
      "name": "DMM Books 本棚",
      "collectionName": "DMM Books",
      "enabled": true,
      "urlPatterns": [
        "https://book.dmm.com/shelf/*"
      ],
      "importGuide": {
        "url": "https://book.dmm.com/shelf/?tab=library&page=1",
        "summary": "DMM Booksの購入済み本棚からシリーズ、著者、ステータスを取り込みます。",
        "steps": [
          "DMMへログインした状態でURLを開く",
          "本棚の各ページを順番に表示する",
          "収集済み書籍を開き、サービスをDMM Booksに絞り込む",
          "所持巻数を補完する場合は『所持巻数を取得する』を押す"
        ],
        "note": "本棚ページだけでは所持巻数を取得できません。管理一覧の一括取得はDMMへログイン済みのブラウザセッションで購入済み巻APIを順番に取得します。"
      },
      "parser": "dom",
      "bookSelector": "[data-testid='purchasable-library-book']",
      "fields": [
        {
          "key": "externalId",
          "label": "DMMコンテンツID",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/[^/]+/([^/]+)/.*",
          "replace": "$1"
        },
        {
          "key": "seriesId",
          "label": "DMMシリーズID",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "タイトル",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "alt"
        },
        {
          "key": "authors",
          "label": "著者",
          "selector": "[data-testid='library-book-authors'] span",
          "value": "text",
          "join": "; "
        },
        {
          "key": "statuses",
          "label": "ステータス（完結・未購入続刊あり等）",
          "selector": "[data-testid='label']",
          "value": "text",
          "type": "array"
        },
        {
          "key": "category",
          "label": "カテゴリ",
          "selector": "[data-testid='library-book-authors'] + div",
          "value": "text"
        },
        {
          "key": "detailUrl",
          "label": "購入済み全巻一覧URL",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "/product/$1/volumes/?tab=purchased",
          "resolveUrl": true
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "titleCleanup": [
        {
          "description": "電子限定・特典表記をシリーズ名から外す",
          "match": "\\s*(?:【[^】]*(?:電子|特典|限定)[^】]*】|[（(][^）)]*(?:電子|特典|限定)[^）)]*[）)]|電子(?:版)?限定.*?特典(?:付き|つき)|特典ペーパー付き(?:／カラーページ増量版)?|カラーページ増量版)\\s*$",
          "replace": ""
        }
      ],
      "statusRules": [
        {
          "description": "分冊版・話数表記をステータス化する",
          "field": "title",
          "match": "分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話(?:\\s|$)",
          "status": "分冊版"
        }
      ],
      "seriesGrouping": {
        "description": "DMMの一覧はシリーズIDで集約し、個別ページルールが同じIDへ所持巻数を追加します",
        "keyField": "seriesId",
        "volumePatterns": []
      }
    },
    {
      "id": "dmm-books-product",
      "name": "DMM Books 購入済み全巻一覧",
      "collectionId": "dmm-books",
      "collectionName": "DMM Books",
      "enabled": true,
      "urlPatterns": [
        "https://book.dmm.com/product/*"
      ],
      "importGuide": {
        "url": "https://book.dmm.com/product/<シリーズID>/volumes/?tab=purchased",
        "summary": "DMM Booksのシリーズ別購入済み全巻一覧から、所持巻数と書籍IDを補完します。",
        "steps": [
          "通常は収集済み書籍でサービスをDMM Booksに絞り込み、『所持巻数を取得する』を押す",
          "個別に確認する場合は一覧画面のDMMタイトルリンクから購入済み全巻一覧を開く",
          "ページを直接開いた場合は『購入済み』タブの巻一覧が表示されるまで待つ"
        ],
        "note": "一括取得ではページDOMではなくDMM BooksのBFF APIを使います。ページを直接開いた場合も自動解析しますが、未購入巻は所持巻数に含めません。"
      },
      "parser": "dom",
      "bookSelector": "[data-testid='purchased-volume-book']",
      "fields": [
        {
          "key": "externalId",
          "label": "DMMコンテンツID",
          "selector": "a[href*='product_id=']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*[?&]product_id=([^&]+).*",
          "replace": "$1"
        },
        {
          "key": "seriesId",
          "label": "DMMシリーズID",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "タイトルと巻数",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "alt"
        },
        {
          "key": "detailUrl",
          "label": "購入済み全巻一覧URL",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "/product/$1/volumes/?tab=purchased",
          "resolveUrl": true
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "titleCleanup": [
        {
          "description": "版固有の特典表記を削除",
          "match": "\\s*【電子特別版】\\s*$",
          "replace": ""
        },
        {
          "description": "電子限定・特典表記をシリーズ名から外す",
          "match": "\\s*(?:【[^】]*(?:電子|特典|限定)[^】]*】|[（(][^）)]*(?:電子|特典|限定)[^）)]*[）)]|電子(?:版)?限定.*?特典(?:付き|つき)|特典ペーパー付き(?:／カラーページ増量版)?|カラーページ増量版)\\s*$",
          "replace": ""
        }
      ],
      "statusRules": [
        {
          "description": "分冊版・話数表記をステータス化する",
          "field": "title",
          "match": "分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話(?:\\s|$)",
          "status": "分冊版"
        }
      ],
      "seriesGrouping": {
        "description": "購入済みタブのカードだけを対象に、シリーズIDで本棚データへ巻数を追加します",
        "keyField": "seriesId",
        "volumePatterns": [
          {
            "description": "『作品名 story03』",
            "match": "\\s*story\\s*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 【第4話】』",
            "match": "\\s*【\\s*第\\s*([0-9０-９]+)\\s*話\\s*】\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 4話』『作品名4話』",
            "match": "\\s*([0-9０-９]+)\\s*話\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 （5）』『作品名 (5)』",
            "match": "\\s*[（(]([0-9０-９]+)[）)]",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 5巻』",
            "match": "\\s*(?:第\\s*)?([0-9０-９]+)\\s*巻",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          }
        ]
      }
    },
    {
      "id": "dmm-books-thanks",
      "name": "DMM Books 購入完了ページ",
      "collectionId": "dmm-books",
      "collectionName": "DMM Books",
      "enabled": true,
      "urlPatterns": [
        "https://book.dmm.com/thanks/*"
      ],
      "importGuide": {
        "url": "https://book.dmm.com/thanks/?order_id=<注文ID>",
        "summary": "購入完了時に今回購入した書籍を自動で追加します。",
        "steps": [
          "通常どおりDMM Booksで購入手続きを完了する",
          "『ご購入ありがとうございました』画面が表示されるまで移動しない",
          "購入品が一覧へ追加されたことを拡張アイコンで確認する"
        ],
        "note": "購入完了ページのURLを手入力する必要はありません。予約商品には『予約済み』タグが付きます。"
      },
      "parser": "dom",
      "bookSelector": "main [data-variant='wide']",
      "fields": [
        {
          "key": "externalId",
          "label": "DMMコンテンツID",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/[^/]+/([^/]+)/.*",
          "replace": "$1"
        },
        {
          "key": "seriesId",
          "label": "DMMシリーズID",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "購入タイトルと巻数",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "alt"
        },
        {
          "key": "releaseInfo",
          "label": "予約配信情報",
          "selector": "[data-color='black'][data-is-read]",
          "value": "text"
        },
        {
          "key": "detailUrl",
          "label": "購入済み全巻一覧URL",
          "selector": "a[href*='/product/']",
          "value": "attribute",
          "attribute": "href",
          "match": ".*/product/([^/]+)/.*",
          "replace": "/product/$1/volumes/?tab=purchased",
          "resolveUrl": true
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": "img[data-testid='book-image']",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "statusRules": [
        {
          "description": "配信開始予定がある購入品を予約済みにする",
          "field": "releaseInfo",
          "match": "配信開始予定",
          "status": "予約済み"
        },
        {
          "description": "分冊版・話数表記をステータス化する",
          "field": "title",
          "match": "分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話(?:\\s|$)",
          "status": "分冊版"
        }
      ],
      "titleCleanup": [
        {
          "description": "電子限定・特典表記をシリーズ名から外す",
          "match": "\\s*(?:【[^】]*(?:電子|特典|限定)[^】]*】|[（(][^）)]*(?:電子|特典|限定)[^）)]*[）)]|電子(?:版)?限定.*?特典(?:付き|つき)|特典ペーパー付き(?:／カラーページ増量版)?|カラーページ増量版)\\s*$",
          "replace": ""
        }
      ],
      "seriesGrouping": {
        "description": "購入完了画面の各商品をシリーズIDで既存データへマージします",
        "keyField": "seriesId",
        "volumePatterns": [
          {
            "description": "『作品名 story03』",
            "match": "\\s*story\\s*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 【第4話】』",
            "match": "\\s*【\\s*第\\s*([0-9０-９]+)\\s*話\\s*】\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 4話』『作品名4話』",
            "match": "\\s*([0-9０-９]+)\\s*話\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 （5）』『作品名（5）』",
            "match": "\\s*[（(]([0-9０-９]+)[）)]\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "タイトル末尾の『7』『７』",
            "match": "[\\s　]*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          }
        ]
      }
    },
    {
      "id": "ebookjapan-stories",
      "name": "ebookjapan 単話本棚",
      "collectionId": "ebookjapan",
      "collectionName": "ebookjapan",
      "enabled": true,
      "urlPatterns": [
        "https://ebookjapan.yahoo.co.jp/bookshelf/stories/*"
      ],
      "importGuide": {
        "url": "https://ebookjapan.yahoo.co.jp/bookshelf/stories/",
        "summary": "ebookjapanの単話本棚からタイトル・著者・所持話数を取り込みます。",
        "steps": [
          "Yahoo! JAPANへログインした状態でURLを開く",
          "話・連載の購入済み一覧が表示されるまで待つ",
          "ページ内の単話シリーズ件数を確認する"
        ],
        "note": "一覧の件数表示を所持話数として扱い、1-N形式で保存します。個別の欠番まではこの一覧からは判定しません。"
      },
      "parser": "dom",
      "bibliographicField": "authors",
      "bookSelector": ".story-item",
      "fields": [
        {
          "key": "externalId",
          "label": "ebookjapan単話ID",
          "selector": ".story-cover__img",
          "value": "attribute",
          "attribute": "src",
          "match": ".*/([^/?]+)\\.(?:jpg|jpeg|png|webp).*",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "タイトル",
          "selector": ".story-caption__title",
          "value": "text"
        },
        {
          "key": "authors",
          "label": "著者",
          "selector": ".story-caption__author",
          "value": "text"
        },
        {
          "key": "ownedCount",
          "label": "所持話数",
          "selector": ".story-item__count",
          "value": "text"
        },
        {
          "key": "detailUrl",
          "label": "単話本棚URL",
          "selector": "a.serial-story-item",
          "value": "attribute",
          "attribute": "href",
          "resolveUrl": true
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": ".story-cover__img",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "titleCleanup": [
        {
          "description": "単話版接頭辞を外す",
          "match": "^\\s*【\\s*単話版\\s*】\\s*",
          "replace": ""
        },
        {
          "description": "単話本棚の分冊版表記を外す",
          "match": "\\s*[【（(]\\s*分冊版\\s*[】）)]\\s*$",
          "replace": ""
        },
        {
          "description": "末尾の電子限定・特典・おまけ・通常版表記を外す",
          "match": "\\s*(?:(?:【[^】]*(?:電子|特典|限定|おまけ|通常版|描き下ろし|描きおろし|かきおろし|漫画付|付)[^】]*】)|(?:[（(][^）)]*(?:電子|特典|限定|おまけ|通常版|描き下ろし|描きおろし|かきおろし|漫画付|付|完)[^）)]*[）)]))\\s*$",
          "replace": ""
        }
      ],
      "statusRules": [
        {
          "description": "単話本棚URLを分冊版ステータス化する",
          "field": "detailUrl",
          "match": "/bookshelf/stories/",
          "status": "分冊版"
        },
        {
          "description": "単話・分冊表記をステータス化する",
          "field": "originalTitle",
          "match": "単話版|分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話$",
          "status": "分冊版"
        }
      ],
      "seriesGrouping": {
        "description": "単話一覧はタイトルでシリーズ集約し、件数を所持話数として保存します",
        "keyField": "",
        "volumePatterns": []
      }
    },
    {
      "id": "ebookjapan",
      "name": "ebookjapan 本棚",
      "collectionName": "ebookjapan",
      "enabled": true,
      "urlPatterns": [
        "https://ebookjapan.yahoo.co.jp/bookshelf/*"
      ],
      "importGuide": {
        "url": "https://ebookjapan.yahoo.co.jp/bookshelf/",
        "summary": "ebookjapanの本棚から購入済み書籍を取り込みます。",
        "steps": [
          "Yahoo! JAPANへログインした状態でURLを開く",
          "リストビューを表示し、タイトルと著者名を取り込む",
          "本棚ビュー（背表紙表示）へ切り替え、各巻の巻数を補完する"
        ],
        "note": "リストビューの件数表示だけでは所持巻の範囲を確定できないため、巻数を正確に補完するには本棚ビューも表示してください。"
      },
      "parser": "dom",
      "bibliographicField": "authors",
      "coverRequiresBibliographicField": true,
      "bookSelector": ".book-item",
      "fields": [
        {
          "key": "externalId",
          "label": "ebookjapan書籍ID",
          "selector": "img.book-item__image",
          "value": "attribute",
          "attribute": "src",
          "match": ".*/([^/?]+)\\.(?:jpg|jpeg|png|webp).*",
          "replace": "$1"
        },
        {
          "key": "title",
          "label": "タイトルと巻数",
          "selector": "img.book-item__image",
          "value": "attribute",
          "attribute": "alt"
        },
        {
          "key": "authors",
          "label": "著者",
          "selector": ".book-item__author",
          "value": "text"
        },
        {
          "key": "coverUrl",
          "label": "表紙URL",
          "selector": "img.book-item__image",
          "value": "attribute",
          "attribute": "src"
        }
      ],
      "titleCleanup": [
        {
          "description": "末尾の電子限定・特典・おまけ・通常版表記を外す",
          "match": "\\s*(?:(?:【[^】]*(?:電子|特典|限定|おまけ|通常版|描き下ろし|描きおろし|かきおろし|漫画付|付)[^】]*】)|(?:[（(][^）)]*(?:電子|特典|限定|おまけ|通常版|描き下ろし|描きおろし|かきおろし|漫画付|付|完)[^）)]*[）)]))\\s*$",
          "replace": ""
        },
        {
          "description": "末尾の裸特典表記を外す",
          "match": "\\s*(?:電子(?:版)?限定.*?特典(?:付き|つき|付)|特典ペーパー付き(?:／カラーページ増量版)?|カラーページ増量版)\\s*$",
          "replace": ""
        }
      ],
      "statusRules": [
        {
          "description": "分冊版表記をステータス化する",
          "field": "title",
          "match": "単話版|分冊版|story\\s*[0-9０-９]+|【\\s*第\\s*[0-9０-９]+\\s*話\\s*】|[0-9０-９]+\\s*話$",
          "status": "分冊版"
        }
      ],
      "seriesGrouping": {
        "description": "表紙altのタイトル末尾から巻数を抽出し、シリーズ名で集約します",
        "keyField": "",
        "volumePatterns": [
          {
            "description": "『作品名 story03』",
            "match": "\\s*story\\s*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 【第4話】』",
            "match": "\\s*【\\s*第\\s*([0-9０-９]+)\\s*話\\s*】\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 4話』『作品名4話』",
            "match": "\\s*([0-9０-９]+)\\s*話\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 第2巻』『作品名 2巻』『作品名2巻』",
            "match": "\\s*(?:第\\s*)?([0-9０-９]+)\\s*巻(?=\\s|$|[（(【])",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 3 ～副題～』『作品名 ３ 副題』",
            "match": "\\s+([0-9０-９]+)\\s+(?=[〜～\\-—―]|[^\\s]+)",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true,
            "replaceInSeriesTitle": " "
          },
          {
            "description": "『作品名 ： 2』『作品名:2』",
            "match": "\\s*[：:]\\s*([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 II』『作品名 Ⅲ』",
            "match": "\\s+([IVXLCDM]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\\s*$",
            "flags": "",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 （2）』『作品名(2)』",
            "match": "\\s*[（(]\\s*([0-9０-９]+)\\s*[）)]\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名2』『作品名１０』",
            "match": "([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          },
          {
            "description": "『作品名 2』のように末尾が巻数だけの表記",
            "match": "[\\s　]+([0-9０-９]+)\\s*$",
            "volumeGroup": 1,
            "removeFromSeriesTitle": true
          }
        ]
      }
    }
  ];
})(globalThis);
