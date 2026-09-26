# CLAUDE.md — urx-lcd-sim

YAMAHA URX22 / URX44 / URX44V の 4.3 インチ LCD タッチ画面 (480x272) をブラウザで操作する非公式シミュレーター。
概要・コマンドは README.md、構成と値の流れは docs/ja/architecture.md が正。ここにはそれらに無い作業上の規則だけを置く。

## 開発

- 開発サーバーは `pnpm dev --port 5188 --strictPort` (`.claude/launch.json` と同じ設定)
- 合否は `pnpm test` (Vitest + jsdom) と `pnpm typecheck`
- docs は `docs/en/` と `docs/ja/`、README は `README.md` と `README.ja.md`、`CONTRIBUTING.md` と `CONTRIBUTING.ja.md`、`SECURITY.md` と `SECURITY.ja.md` が対。片方を直したら同じ変更で他方の同じ節を直す。Mermaid 図を含む docs を触ったら描画して確かめる
- CONTRIBUTING の「描く範囲」「一次資料としてのユーザーガイド」「実機との接続」は、下の「描く範囲」「一次資料」「実機との関係」を外部の協力者向けに写したミラー。どちらかを直したら同じ変更で他方も直す
- 作らないと決めたものは `docs/ja/known-issues.md` と `docs/en/known-issues.md` が家。決めた時点で書く
- 画面の状態はブラウザに残る。出荷時の状態で確かめたいときは画面の外の [Reset the unit] (docs/ja/architecture.md「残る値」)

## 描く範囲

- 描くのは画面 (480x272) の内側だけ。筐体・物理ノブ・端子・製品色・製品写真由来の配色を持ち込まない
- 作らないと決めたコントロールは、実機と同じ位置に使えないボタンの面で描き、押しても何もしないようにする (例は docs/ja/known-issues.md のコントロールの表)
- 画面内のつまみの絵 (USER DEFINED KNOBS) は描いてよい。チャンネル/バスのアイコン (人物・ギター・ノート PC 等の絵) は描かず、単色の四角で代える (docs/ja/screen-inventory.md「チャンネル画面のツールバー」)
- 実機がノブで操作する値は画面上のコントロールで届くようにする (`src/app/knob-reach.test.ts` が固定)

## 一次資料 (ユーザーガイドの画面キャプチャ)

- `reference/` はヤマハの著作物で `.gitignore` 済み。コミット・ビルド・公開物に入れない。再生成は README.md「Where the appearance comes from」
- 公開ドキュメント (docs/・README) に作らない理由を書くときは、権利関係などの直接的な書き方を避ける
- 図から値を採る方法は docs/ja/design-tokens.md「採取方法」が正。紙面に写る範囲 (`reference/ug-lcd/visible.json`) の外の画素は根拠にしない。docs に書く図番号は `reference/ug-lcd/` の抽出名にする
- ガイドの図は実機と食い違うことがある。形・寸法・色は図から測ってよい。何が並ぶか・いくつあるか・大小文字は図だけで確定させず、実装した上でその点を操作者に確認する (大小文字は画面ごとに確認し、他の画面から類推しない)
- 図の無い寸法・形の決着条件に「実機を撮影して測る」を書かない・提案しない (撮影では画素単位で測れない)。操作者の指定か既存画面の形式に合わせる
- 確定した画面の事実はコードのコメント・docs・テストに書く

## 実機との関係

- 画面は意味のドットパスだけで値を読み書きする。`BindingTable` は空で出荷し、実機で検証していないアドレスを足さない (docs/ja/architecture.md「パラメータのアドレス指定」、`src/device/bridge-transport.test.ts` が固定)
