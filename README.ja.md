# urx-lcd-sim

YAMAHA URX シリーズ (URX22 / URX44 / URX44V) の 4.3 インチ LCD タッチスクリーンを、
ブラウザ上で操作できる形にした**非公式**のシミュレーター。

実機を触らずに画面遷移と操作手順を確認するためのもの。単独で完結したプロジェクトで、
これ自体は実機と通信しない。

> English: [README.md](README.md)

[シミュレーターを開く](https://urx-lcd-sim.semnil.com/)

## できること

- HOME (Overview) からチャンネルビュー、SETUP、MONITOR、SCENE、microSD、各チャンネル画面までの
  画面遷移
- 画面のタッチ操作 (ボタン、値ボックス、プルダウン、リスト、ダイアログ)
- INS FX と FX チャンネルのエフェクト (種類の選択と、そのエフェクトのパラメーター設定)
- USER DEFINED KNOBS モードの切り替え
- URX22 / URX44 / URX44V の機種切り替え (ストリップ構成とメニューが変わる)
- 表示倍率の切り替え (50% / 75% / 100% / 150% / 200%。`?zoom=150` でも指定できる)
- キーボードのみでの操作 (Tab で移動、Enter / Space で作動、矢印キーで値の増減)
- シーンメモリー、録音と設定ファイルが入る microSD カード、開き直しても残る本体の状態
  ([Reset the unit] で工場出荷状態から始め直す)

実機の物理コントロールは再現しない。値はすべて画面上で変更する (ドラッグ、ホイール、矢印キー)。
画面下部のノブストリップは実機では読み出しだけだが、ここでは値の入っている区画をそのまま回せる。

メーターはフェーダー・オシレーター・CUE・A.Gain に従って動く合成信号を表示する。シミュレーター自体は
音声を扱わず、録音したファイルにも音は入らない。

## 動かす

Node.js は `.node-version`、pnpm は `package.json` に記載したバージョンを使う。

```bash
pnpm install
pnpm dev
```

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバー |
| `pnpm build` | 型チェック + 本番ビルド |
| `pnpm test` | ユニットテスト |
| `pnpm typecheck` | 型チェックのみ |

外部ランタイム依存は無い。開発用の依存は TypeScript / Vite / Vitest だけ。

## ホスティング

[GitHub Pages](https://urx-lcd-sim.semnil.com/) でリリースした本番ビルドを配信する。
[GitHub Pages ワークフロー](.github/workflows/pages.yml) は、`main` 向けのプルリクエストと
`main` への push でテスト・型チェック・本番ビルドを実行する。デプロイは、push によって
`package.json` の `version` が変わり、検査が成功した場合に限る。それ以外のフィールドの変更や
通常のマージでは検査だけを行い、公開しない。

リリースするときはアプリケーションの変更を先にマージし、`package.json` の `version` だけを
更新する独立したプルリクエストをマージする。この値がアプリケーションのバージョンの定義元で、
シミュレーターの VERSION 画面にも使われる。ワークフローは push 前後のコミットを比較し、
push されたコミットから作った `dist/` だけを配信する。デプロイジョブは待機中のジョブを
置き換えずにキューへ入れ、配信直前に `main` を再取得する。後続のバージョン変更があれば
古い実行の配信をスキップし、通常の変更だけが後続した場合はリリースを許可する。
リリースの失敗時は、最新のバージョン更新である間は元の Actions 実行を再実行できる。
これらの検査を迂回する手動デプロイのトリガーは設けない。

検査成功後、検査したコミットに `v<version>` タグを付け、自動生成したリリースノート付きの
ドラフト GitHub Release を作成する。バージョンは安定版の `X.Y.Z` と、`-alpha`・`-beta`・`-rc`
の接尾辞に対応する。接尾辞には数字とドットを続けられ、接尾辞付きはプレリリースとして扱う。ドラフトは内容を
確認して手動で公開する。Pages 配信はタグとドラフトの作成成功を待つが、ドラフトの公開は待たない。

再実行では、既存タグが同じ検査済みコミットを指す場合だけ再利用し、既存 Release と手編集した
ノートを保持する。タグ作成後に Release 作成が失敗した場合は、再実行でドラフトを作成する。
同名タグが別コミットを指す場合は、タグを移動せずに失敗する。後続のバージョン更新がある版にも
タグとドラフトを作成し、最新性の検査は Pages 配信だけに適用する。

リポジトリの **Settings → Pages** で配信元を **GitHub Actions**、カスタムドメインを
`urx-lcd-sim.semnil.com` に設定し、**Enforce HTTPS** を有効にする。DNS (Domain Name System)
の `CNAME` レコードは `semnil.github.io` を指す。カスタムドメインは Pages の設定で管理し、
この Actions による配信では `CNAME` ファイルを使わない。

## ドキュメント

[docs/ja/](docs/ja/) に置く。同じ文書の英語版は [docs/en/](docs/en/) にある。

| 文書 | 内容 |
| --- | --- |
| [architecture.md](docs/ja/architecture.md) | レイヤ構成、値の流れ、画面の登録方法 |
| [device-integration.md](docs/ja/device-integration.md) | 画面の後ろに実機を置くための設計と手順 |
| [screen-inventory.md](docs/ja/screen-inventory.md) | 実機の全画面と実装状況の対応表 |
| [screen-map.md](docs/ja/screen-map.md) | どの画面からどの画面へ行けるかの地図 |
| [known-issues.md](docs/ja/known-issues.md) | 実機にあってここでは作っていないもの |
| [design-tokens.md](docs/ja/design-tokens.md) | 配色・寸法の採取方法と出所 |

## 画面の見た目の根拠

配色と寸法は、ユーザーガイド (英語版 revision D0) に埋め込まれた 480x272 の画面キャプチャ
からピクセル単位で採取した。工場出荷時のチャンネル値は、リセット直後の URX44V が
保持している値。詳細は [design-tokens.md](docs/ja/design-tokens.md) を参照。

`reference/` にはそのキャプチャを取り出したものが入るが、Yamaha の著作物のため git 管理外で、
リポジトリにもビルド成果物にも含まれない。手元で再生成する場合:

```bash
node scripts/extract-ug-screens.mjs --pdf <ユーザーガイドの PDF>
```

ガイドの紙面には一部だけが載るキャプチャがある。紙面に写る範囲は次のコマンドで
`reference/ug-lcd/visible.json` に書く (python3 と pypdf、cryptography が要る):

```bash
python3 scripts/ug-visible-ranges.py --pdf <ユーザーガイドの PDF>
```

## 実機との関係

シミュレーターは実機のプロトコルを持たない。値は `DeviceTransport`
(`src/device/transport.ts`) の向こう側にあり、既定ではプロセス内の `SimTransport` が持つ。
実機を動かす場合は、ホストアプリケーションが自前のデバイスリンクを `BridgeTransport` に
注入する。

検証済みでないアドレスを実機へ書く経路は存在しない。パスと実機のアドレスの対応表
(`BindingTable`) は初期状態が空で、未束縛のパスへの書き込みは拒否される。

## 免責

本ソフトウェアは現状有姿で提供され、いかなる保証も伴わない。ハードウェアの損傷・設定の消失・
その他の損害について作者は責任を負わない。これ単体が実機へ書き込むことはない — 束縛テーブルは
空の状態で配布され、実機を動かすには検証済みカタログとデバイスリンクの両方をホスト
アプリケーションが供給する必要がある。その統合を作る場合、実機へのデータ送信には常にリスクが
伴い、それを引き受けた上で使うことになる。

## ライセンス

[MIT](LICENSE) © semnil

ビルド成果物には IBM Plex Sans 書体 (Copyright © 2017 IBM Corp.、予約フォント名 "Plex") を SIL Open Font License 1.1
のもとで同梱する。フォントファイルとライセンス本文は `public/fonts/` にあり、そのままビルド成果物へ複製される。

## 商標

YAMAHA、URX22、URX44、URX44V は Yamaha Corporation の商標。本プロジェクトは非公式かつ独立した
もので、ヤマハ株式会社とは提携・後援・推奨のいずれの関係も無い。
