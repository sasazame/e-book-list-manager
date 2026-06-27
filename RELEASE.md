# Release Procedure

この手順は、Chrome拡張のGitHub Releaseを更新するためのメンテナ向けメモです。

## 前提

- `main` がリリース対象の最新状態であること
- `gh auth status` が成功すること
- JDKの `jar` コマンドが使えること
- 作業ツリーがcleanであること

```bash
git status --short
gh auth status
```

## 1. バージョンを更新する

新機能を含む場合はminor、修正のみならpatchを目安にします。

```bash
npm version 0.7.0 --no-git-tag-version
```

Chrome拡張のバージョンも同じ値に揃えます。

```json
{
  "version": "0.7.0"
}
```

対象ファイル:

- `package.json`
- `package-lock.json`
- `extension/manifest.json`

## 2. 検証とZIP生成

```bash
npm run check
npm test
npm run package
```

`npm run package` は `dist/e-book-list-manager.zip` を生成します。

## 3. バージョン更新をコミットしてpushする

```bash
git add package.json package-lock.json extension/manifest.json
git commit -m "Bump version to 0.7.0"
git push origin main
```

## 4. タグとGitHub Releaseを作成する

```bash
git tag v0.7.0
git push origin v0.7.0
gh release create v0.7.0 dist/e-book-list-manager.zip \
  --title "v0.7.0" \
  --notes "## Changes
- CSV import support for files exported by this extension
- DMM Books import guide updated to match the current bulk volume-fetch workflow
- Extension/package version bumped to 0.7.0" \
  --latest
```

既存タグやReleaseを作り直す場合は、先にGitHub側の状態を確認してから実行します。

```bash
git tag --sort=-v:refname | head
gh release list --limit 10
```

## 5. 公開確認

```bash
gh release list --limit 5
gh release view v0.7.0 --json tagName,name,assets,url,publishedAt
git status --short
```

確認ポイント:

- `v0.7.0` がLatestになっている
- `e-book-list-manager.zip` がRelease assetに添付されている
- 作業ツリーがcleanである

