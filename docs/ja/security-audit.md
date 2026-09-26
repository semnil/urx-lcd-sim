# セキュリティ監査

## 対象

GitHub Pages の公開構成、依存関係、Git の追跡対象と本番ビルド成果物。
アプリケーション全体の侵入試験ではない。

## 確認結果

| 対象 | 現在の構成 | 確認方法 |
| --- | --- | --- |
| デプロイ権限 | ビルドは `contents: read`。Release 作成ジョブだけに `contents: write`、デプロイだけに `pages: write` と `id-token: write` を付与する | `.github/workflows/pages.yml` のジョブ別権限を照合 |
| 配信条件 | `main` への push で `package.json` の `version` が変わり、テストとビルドが成功した場合に配信する。プルリクエストと通常のマージは配信せず、手動の迂回経路も設けない | 一時 Git 履歴でデプロイ判定を実行し、成果物とジョブの条件・`needs: build` を照合、`actionlint` を実行 |
| バージョン比較 | push 前後のコミットを読み、manifest の内容をコードとして実行しない。コミットの読み取り失敗や不正な manifest はビルドを失敗させる | バージョン変更の有無・複数コミットの push・ブランチ作成・対象外イベント・コミット欠落・不正な manifest をテスト |
| イベントの制限 | 成果物のアップロードとデプロイは、それぞれバージョン判定スクリプトの出力とは別に `main` への push を条件にする | 判定出力を配信可にして、PR・手動実行・別ブランチ・タグに対する workflow の条件式を評価。`main` への push を陽性対照として確認 |
| 公開順序 | 直列化したデプロイジョブ内で `origin/main` を再取得し、第一親の履歴に後続のバージョン変更があれば配信しない。通常の後続コミットは許可する | 完了順の逆転・旧実行の再実行・連続した版更新・版文字列の再利用・main の履歴変更・通常の後続変更をテスト。workflow の取得と判定のステップをローカル Git リモートで実行し、取得失敗も検証 |
| デプロイの待機 | 共通のデプロイグループに `queue: max` を指定し、実行中のジョブをキャンセルしない | 設定を [GitHub の concurrency 仕様](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) と照合。待機枠にはプラットフォーム所定の上限があり、満杯になると追加ジョブは受理されない |
| タグと Release | ビルド成功後、Release 作成ジョブが検査済み SHA にタグとドラフト Release を作成する。競合タグは移動せず失敗し、再実行では既存 Release を保持する。作成失敗時は Pages 配信へ進まない | API 応答を模したテストで版形式・ドラフトとプレリリース指定・生成ノート・既存の軽量タグと注釈付きタグ・部分失敗からの復旧・API 失敗を確認。同じクライアントで workflow 内の作成スクリプトも実行 |
| Actions | コミット SHA で固定し、チェックアウト後に認証情報を保持しない | 公式リリースのタグをコミットまで解決し、ワークフローと照合 |
| 依存関係 | Vitest は修正版の 4.1.11 以降を使う | [公式アドバイザリ](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) と lockfile を照合し、`pnpm audit` が通過 |
| 公開ファイル | 配信対象は `dist/` の HTML・JavaScript・CSS・favicon・リンクのプレビュー画像・フォントとフォントライセンス | `pnpm build` 後のファイルを列挙 |
| 追跡対象 | `reference/`・`work/`・依存インストール先・ビルド出力を含まない | `git ls-files` と公開前の履歴を確認 |
| 機密情報 | 秘密鍵・GitHub トークン・AWS アクセスキー・マシン識別子の検索パターンに該当なし | 追跡ファイルをパターン検索。パターン外の秘密情報が無いことを保証する検査ではない |

公開版の actionlint 1.7.12 は `concurrency.queue` を未知のキーとして報告する
([upstream issue](https://github.com/rhysd/actionlint/issues/657))。ローカルの lint では
`^unexpected key "queue" for "concurrency" section\.` だけを除外し、待機設定は workflow の
契約テストと上記の GitHub 仕様で確認する。

検証対象はローカルでのデプロイ判定の実行と workflow の検査。このローカル検査では、GitHub 上の
タグ・Release 作成、本番デプロイ、公開サイトの動作確認は実行していない。

測っていないが前提にしたもの: 無し。
