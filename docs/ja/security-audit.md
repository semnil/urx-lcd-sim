# セキュリティ監査

## 対象

GitHub Pages の公開構成、依存関係、Git の追跡対象と本番ビルド成果物。
アプリケーション全体の侵入試験ではない。

## 確認結果

| 対象 | 現在の構成 | 確認方法 |
| --- | --- | --- |
| デプロイ権限 | ビルドは `contents: read`。デプロイだけに `pages: write` と `id-token: write` を付与する | `.github/workflows/pages.yml` のジョブ別権限を照合 |
| 配信条件 | `main` の検査成功後にデプロイする。プルリクエストは配信しない | イベント条件・`needs: build`・各ステップの失敗伝播を確認、`actionlint` を実行 |
| Actions | コミット SHA で固定し、チェックアウト後に認証情報を保持しない | 公式リリースのタグをコミットまで解決し、ワークフローと照合 |
| 依存関係 | Vitest は修正版の 4.1.11 以降を使う | [公式アドバイザリ](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) と lockfile を照合し、`pnpm audit` が通過 |
| 公開ファイル | 配信対象は `dist/` の HTML・JavaScript・CSS・フォントとフォントライセンス | `pnpm build` 後のファイルを列挙 |
| 追跡対象 | `reference/`・`work/`・依存インストール先・ビルド出力を含まない | `git ls-files` と公開前の履歴を確認 |
| 機密情報 | 秘密鍵・GitHub トークン・AWS アクセスキー・マシン識別子の検索パターンに該当なし | 追跡ファイルをパターン検索。パターン外の秘密情報が無いことを保証する検査ではない |

測っていないが前提にしたもの: 無し。
