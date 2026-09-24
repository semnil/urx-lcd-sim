# デザイントークンの出所

`src/style/tokens.css` の色は、ユーザーガイド (英語版 revision D0) に埋め込まれている
480x272 の画面キャプチャからピクセル単位で採取した。目視で近い色を当てたものは無い。図に無い
シミュレーター自身の値は、その行と「画面の外側」の節にそう書く。

## 採取方法

ユーザーガイドの PDF には、実機の画面をそのまま貼ったビットマップが埋め込まれている。画面
ちょうど 480x272 のものと、画面の周りに白い余白を足したキャンバスに載ったものがある。
`scripts/extract-ug-screens.mjs` がこれを取り出し、`p<ページ番号 3 桁>-<連番>.png` の名前で
下の表の置き場所へ書く。連番はそのページの中で、同じディレクトリに入るキャプチャだけを数える。
この文書と [screen-inventory.md](screen-inventory.md) のキャプチャ ID (`p045-1`、`wide/p040-2`
など) は、`reference/ug-lcd/` から見たこのファイルのパスを指す。

| キャンバス (幅 x 高さ) | 置き場所 | 画面の左上 |
| --- | --- | --- |
| 480 x 272 | `reference/ug-lcd/` | (0, 0) |
| 480 x 281 | `reference/ug-lcd/` | (0, 0) |
| 480 x 289 | `reference/ug-lcd/` | (0, 8) |
| 686 x 281 | `reference/ug-lcd/wide/` | (0, 0) |
| 685 x 289、686 x 289 | `reference/ug-lcd/wide/` | (0, 8) |
| 686 x 297 | `reference/ug-lcd/wide/` | (0, 12) |
| 685 x 297 | `reference/ug-lcd/wide/` | (0, 13) |

座標は画面の左上を原点とする。余白付きのキャンバスで測るときは、この表の位置を引く。

ユーザーガイドは一部のキャプチャを PDF のクリップで切り取って載せている。`pdfimages` は画像を切り取る前の
全体で取り出すので、そうしたファイルには紙面に写らない画素が入る。`scripts/ug-visible-ranges.py` が PDF の
描画命令をたどり、キャプチャごとに紙面に写る範囲 (キャプチャの画素座標の矩形) と、面積のうち写っている
割合を `reference/ug-lcd/visible.json` に書く。範囲の外の画素は値の根拠に使わない。このスクリプトには
python3 と pypdf、cryptography (PDF が AES で暗号化されている) が要る。

取り出したキャプチャの多くは、R と B が 32 段・G が 64 段の値しか持たない (5-6-5 ビット)。段に乗らない
256 階調のものもある (p053-1・p088-2・p094-3 など)。段に乗るキャプチャから読んだ色は、実際の色と
R・B で 1 段 (8)、G で 1 段 (4) までずれうるので、混色の一致はこの幅で見る。

面の色は取り出したキャプチャの画面部分 (480x272) のうち紙面に写っている画素を合わせたピクセルヒストグラムの最頻値から、
個々のコントロールの色はそのコントロールを囲む矩形を切り出したヒストグラムの最頻値から取った。

```sh
python3 - <<'PY'
from PIL import Image
from collections import Counter
im = Image.open('reference/ug-lcd/p090-1.png').convert('RGB')
print(Counter(list(im.crop((118, 58, 175, 78)).getdata())).most_common(3))
PY
```

## 画面の物理仕様

| 項目 | 値 | 出所 |
| --- | --- | --- |
| 画面サイズ | 4.3 インチ タッチスクリーン | ユーザーガイド Specifications |
| 画面解像度 | 480 x 272 | 取り出したキャプチャの画面部分がすべてこの寸法 (余白付きのキャンバスを含む) |
| 画面の幅 (`--lcd-w`) | `480px` | 画面解像度 480 x 272 の横。`.lcd` はこの幅を画面ピクセルのまま組み、`.lcd-frame` が `--scale` 倍して表示する |
| 画面の高さ (`--lcd-h`) | `272px` | 画面解像度 480 x 272 の縦。`.lcd` の高さで、`.lcd-frame` はこれを `--scale` 倍した高さになる。ドロップダウンの一覧はここから 4px 引いた高さで止まる |

## 面と文字

| トークン | 値 | 使われている場所 |
| --- | --- | --- |
| `--lcd-bg` | `#000000` | 画面の地。キャプチャの画面部分のうち紙面に写っている画素の 43.6% を占める最頻色 |
| `--surface` | `#4a515a` | チャンネルストリップ・パネルの面。2 番目に多い色 (17.4%)。点灯した MONITOR の [CUE Interrupt] / [MONO] (p068-1) と点灯した SCENE LIST のバンク (p073-1) の名前 |
| `--surface-toolbar` | `#424952` | ツールバーの帯、押しボタンの面 |
| `--surface-inset` | `#313542` | チャンネルインジケーター領域の内側パネル |
| `--surface-inset-corner` | `#3a3d4a` | 内側パネルの角の画素 (p045-1 のインジケーター枠の x10 / y92、x8 / y94、x8 / y158、x10 / y160) |
| `--surface-raised` | `#5a5d63` | MONITOR ストリップのヘッダなど一段明るい面 |
| `--surface-well` | `#292d31` | 値ボックスの窪み (p094-1 のブロックの値、HOME のレベル値) |
| `--surface-dim` | `#3a3d42` | 点灯したサイドレールのタブの字形 (p059-1 の Analog のプラグ)、節見出しの帯の文字 (p061-1 の x18..401 / y56..79)、ソース選択シートのタイトル (p100-2 の x218..261 / y36..45) |
| `--well-deep` | `#191819` | PAN / LEVEL パネルの値ボックス |
| `--surface-sunk` | `#31393a` | PAN / LEVEL が載るパネル |
| `--surface-on-sunk` | `#5a656b` | MONITOR の [Source] (p068-1 の x6..95 / y112..151) と RECORDER のスロットのソースボタン (p079-2 の x319..388 / y184..220) の面 |
| `--graph-bg` | `#212021` | EQ / COMP カーブを描くパネル |
| `--graph-grid` | `#4a515a` | 同パネルに 0 dB で引かれる罫線 (p099-1 の x180 / y86) |
| `--graph-grid-lit` | `#63695a` | その罫線の、曲線の下の塗りに重なる区間 (p103-1 の x180 / y150) |
| `--handle-arrow` | `#ce0484` | フォーカスを持つつまみの、値の動く向きの両側の三角 (p103-1 の x141..147 / y93..100) |
| `--graph-fill` | `#424529` | COMP カーブの下を塗る色 (p099-1) |
| `--graph-line` | `#ada24a` | COMP カーブそのもの (p099-1) |
| `--eq-fill` | `#314529` | EQ カーブの下を塗る色 (p106-1) |
| `--eq-line` | `#6baa4a` | EQ 画面のカーブ (p106-1 の x60 / y160) |
| `--eq-thumb-line` | `#7bba63` | チャンネルビューの EQ ブロックのカーブの下の行 (p098-1 の y106) |
| `--eq-focus-edge` | `#b5086b` | 1-knob がオンのあいだの EQ ブロックのカーブの上の行 (p096-4 の x367 / y105) |
| `--eq-focus-line` | `#bd1884` | そのときの下の行 (p096-4 の y106) |
| `--eq-focus-fill` | `#4a1831` | そのときのカーブの下の面 (p096-4 の x317 / y107) |
| `--eq-badge-curve` | `#219e52` | 点灯した EQ の箱のカーブ (p106-1 の x254..297 / y8..34) |
| `--shape-box` | `#212421` | EQ 画面のフィルター形状の箱の面 (p106-1 の x300..359 / y51) |
| `--shape-box-edge` | `#636973` | 同、1px の縁 (p106-1 の y50 / y87 / x376) |
| `--oneknob-band` | `#3a3942` | 消灯した [1 1-knob] の下端 3px (p099-1 の x470 / y85..87) |
| `--oneknob-lit` | `#4aaa31` | 点灯した [1 1-knob] (p104-2 の x430 / y60) |
| `--oneknob-lit-band` | `#317529` | 点灯した [1 1-knob] の下端 3px (p104-2 の x430 / y85..87) |
| `--oneknob-panel` | `#393c42` | 1-knob がオンのあいだレベルとボタンの背後に置くパネル (p104-2 の x375 / y50) |
| `--oneknob-link` | `#4aa631` | 1-knob のレベルとボタンをつなぐ線 (p104-2 の x373..382 / y68..69) |
| `--oneknob-type` | `#636973` | 1-knob EQ のカーブの種類のプルダウンの面 (p106-2 の x250 / y60) |
| `--handle-face` | `#5a6163` | カーブ上の G / T / R つまみの面 (p099-1) |
| `--handle-ring` | `#a5aab5` | 同、3px の縁 |
| `--surface-btn` | `#52555a` | ガラスの上に単体で立つボタンの面 (p094-1 の SEND TO) |
| `--surface-disabled` | `#212829` | 使えないボタンの面 (p073-1 の Store、x5..94 / y230..268 と Edit タブ、x422..479 / y115..163) |
| `--surface-knob` | `#4a4952` | 右下隅のノブ切り替えボタンの面 (p045-1 の x432..477 / y238..269) |
| `--scroll-thumb-dim` | `#cecace` | 一覧のスクロールバーのつまみ (p073-1 の x395..402 / y110..124) |
| `--surface-sunken` | `#31313a` | ドロップダウンの一覧を載せる盆 (p079-3)、バンク一覧の帯 |
| `--menu-tray` | `#848284` | SETUP が GENERAL の 4 項目を載せるトレイ (p041-1) |
| `--readout` | `#42454a` | マルチファンクションノブ読み出しバーの面 (p070-1 の y235..254) |
| `--readout-edge` | `#c5c6ce` | 同バーの枠・仕切り線と、ラベルが載る帯 (同 y233..234 / y255..271) |
| `--readout-label` | `#3a3d42` | 同帯に載るラベルの文字 (p070-1 の x2..421 / y255..271) |
| `--text` | `#ffffff` | 本文 |
| `--text-secondary` | `#c5c6ce` | キャプション |
| `--text-muted` | `#6b6d7b` | オフ状態のラベル |
| `--tab-ink` | `#adaead` | 点灯していないサイドレールのタブの名前と字形 (p068-1 の Level、x422..479 / y50..101) |
| `--tab-name-lit` | `#31313a` | 点灯したサイドレールのタブの名前 (p059-1 の Analog、p087-1 の Format)。p067-1・p068-1・p073-1 は名前も字形と同じ `#3a3d42` で描いているが、多数の図に合わせて全画面でそろえた |
| `--caption-pale` | `#cecace` | Operation Mode の箱の見出し (p041-1 の x38..88 / y8..15) |
| `--drop-mark` | `#dedbde` | 一覧を開くボタンの下向きの印 (p047-1 のバンクボタン x205..213 / y9..14、[Sends] x468..476 / y65..70) |
| `--field-mark` | `#848a8c` | CH SETTING の欄の複製の印 (p093-2 の x124..133 / y58..67)。名前変更の印は `--text-muted` |
| `--ssmcs-data-mark` | `#8c9694` | SSMCS の Sweet Spot Data のボタンの複製の印 (p108-1 の x387..396 / y172..181) |
| `--knob-card-mark` | `#adaead` | USER DEFINED KNOBS のカードの複製の印 (p057-1 の x80..89 / y104..113) |
| `--rec-copy-mark` | `#dedfde` | RECORDER のスロットの Source ボタンの複製の印 (p079-2 の x378..387 / y185..194) |
| `--strip-id-other` | `#000000` | HOME のステレオの入力の名前の 1 行目で、チャンネルの画面が開かないほうの番号 (操作者の指定) |
| `--ink-on-lit` | `#3a3d3a` | 点灯した [USB Storage Mode] の名前 (p078-1)。選んだ選択肢の名前 — 言語 (p055-1)、SAMPLING FREQUENCY の周波数 (p058-1)、Peripheral (p061-1 / p062-1)、入力ソース・出力ソースのシート (p100-2 / p060-2)、割り当てのダイアログ (p040-1)、OSCILLATOR のモード (p070-1)、PAN / BALANCE (p093-1)、USER DEFINED KNOBS のバンク。点灯した [ON] や HDCP の [Enable] などの入切のスイッチは黒 (`--text-inverse`。HDCP の [Enable] は点灯した図が無く、実機で確認) |
| `--test-pass` | `#01ff00` | カードのテストの評価と録音の行 (p088-2) |
| `--text-disabled` | `#848284` | 使えないボタンとサイドレールのタブの名前 (p073-1 の Store、x5..94 / y230..268 と Edit タブ、x422..479 / y115..163) |
| `--menu-text-disabled` | `#7b797b` | 使えないメニュー項目の名前 (p078-1 の Recorder / Save/Load / Tools、x82..386 / y99..109) |
| `--text-inverse` | `#000000` | 明るい面に載る黒い名前。[ON] / [CUE] / [PRE] スイッチ (点灯・消灯とも)、ブロックのバッジとタイトル、点灯した選択肢 (p047-1 の [ON] のラベル、x19..35 / y182..190) |
| `--dim-disabled` | `0.475` | 使えないコントロールが元の明るさから残す割合。自分の色を保ったまま使えなくなる SAMPLING FREQUENCY の周波数の列 (USB クロックに追従している間) を `filter: brightness()` でこれだけ落とす。wide/p076-1 と p078-1 の Recorder / Save/Load / Tools のボタンは面 (74,81,90) が (33,40,41) に、名前 (255,255,255) が (123,121,123) に落ち、この係数はどちらの組にも各チャンネル 3/255 以内で乗る |

## アクセントと処理ブロック

| トークン | 値 | 採取元 |
| --- | --- | --- |
| `--accent-on` | `#84e3ff` | [ON] / [CUE] / [PRE] スイッチの点灯 (p045-1 / p090-1 / p116-1 の 3 画面で同値)、点灯した [HPF] / [HI-Z] と、HOME のストリップ・チャンネルビューの HPF・HI-Z の印 (印は操作者の指定) |
| `--accent-selected` | `#84dfff` | リストの選択行 (p073-1)、選択中の言語ボタン (p055-1)、USB Storage Mode (p078-1) |
| `--list-selected-mark` | `#3a3d3a` | 選択行に載る印。p073-1 の ▶ (x12..19 / y124..131) と工場プリセットの印 (x344..363 / y118..137)、p081-1 のスピーカー、p084-1 のファイル印、p074-1 の保護の錠 |
| `--scene-preset` | `#4adb5a` | 工場出荷のシーンの番号 (p073-1 のシーン名の箱の P01、x19..34 / y18..26。一覧の P02 / P03、x24..41 / y162..170 と y200..208) |
| `--scene-protect` | `#32eb73` | 保護中のシーンの Lock 欄 (p074-1 の 01、x329..378 / y112..143 の平均) |
| `--accent-cue` | `#d6ced6` | [CUE] ボタンのオフ状態 |
| `--accent-udk` | `#5a3984` | USER DEFINED KNOBS のバーの面 (p038-4 の x2..421 / y235..254) |
| `--accent-udk-label` | `#290c3a` | 同、帯に載るラベルの文字 (p038-4 の x2..421 / y255..271) |
| `--accent-udk-toggle` | `#633984` | USER DEFINED KNOBS のあいだの、右下のノブ切り替えボタンの面 (p038-4 の x430..479 / y235..271) |
| `--accent-udk-toggle-edge` | `#d6b2f7` | 同、上と左の 2px の縁 (p038-4 の x428..479 / y233..234、x428..429 / y233..271) |
| `--accent-udk-edge` | `#ceaeef` | 同、枠とラベルが載る帯 (p038-4 の y233..234 / y255..271) |
| `--accent-menu` | `#ffd74a` | サイドメニューの選択項目 (p067-1 の Level) |
| `--accent-band` | `#ade3ff` | EQ でノブに載っているバンドの箱 (p106-1) |
| `--accent-sends` | `#ce4529` | [Sends] ボタン、STEREO ストリップのレール |
| `--accent-sends-mix` | `#e66d00` | 送り先が MIX 1 / MIX 2 のときの [Sends] ボタン (p157-1 の x422..479 / y50..103)。OSCILLATOR の Assign の割り当てた MIX の箱 |
| `--accent-sends-fx` | `#5a9aff` | Sends の送り先が FX 1 / FX 2 のときの [Sends] ボタン、送り先の一覧の点いた行、レベルのロータリーの弧、OSCILLATOR の Assign の割り当てた FX の箱。FX を選んだ状態の図は無い |
| `--accent-focus` | `#ff009c` | TOUCH AND TURN のフォーカス枠 (p090-1 の A.Gain 値ボックス) |
| `--accent-focus-fill` | `#5a284a` | 同、枠の内側 |
| `--focus-ring` | `#f2f4f7` | キーで操作する場所を示すシミュレーター自身の印 (淡い破線)。実機から採ったものではない |
| `--send-off` | `#5a6169` | SEND TO 画面で切った送りを HOME のストリップが出すときの、つまみの面と弧。図に無く、シミュレーター自身の値 |
| `--send-off-ink` | `#8c949c` | 同、値の字。図に無く、値ボックスの窪み (`--surface-well`) に対して 4.5:1 を取るシミュレーター自身の値 |
| `--accent-bank-in` | `#429a29` | INPUT チャンネルバンクボタン |
| `--accent-bank-out` | `#de5152` | OUTPUT チャンネルバンクボタン。紙面に写る図にこのボタンは無く、同じ値は p071-1 の点灯した送り先ボタンの面 (x212..301 / y155..191) にある |
| `--accent-bank-active` | `#f7f73a` | 点灯しているバンクセル |
| `--accent-bank-cell` | `#318221` | INPUT のバンクボタンで表示していないバンクの印 (p047-1 の x181..194 / y21) |
| `--accent-bank-in-bevel` | `#296921` | INPUT チャンネルバンクボタンの下端 3px の帯 (p047-1 の x146..218 / y39..41) |
| `--accent-bank-out-bevel` | `#9c393a` | OUTPUT チャンネルバンクボタンの同じ帯。紙面に写る図にこのボタンは無く、面が同じ色の p071-1 の点灯した送り先ボタンの帯 (x214..299 / y192..194) の値を使う |
| `--accent-phantom` | `--accent-sends` と同値 | 点灯した [+48V] と、HOME のストリップ・チャンネルビューの +48V の印 (印は操作者の指定)。p047-1 の CH4 のストリップの点いた印 (x368..394 / y100..108)。点灯した [+48V] は印と同じ色 |
| `--accent-phase` | `--block-gate` と同値 | 点灯した [Φ] と、HOME のストリップ・チャンネルビューの Φ の印 (印は操作者の指定)。同じくパレットのオレンジ |

## ダイアログとボタンの縁

| トークン | 値 | 採取元 |
| --- | --- | --- |
| `--dialog-sheet` | `#bdbebd` | ダイアログの面 (wide/p040-2) とセクションの帯 (p061-1 の x18..401 / y56..79) |
| `--peripheral-text` | `#bdbebd` | Peripheral の見出しと注記 (p061-1 の x63..309 / y94..106 と x66..351 / y165..177) |
| `--dialog-edge` | `#5a9aff` | 同、外周 4px の枠と情報マークのリング |
| `--dialog-caution` | `#f7f73a` | 警告のダイアログ (TOOLS の Format) の枠と三角の印。図に無く、`--accent-bank-active` と同じ値を操作者が選んだ (2026-09-22) |
| `--dialog-ink` | `#31393a` | 同、面に載る問いの文字 |
| `--dialog-mark-face` | `#101010` | 情報マークの円 |
| `--btn-bevel` | `#31393a` | ボタンの既定の下端 3px。メニュー項目・ダイアログのボタン・シーン名の箱 (p066-1 の y118..120) と、面 (74,81,90) のボタン (p081-1 の停止、p084-1 の [Save]、p073-1 の [Recall] など) |
| `--btn-bevel-disabled` | `#191c19` | 使えないメニュー項目の下端 3px (p078-1 の x60 / y127) |
| `--btn-bevel-sunk` | `#42494a` | 沈んだ面の上のソースボタンの下端 3px。RECORDER のスロットのソースボタン (p079-2) と MONITOR の [Source] (p068-1) |
| `--btn-bevel-plain` | `#3a3d42` | [Follow USB] と USER DEFINED KNOBS のノブのカードの下端 3px (p057-1 のカード、y178..180) |
| `--udk-dial-rim-top` | `#524d52` | USER DEFINED KNOBS のつまみの絵の外周の上端 (p057-1 の x53 / y209) |
| `--udk-dial-rim-bottom` | `#191c19` | 同じく足元 (p057-1 の x53 / y261) |
| `--udk-dial-face-top` | `#312d31` | 外周の内側の面の上端 (p057-1 の x53 / y217) |
| `--udk-dial-face-mid` | `#3a393a` | 同じく中ほどの少し上 (p057-1 の x53 / y233) |
| `--udk-dial-face-low` | `#4a494a` | 同じく足元の少し上 (p057-1 の x53 / y246) |
| `--udk-dial-face-bottom` | `#524d52` | 同じく足元 (p057-1 の x53 / y251) |
| `--udk-dial-edge` | `#424142` | 面と外周の境の線 (p057-1 の x73 / y234) |
| `--tab-band` | `#42454a` | 点灯していないサイドレールのタブの下端 3px (p068-1 の Level、x422..479 / y99..101) |
| `--tab-band-lit` | `#9c8642` | 同、点灯したタブ (p068-1 の Setting、x422..479 / y158..160) |
| `--tab-band-disabled` | `#191c19` | 同、使えないタブ (p073-1 の Edit、x422..479 / y164..166) |
| `--tab-corner-outer` | `#293131` | 点灯していないサイドレールのタブの左上の角の外側の画素 (p061-1 の 2 枚目の x424 / y115、x422 / y117) |
| `--tab-corner-inner` | `#424952` | 同、左上の角の内側の画素 (p061-1 の 2 枚目の x423 / y116) |
| `--tab-corner-band-top` | `#424952` | 同、左下の角で帯の 1 行上に掛かる画素 (p061-1 の 2 枚目の x424 / y163) |
| `--tab-corner-band-outer` | `#292829` | 同、左下の角の外側の画素 (p061-1 の 2 枚目の x422 / y164、x424 / y166) |
| `--tab-corner-band-inner` | `#3a3d42` | 同、左下の角の内側の画素 (p061-1 の 2 枚目の x423 / y165) |
| `--tab-corner-outer-lit` | `#9c8629` | 点灯したタブの同じ画素 (p061-1 の 1 枚目の x424 / y56、x422 / y58) |
| `--tab-corner-inner-lit` | `#efc642` | 同 (p061-1 の 1 枚目の x423 / y57) |
| `--tab-corner-band-top-lit` | `#d6b642` | 同 (p061-1 の 1 枚目の x424 / y104) |
| `--tab-corner-band-outer-lit` | `#5a5129` | 同 (p061-1 の 1 枚目の x422 / y105、x424 / y107) |
| `--tab-corner-band-inner-lit` | `#8c793a` | 同 (p061-1 の 1 枚目の x423 / y106) |
| `--tab-corner-outer-disabled` | `#101819` | 使えないタブの同じ画素 (p073-1 の Edit の x424 / y115、x422 / y117) |
| `--tab-corner-inner-disabled` | `#192421` | 同 (p073-1 の Edit の x423 / y116) |
| `--tab-corner-band-top-disabled` | `#192021` | 同 (p073-1 の Edit の x424 / y163) |
| `--tab-corner-band-outer-disabled` | `#081008` | 同 (p073-1 の Edit の x422 / y164、x424 / y166) |
| `--tab-corner-band-inner-disabled` | `#101810` | 同 (p073-1 の Edit の x423 / y165) |
| `--corner-sunk-a` | `#101410` | ガラスに立つ沈んだセルの角の混色。外側から 1 つめ (p056-1 のパラメータのセル x116..201 / y144..227、p090-1 の PAN・LEVEL のセル)。チャンネルビューのブロックの帯がガラスに接する角も同じ |
| `--corner-sunk-b` | `#212829` | ガラスに立つ沈んだセルの角の混色。外側から 2 つめ (p056-1 のパラメータのセル x116..201 / y144..227、p090-1 の PAN・LEVEL のセル)。チャンネルビューのブロックの帯がガラスに接する角も同じ |
| `--corner-sunk-c` | `#212d29` | ガラスに立つ沈んだセルの角の混色。外側から 斜めの画素 (p056-1 のパラメータのセル x116..201 / y144..227、p090-1 の PAN・LEVEL のセル)。チャンネルビューのブロックの帯がガラスに接する角も同じ |
| `--corner-block-a` | `#191c21` | チャンネルビューのブロックの角の混色。上の角の外側から 1 つめ、帯へ曲がる段の 1 つめ (p090-1 の x110..195 / y50..133) |
| `--corner-block-b` | `#313d42` | チャンネルビューのブロックの角の混色。上の角の外側から 2 つめ、帯へ曲がる段の 2 つめ (p090-1 の x110..195 / y50..133) |
| `--corner-block-c` | `#3a4142` | チャンネルビューのブロックの角の混色。上の角の外側から 斜めの画素、帯へ曲がる段の 斜めの画素 (p090-1 の x110..195 / y50..133) |
| `--corner-block-band-top` | `#3a454a` | チャンネルビューのブロックの角の混色。上の角の外側から 帯の真上の画素、帯へ曲がる段の 帯の真上の画素 (p090-1 の x110..195 / y50..133) |
| `--corner-block-band-inner` | `#424952` | チャンネルビューのブロックの角の混色。上の角の外側から 段の内側、帯へ曲がる段の 段の内側 (p090-1 の x110..195 / y50..133) |
| `--corner-well-on-sunk` | `#191c19` | 値ボックスと窪みの角の混色: 沈んだセルの上の値ボックス (p090-1 の PAN の値ボックス、p067-1 のレベルの値ボックス、p079-2 のスロット、p090-1 のブロックの値、p047-1 のレベルの値) |
| `--corner-well-on-surface` | `#191c21` | 値ボックスと窪みの角の混色: 面の上の値ボックスとガラスの上の窪み (p090-1 の PAN の値ボックス、p067-1 のレベルの値ボックス、p079-2 のスロット、p090-1 のブロックの値、p047-1 のレベルの値) |
| `--corner-well-inner` | `#292d31` | 値ボックスと窪みの角の混色: 窪みの角の内側の画素 (p090-1 の PAN の値ボックス、p067-1 のレベルの値ボックス、p079-2 のスロット、p090-1 のブロックの値、p047-1 のレベルの値) |
| `--corner-panel-a` | `#101010` | INPUT のパネルの角の混色: 辺の行の外側の画素 (p100-1 のパネル x2..204 / y101..228) |
| `--corner-panel-b` | `#212429` | INPUT のパネルの角の混色: 外側から 2 つめの画素と斜めの画素 (p100-1) |
| `--corner-plot-a` | `#31393a` | グラフの枠の角の混色: 枠が曲がる画素 (p106-1 の EQ のグラフ x2..417 / y93..230、p099-1・p114-1 のグラフ) |
| `--corner-plot-b` | `#424d52` | グラフの枠の角の混色: 曲がり角の内側の画素 (p106-1、p099-1、p114-1) |
| `--corner-path-left` | `#31393a` | カードのパス欄の左の角の画素 (p084-1 のパス欄 x62..285 / y53..88 の x62 / y53) |
| `--corner-path-a` | `#3a454a` | カードのパス欄の右の角の混色: 辺の行の外側から 3 つめの画素 (p084-1 の x283 / y53) |
| `--corner-path-b` | `#424952` | 同、曲がり角の内側の画素 (p084-1 の x284 / y54) |
| `--corner-path-c` | `#293131` | 同、縦の辺の外側から 3 つめの画素 (p084-1 の x285 / y55) |
| `--corner-tray-a` | `#313131` | SETUP の GENERAL のトレイの角の混色: 辺の行と縦の辺の外側から 4 つめの画素 (p041-1 のトレイ x31..448 / y54..107 の x34 / y54) |
| `--corner-tray-b` | `#636163` | 同、外側から 5 つめの画素 (p041-1 の x35 / y54) |
| `--corner-tray-c` | `#080808` | 同、2 行目の外側から 2 つめの画素 (p041-1 の x32 / y55) |
| `--corner-tray-d` | `#6b696b` | 同、曲がり角の内側の 2 画素 (p041-1 の x33 / y55 と x32 / y56) |
| `--corner-block-well` | `#293131` | 値ボックスと窪みの角の混色: チャンネルビューのブロックの面の上の値 (p090-1 のブロックの値) |
| `--corner-level-well` | `#31393a` | 値ボックスと窪みの角の混色: HOME のストリップのレベルの値 (p047-1 のレベルの値) |
| `--corner-focus-on-sunk` | `#b51073` | フォーカス中の値ボックスの角で、枠の外側の混色 (沈んだセルの上、p115-1 の ms の x27 / y163) |
| `--corner-focus-on-sunken` | `#b50c73` | 同、INPUT の暗いパネルの上 (p100-1 の A.Gain の x35 / y161) |
| `--corner-focus-on-surface` | `#bd107b` | 同、面 (74,81,90) の上 (p090-1 の A.Gain の x14 / y77) |
| `--corner-focus-b` | `#ef0094` | 同、枠が曲がる内側の画素 (p090-1 の x13 / y78) |
| `--corner-focus-c` | `#ad1473` | 同、枠が塗りに接する混色 (p090-1 の x14 / y78) |
| `--corner-focus-d` | `#63244a` | 同、枠の内側の塗りの混色 (p090-1 の x15 / y78) |
| `--corner-raised-a` | `#212021` | 一段明るい面 (HOME のストリップの名前、MONITOR の見出し) の上の角の混色。外側から 1 つめ (p047-1 のストリップ 2 の x108..112 / y50..54、p067-1) |
| `--corner-raised-b` | `#42454a` | 同、2 つめ |
| `--corner-raised-c` | `#42494a` | 同、斜めの画素 |
| `--corner-oneknob-panel-a` | `#101418` | 1-knob のパネルのガラスの上の角の外側の混色 (p104-2 の x314 / y47) |
| `--corner-oneknob-panel-b` | `#292c31` | 同、その次の混色 (p104-2 の x315 / y47) |
| `--corner-oneknob-panel-c` | `#293031` | 同、斜めの画素 (p104-2 の x313 / y48) |
| `--corner-source-step-a` | `#4a595a` | MONITOR の [Source] の面が帯へ曲がる段の、両端の混色 (p068-1 の x8 / y148、x6 / y146) |
| `--corner-source-step-b` | `#526163` | 同、段の中の行の混色 (p068-1 の x7 / y147) |
| `--corner-data-a` | `#3a494a` | SSMCS の Sweet Spot Data のボタンの上の角の外側の混色 (p108-1 の x203 / y167) |
| `--corner-data-b` | `#4a595a` | 同、その次の混色と、段の上の面の最後の画素 (p108-1 の x204 / y167、x200 / y199) |
| `--corner-data-c` | `#52595a` | 同、斜めの画素 (p108-1 の x202 / y168) |
| `--corner-data-foot-a` | `#313d3a` | 同じボタンの帯の足の外側の混色 (p108-1 の x202 / y206) |
| `--corner-data-foot-b` | `#3a4142` | 同、その内側の混色 (p108-1 の x203 / y206) |
| `--corner-data-step-a` | `#4a5152` | 同じボタンの面が帯の段に接する混色 (p108-1 の x203 / y203) |
| `--corner-data-step-b` | `#525d63` | 同、段に沿う面の混色 (p108-1 の x204 / y203) |
| `--corner-data-step-c` | `#424d4a` | 同、段の上端の面の画素 (p108-1 の x200 / y200) |
| `--corner-mon-foot-a` | `#101419` | MONITOR のストリップの帯がガラスに接する角の混色。外側から 1 つめ (p067-1 の x2..6 / y264..268) |
| `--corner-mon-foot-b` | `#212831` | 同、2 つめ |
| `--corner-mon-foot-c` | `#212d31` | 同、斜めの画素 |
| `--corner-mon-band-top` | `#4a4d52` | 同、帯の真上で側面に残る面の画素 |
| `--corner-mon-band-mid` | `#3a494a` | 同、面が帯へ曲がる段の混色 |
| `--corner-badge-off-a` | `#63656b` | 消灯した処理ブロックの札の上の角、外側の混色 (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-off-b` | `#a5aaad` | 消灯した処理ブロックの札の上の角、2 つめ (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-off-c` | `#cecace` | 消灯した処理ブロックの札の上の角、3 つめ (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-off-d` | `#4a4d52` | 消灯した処理ブロックの札の帯の下の角、外側の混色 (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-off-e` | `#7b7d7b` | 消灯した処理ブロックの札の帯の下の角、2 つめ (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-off-f` | `#949694` | 消灯した処理ブロックの札の帯の下の角、3 つめ (p090-1 の INS FX x406..465 / y57..76) |
| `--badge-band-off` | `#9c9e9c` | 消灯した処理ブロックの札の下端 3px の帯 (p090-1 の INS FX x406..465 / y57..76) |
| `--corner-badge-gate-a` | `#6b594a` | 点灯した GATE と DUCKER の札の上の角、外側の混色 (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-gate-b` | `#c57131` | 点灯した GATE と DUCKER の札の上の角、2 つめ (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-gate-c` | `#f78229` | 点灯した GATE と DUCKER の札の上の角、3 つめ (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-gate-d` | `#52413a` | 点灯した GATE と DUCKER の札の帯の下の角、外側の混色 (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-gate-e` | `#945529` | 点灯した GATE と DUCKER の札の帯の下の角、2 つめ (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-gate-f` | `#b55d21` | 点灯した GATE と DUCKER の札の帯の下の角、3 つめ (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--badge-band-gate` | `#c56121` | 点灯した GATE と DUCKER の札の下端 3px の帯 (p090-1 の GATE x123..182、p098-1 の DUCKER) |
| `--corner-badge-comp-a` | `#634d52` | 点灯した COMP の札の上の角、外側の混色 (p090-1 の x218..277) |
| `--corner-badge-comp-b` | `#a54d3a` | 点灯した COMP の札の上の角、2 つめ (p090-1 の x218..277) |
| `--corner-badge-comp-c` | `#c54931` | 点灯した COMP の札の上の角、3 つめ (p090-1 の x218..277) |
| `--corner-badge-comp-d` | `#4a393a` | 点灯した COMP の札の帯の下の角、外側の混色 (p090-1 の x218..277) |
| `--corner-badge-comp-e` | `#7b3529` | 点灯した COMP の札の帯の下の角、2 つめ (p090-1 の x218..277) |
| `--corner-badge-comp-f` | `#943529` | 点灯した COMP の札の帯の下の角、3 つめ (p090-1 の x218..277) |
| `--badge-band-comp` | `#9c3929` | 点灯した COMP の札の下端 3px の帯 (p090-1 の x218..277) |
| `--corner-badge-eq-a` | `#42655a` | 点灯した EQ の札の上の角、外側の混色 (p090-1 の x312..371) |
| `--corner-badge-eq-b` | `#319e63` | 点灯した EQ の札の上の角、2 つめ (p090-1 の x312..371) |
| `--corner-badge-eq-c` | `#29be63` | 点灯した EQ の札の上の角、3 つめ (p090-1 の x312..371) |
| `--corner-badge-eq-d` | `#314d42` | 点灯した EQ の札の帯の下の角、外側の混色 (p090-1 の x312..371) |
| `--corner-badge-eq-e` | `#21794a` | 点灯した EQ の札の帯の下の角、2 つめ (p090-1 の x312..371) |
| `--corner-badge-eq-f` | `#218e52` | 点灯した EQ の札の帯の下の角、3 つめ (p090-1 の x312..371) |
| `--badge-band-eq` | `#219252` | 点灯した EQ の札の下端 3px の帯 (p090-1 の x312..371) |
| `--corner-badge-fx-a` | `#526973` | 点灯した DELAY と INS FX の札の上の角、外側の混色 (p098-2 の DELAY x406..465) |
| `--corner-badge-fx-b` | `#6baac5` | 点灯した DELAY と INS FX の札の上の角、2 つめ (p098-2 の DELAY x406..465) |
| `--corner-badge-fx-c` | `#7bcef7` | 点灯した DELAY と INS FX の札の上の角、3 つめ (p098-2 の DELAY x406..465) |
| `--corner-badge-fx-d` | `#3a4d5a` | 点灯した DELAY と INS FX の札の帯の下の角、外側の混色 (p098-2 の DELAY x406..465) |
| `--corner-badge-fx-e` | `#52829c` | 点灯した DELAY と INS FX の札の帯の下の角、2 つめ (p098-2 の DELAY x406..465) |
| `--corner-badge-fx-f` | `#5a9abd` | 点灯した DELAY と INS FX の札の帯の下の角、3 つめ (p098-2 の DELAY x406..465) |
| `--badge-band-fx` | `#63a2c5` | 点灯した DELAY と INS FX の札の下端 3px の帯 (p098-2 の DELAY x406..465) |
| `--corner-sendto-a` | `#080c10` | チャンネルビューの [SEND TO] の上の角、外側の混色 (p090-1 の x110..195 / y144..181) |
| `--corner-sendto-b` | `#31393a` | チャンネルビューの [SEND TO] の上の角、2 つめ (p090-1 の x110..195 / y144..181) |
| `--corner-sendto-c` | `#4a5152` | チャンネルビューの [SEND TO] の上の角、3 つめ (p090-1 の x110..195 / y144..181) |
| `--corner-sendto-d` | `#080808` | チャンネルビューの [SEND TO] の帯の下の角、外側の混色 (p090-1 の x110..195 / y144..181) |
| `--corner-sendto-e` | `#212829` | チャンネルビューの [SEND TO] の帯の下の角、2 つめ (p090-1 の x110..195 / y144..181) |
| `--corner-sendto-f` | `#31353a` | チャンネルビューの [SEND TO] の帯の下の角、3 つめ (p090-1 の x110..195 / y144..181) |
| `--corner-flag-a` | `#4a4d52` | INPUT のフラグの上の角、外側の混色 (p100-1 の x107..174 / y147..170) |
| `--corner-flag-b` | `#9c9ea5` | INPUT のフラグの上の角、2 つめ (p100-1 の x107..174 / y147..170) |
| `--corner-flag-c` | `#cec6ce` | INPUT のフラグの上の角、3 つめ (p100-1 の x107..174 / y147..170) |
| `--corner-flag-d` | `#3a3942` | INPUT のフラグの帯の下の角、外側の混色 (p100-1 の x107..174 / y147..170) |
| `--corner-flag-e` | `#737573` | INPUT のフラグの帯の下の角、2 つめ (p100-1 の x107..174 / y147..170) |
| `--corner-flag-f` | `#949694` | INPUT のフラグの帯の下の角、3 つめ (p100-1 の x107..174 / y147..170) |
| `--band-sends` | `#8c3119` | HOME の [Sends] タブの下端 3px の帯 (p045-1 の x422..479 / y50..106) |
| `--band-wizard` | `#a6a6a6` | モードウィザードのボタンの下端 3px の帯 |
| `--corner-eq-band-a` | `#213131` | EQ の帯の箱の上の角、外側の混色 (p106-1 の x2..56 / y49..86) |
| `--corner-eq-band-b` | `#8cbace` | EQ の帯の箱の上の角、2 つめ (p106-1 の x2..56 / y49..86) |
| `--corner-eq-band-d` | `#192021` | EQ の帯の箱の帯の下の角、外側の混色 (p106-1 の x2..56 / y49..86) |
| `--corner-eq-band-e` | `#638294` | EQ の帯の箱の帯の下の角、2 つめ (p106-1 の x2..56 / y49..86) |
| `--band-eq-band` | `#7ba2b5` | EQ の帯の箱の下端 3px の帯 (p106-1 の x2..56 / y49..86) |
| `--corner-oneknob-a` | `#080c10` | 消灯した [1-knob] の上の角、外側の混色 (p099-1 の x386..477 / y50..87) |
| `--corner-oneknob-b` | `#31353a` | 消灯した [1-knob] の上の角、2 つめ (p099-1 の x386..477 / y50..87) |
| `--corner-oneknob-c` | `#4a4d52` | 消灯した [1-knob] の上の角、3 つめ (p099-1 の x386..477 / y50..87) |
| `--corner-oneknob-in` | `#4a5152` | 消灯した [1-knob] の上の角の内側の画素 (p099-1 の x386..477 / y50..87) |
| `--corner-oneknob-lit-a` | `#395139` | 1-knob のパネルに立つ点灯した [1-knob] の角の外側の混色 (p104-2 の x387 / y50) |
| `--corner-oneknob-lit-b` | `#428239` | 同、その次の混色 (p104-2 の x388 / y50) |
| `--corner-oneknob-lit-c` | `#42a231` | 同、面に接する混色 (p104-2 の x389 / y50) |
| `--corner-oneknob-lit-in` | `#42a631` | 同、角の内側の画素 (p104-2 の x387 / y51) |
| `--corner-title-off-a1` | `#212421` | 消灯したタイトル札の上の角、外側の混色 (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-a2` | `#848284` | 消灯したタイトル札の上の角、2 つめ (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-a3` | `#bdbabd` | 消灯したタイトル札の上の角、3 つめ (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-in` | `#c5c2c5` | 消灯したタイトル札の上の角の内側の画素 (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-d1` | `#101410` | 消灯したタイトル札の帯の下の角、外側の混色 (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-d2` | `#424542` | 消灯したタイトル札の帯の下の角、2 つめ (p113-1 の x254..379 / y2..41) |
| `--corner-title-off-d3` | `#636563` | 消灯したタイトル札の帯の下の角、3 つめ (p113-1 の x254..379 / y2..41) |
| `--badge-title-band-off` | `#6b696b` | 消灯したタイトル札の下端 3px の帯 (p113-1 の x254..379 / y2..41) |
| `--corner-title-gate-a1` | `#291800` | 点灯した GATE と DUCKER のタイトル札の上の角、外側の混色 (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-a2` | `#a55519` | 点灯した GATE と DUCKER のタイトル札の上の角、2 つめ (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-a3` | `#ef7921` | 点灯した GATE と DUCKER のタイトル札の上の角、3 つめ (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-in` | `#f77d21` | 点灯した GATE と DUCKER のタイトル札の上の角の内側の画素 (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-d1` | `#191008` | 点灯した GATE と DUCKER のタイトル札の帯の下の角、外側の混色 (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-d2` | `#522d10` | 点灯した GATE と DUCKER のタイトル札の帯の下の角、2 つめ (p114-1 の x254..379 / y2..41) |
| `--corner-title-gate-d3` | `#7b4110` | 点灯した GATE と DUCKER のタイトル札の帯の下の角、3 つめ (p114-1 の x254..379 / y2..41) |
| `--badge-title-band-gate` | `#844519` | 点灯した GATE と DUCKER のタイトル札の下端 3px の帯 (p114-1 の x254..379 / y2..41) |
| `--corner-title-comp-a1` | `#3a1408` | 点灯した COMP のタイトル札の上の角、外側の混色 (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-a2` | `#8c3121` | 点灯した COMP のタイトル札の上の角、2 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-a3` | `#c54529` | 点灯した COMP のタイトル札の上の角、3 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-in` | `#c54529` | 点灯した COMP のタイトル札の上の角の内側の画素 — 図に無く、同じ図の最も近い混色 (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-d1` | `#190c08` | 点灯した COMP のタイトル札の帯の下の角、外側の混色 (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-d2` | `#4a1c10` | 点灯した COMP のタイトル札の帯の下の角、2 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-d3` | `#6b2819` | 点灯した COMP のタイトル札の帯の下の角、3 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-fin` | `#6b2821` | 点灯した COMP のタイトル札の帯の下の角の内側の画素 (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-b1` | `#311008` | 点灯した COMP のタイトル札の上の角を縦に下る 1 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-e2` | `#4a1810` | 点灯した COMP のタイトル札の同 2 つめ (p099-1 の x254..369 / y2..41) |
| `--corner-title-comp-e3` | `#632419` | 点灯した COMP のタイトル札の同 3 つめ (p099-1 の x254..369 / y2..41) |
| `--badge-title-band-comp` | `#6b2821` | 点灯した COMP のタイトル札の下端 3px の帯 (p099-1 の x254..369 / y2..41) |
| `--corner-title-eq-a1` | `#000400` | 点灯した EQ のタイトル札の上の角、外側の混色 (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-a2` | `#106d3a` | 点灯した EQ のタイトル札の上の角、2 つめ (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-a3` | `#21b663` | 点灯した EQ のタイトル札の上の角、3 つめ (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-in` | `#21b663` | 点灯した EQ のタイトル札の上の角の内側の画素 (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-d1` | `#000400` | 点灯した EQ のタイトル札の帯の下の角、外側の混色 — 図に無く、同じ図の最も近い混色 (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-d2` | `#105529` | 点灯した EQ のタイトル札の帯の下の角、2 つめ — 図に無く、同じ図の最も近い混色 (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-d3` | `#106d3a` | 点灯した EQ のタイトル札の帯の下の角、3 つめ — 図に無く、同じ図の最も近い混色 (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-b2` | `#105529` | 点灯した EQ のタイトル札の同 2 つめ (p106-1 の x254..369 / y2..41) |
| `--corner-title-eq-b3` | `#21aa5a` | 点灯した EQ のタイトル札の同 3 つめ (p106-1 の x254..369 / y2..41) |
| `--badge-title-band-eq` | `#317529` | 点灯した EQ のタイトル札の下端 3px の帯 (p106-1 の x254..369 / y2..41) |
| `--corner-title-fx-a1` | `#192429` | 点灯した DELAY・INS FX・SSMCS のタイトル札の上の角、外側の混色 (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-a2` | `#528aa5` | 点灯した DELAY・INS FX・SSMCS のタイトル札の上の角、2 つめ (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-a3` | `#7bc6ef` | 点灯した DELAY・INS FX・SSMCS のタイトル札の上の角、3 つめ (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-in` | `#7bcef7` | 点灯した DELAY・INS FX・SSMCS のタイトル札の上の角の内側の画素 (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-d1` | `#081419` | 点灯した DELAY・INS FX・SSMCS のタイトル札の帯の下の角、外側の混色 (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-d2` | `#294952` | 点灯した DELAY・INS FX・SSMCS のタイトル札の帯の下の角、2 つめ (p115-1 の x254..379 / y2..41) |
| `--corner-title-fx-d3` | `#3a697b` | 点灯した DELAY・INS FX・SSMCS のタイトル札の帯の下の角、3 つめ (p115-1 の x254..379 / y2..41) |
| `--badge-title-band-fx` | `#426d84` | 点灯した DELAY・INS FX・SSMCS のタイトル札の下端 3px の帯 (p115-1 の x254..379 / y2..41) |
| `--ssmcs-switch-eq` | `#4aaa31` | SSMCS の画面の点灯した [EQ] の面。処理ブロックの EQ の点灯色より暗い (p112-1 の x2..94 / y49..86) |
| `--ssmcs-switch-eq-band` | `#295519` | SSMCS の画面の点灯した [EQ] の下端 3px の帯 (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-a1` | `#081c08` | SSMCS の画面の点灯した [EQ] の上の角、外側の混色 (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-a2` | `#296921` | SSMCS の画面の点灯した [EQ] の上の角、2 つめ (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-a3` | `#429e29` | SSMCS の画面の点灯した [EQ] の上の角、3 つめ (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-in` | `#42a229` | SSMCS の画面の点灯した [EQ] の上の角の内側の画素 (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-d1` | `#081000` | SSMCS の画面の点灯した [EQ] の帯の下の角、外側の混色 (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-d2` | `#193510` | SSMCS の画面の点灯した [EQ] の帯の下の角、2 つめ (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-d3` | `#194d10` | SSMCS の画面の点灯した [EQ] の帯の下の角、3 つめ (p112-1 の x2..94 / y49..86) |
| `--corner-ssmcs-eq-fin` | `#214d10` | SSMCS の画面の点灯した [EQ] の帯の下の角の内側の画素 (p112-1 の x2..94 / y49..86) |
| `--ssmcs-switch-comp-band` | `#6b2419` | SSMCS の画面の点灯した [Comp] の下端 3px の帯 (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-a1` | `#210c08` | SSMCS の画面の点灯した [Comp] の上の角、外側の混色 (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-a2` | `#842d19` | SSMCS の画面の点灯した [Comp] の上の角、2 つめ (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-a3` | `#bd4129` | SSMCS の画面の点灯した [Comp] の上の角、3 つめ (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-in` | `#c54529` | SSMCS の画面の点灯した [Comp] の上の角の内側の画素 (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-d1` | `#100400` | SSMCS の画面の点灯した [Comp] の帯の下の角、外側の混色 (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-d2` | `#421408` | SSMCS の画面の点灯した [Comp] の帯の下の角、2 つめ (p110-1 の x2..94 / y49..86) |
| `--corner-ssmcs-comp-d3` | `#5a2010` | SSMCS の画面の点灯した [Comp] の帯の下の角、3 つめ (p110-1 の x2..94 / y49..86) |
| `--corner-toggle-1` | `#293131` | 右下のノブ切り替えボタンの左上の角の混色 1。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-2` | `#525563` | 右下のノブ切り替えボタンの左上の角の混色 2。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-3` | `#101819` | 右下のノブ切り替えボタンの左上の角の混色 3。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-4` | `#5a5d6b` | 右下のノブ切り替えボタンの左上の角の混色 4。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-5` | `#636973` | 右下のノブ切り替えボタンの左上の角の混色 5。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-6` | `#4a4d52` | 右下のノブ切り替えボタンの左上の角の混色 6。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-1` | `#524563` | 右下のノブ切り替えボタンの左上の角の混色 lit-1。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-2` | `#9c82b5` | 右下のノブ切り替えボタンの左上の角の混色 lit-2。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-3` | `#ceaaef` | 右下のノブ切り替えボタンの左上の角の混色 lit-3。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-4` | `#211c31` | 右下のノブ切り替えボタンの左上の角の混色 lit-4。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-5` | `#ad8ece` | 右下のノブ切り替えボタンの左上の角の混色 lit-5。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-6` | `#c5a2e6` | 右下のノブ切り替えボタンの左上の角の混色 lit-6。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-7` | `#8461ad` | 右下のノブ切り替えボタンの左上の角の混色 lit-7。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-8` | `#734994` | 右下のノブ切り替えボタンの左上の角の混色 lit-8。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-toggle-lit-9` | `#6b418c` | 右下のノブ切り替えボタンの左上の角の混色 lit-9。lit はUSER DEFINED KNOBS のあいだ (p045-1 の x428..433 / y233..238、p038-4) |
| `--corner-readout-0` | `#080c08` | ノブ読み出しバーの上の角の混色 0。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-1` | `#4a494a` | ノブ読み出しバーの上の角の混色 1。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-2` | `#949294` | ノブ読み出しバーの上の角の混色 2。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-3` | `#9c9ea5` | ノブ読み出しバーの上の角の混色 3。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-4` | `#73757b` | ノブ読み出しバーの上の角の混色 4。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-5` | `#4a4d52` | ノブ読み出しバーの上の角の混色 5。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-0` | `#525563` | ノブ読み出しバーの上の角の混色 udk-0。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-1` | `#7b718c` | ノブ読み出しバーの上の角の混色 udk-1。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-2` | `#ad96c5` | ノブ読み出しバーの上の角の混色 udk-2。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-3` | `#b59ace` | ノブ読み出しバーの上の角の混色 udk-3。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-4` | `#8461a5` | ノブ読み出しバーの上の角の混色 udk-4。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-5` | `#5a3d84` | ノブ読み出しバーの上の角の混色 udk-5。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-right-0` | `#080808` | ノブ読み出しバーの上の角の混色 right-0。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-right-1` | `#4a4152` | ノブ読み出しバーの上の角の混色 right-1。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-right-3` | `#a58abd` | ノブ読み出しバーの上の角の混色 right-3。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-readout-udk-right-4` | `#9482ad` | ノブ読み出しバーの上の角の混色 right-4。udk は USER DEFINED KNOBS のバー、right はその右の角 (p056-1 の x2..6 / y233..237、p038-4) |
| `--corner-switch-a` | `#73757b` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、上の角の 1 段目 |
| `--corner-switch-b` | `#b5b6b5` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、上の角の 2 段目 |
| `--corner-switch-c` | `#cecece` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、上の角の 3 段目 |
| `--corner-switch-band` | `#9c969c` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、帯の色 |
| `--corner-switch-band-a` | `#a5a2a5` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、面が帯に接する角の 1 段目 |
| `--corner-switch-band-b` | `#c5bec5` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、同 2 段目 |
| `--corner-switch-band-c` | `#cecece` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、同 3 段目 |
| `--corner-switch-foot-a` | `#525d63` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、帯が地に接する角の 1 段目 |
| `--corner-switch-foot-b` | `#7b7d84` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、同 2 段目 |
| `--corner-switch-foot-c` | `#949294` | 面 (74,81,90) に立つ、消灯した [ON] / [CUE] / [PRE] (p047-1)の、同 3 段目 |
| `--corner-switch-glass-a` | `#424142` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 1 段目 |
| `--corner-switch-glass-b` | `#adaead` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 2 段目 |
| `--corner-switch-glass-c` | `#cecece` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 3 段目 |
| `--corner-switch-glass-foot-a` | `#191c19` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、帯が地に接する角の 1 段目 |
| `--corner-switch-glass-foot-b` | `#6b656b` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、同 2 段目 |
| `--corner-switch-glass-foot-c` | `#948e94` | ガラスに立つ、消灯したスイッチ (p090-1 のチャンネルビュー)の、同 3 段目 |
| `--corner-switch-lit-a` | `#52798c` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、上の角の 1 段目 |
| `--corner-switch-lit-b` | `#73c6e6` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、上の角の 2 段目 |
| `--corner-switch-lit-c` | `#84dfff` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、上の角の 3 段目 |
| `--corner-switch-lit-band-a` | `#6bb2ce` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、面が帯に接する角の 1 段目 |
| `--corner-switch-lit-band-b` | `#7bceef` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、同 2 段目 |
| `--corner-switch-lit-band-c` | `#84dfff` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、同 3 段目 |
| `--corner-switch-lit-foot-a` | `#4a5d6b` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、帯が地に接する角の 1 段目 |
| `--corner-switch-lit-foot-b` | `#5a8a9c` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、同 2 段目 |
| `--corner-switch-lit-foot-c` | `#63a2b5` | 面 (74,81,90) に立つ、点灯したスイッチ (p047-1)の、同 3 段目 |
| `--corner-switch-lit-glass-a` | `#294952` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 1 段目 |
| `--corner-switch-lit-glass-b` | `#6bbede` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 2 段目 |
| `--corner-switch-lit-glass-c` | `#84dfff` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、上の角の 3 段目 |
| `--corner-switch-lit-glass-foot-a` | `#101c21` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、帯が地に接する角の 1 段目 |
| `--corner-switch-lit-glass-foot-b` | `#42717b` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、同 2 段目 |
| `--corner-switch-lit-glass-foot-c` | `#639eb5` | ガラスに立つ、点灯したスイッチ (p090-1 のチャンネルビュー)の、同 3 段目 |
| `--corner-switch-sunk-a` | `#606366` | OSCILLATOR の沈んだパネルに立つ、消灯したスイッチの上の角の 1 段目。`--corner-switch-a` から、その画素を面が覆う割合で移した値 |
| `--corner-switch-sunk-b` | `#b0acb2` | 同 2 段目 (同じ方法で移した値) |
| `--corner-switch-sunk-c` | `#cfc8d0` | 同 3 段目 (同じ方法で移した値) |
| `--corner-switch-sunk-foot-a` | `#404647` | その足の角の 1 段目 (同じ方法で移した値) |
| `--corner-switch-sunk-foot-b` | `#747377` | 同 2 段目 (同じ方法で移した値) |
| `--corner-switch-sunk-foot-c` | `#928d93` | 同 3 段目 (同じ方法で移した値) |
| `--corner-switch-lit-sunk-a` | `#4a6d73` | OSCILLATOR の沈んだパネルに立つ、点灯したスイッチの上の角の 1 段目 (p070-1 の x351 / y99) |
| `--corner-switch-lit-sunk-b` | `#73c2de` | 同 2 段目 (p070-1 の x352 / y99) |
| `--corner-switch-lit-sunk-c` | `#84dfff` | 同 3 段目 (p070-1 の x353 / y99) |
| `--corner-switch-lit-sunk-foot-a` | `#3a4d52` | その足の角の 1 段目 (p070-1 の x351 / y138) |
| `--corner-switch-lit-sunk-foot-b` | `#528294` | 同 2 段目 (p070-1 の x352 / y138) |
| `--corner-switch-lit-sunk-foot-c` | `#63a2b5` | 同 3 段目 (p070-1 の x353 / y138) |
| `--corner-track-dark` | `#101010` | RECORDER の進捗バーの両端 (p079-2・p081-1)の、半円の最も暗い画素 |
| `--corner-track-mid` | `#212429` | RECORDER の進捗バーの両端 (p079-2・p081-1)の、半円の中間の画素 |
| `--corner-played-dark` | `#101819` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、半円の最も暗い画素 |
| `--corner-played-mid` | `#21557b` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、半円の中間の画素 |
| `--corner-played-inner` | `#215d94` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、上の角の内側の画素 |
| `--corner-played-end-light` | `#2179c5` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、トレーに接する右端の明るい画素 |
| `--corner-played-end-dark` | `#29557b` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、同、暗い画素 |
| `--corner-played-end-inner` | `#2182ce` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、同、内側の画素 |
| `--corner-played-end-track` | `#293542` | RECORDER の進捗バーの再生済みの部分の両端 (p081-1)の、同、トレー寄りの画素 |
| `--strip-bevel` | `#313942` | MONITOR のバスカードの下端 3px (p067-1 の x5..96 / y266..268) |
| `--switch-band` | `#9c969c` | 消灯した [ON] / [CUE] / [PRE] スイッチの下端 4px (p047-1 の CUE、x73 / y204..207) |
| `--switch-band-lit` | `#6ba6bd` | 点灯した [ON] / [CUE] / [PRE] スイッチの下端 4px (p036-1・p047-1 の x20 / y204..207、p067-1 の x50 / y210..213) |
| `--mon-toggle-off` | `#cecace` | 消灯している MONITOR の [CUE Interrupt] / [MONO] の面 (p068-1 のバス 2 の MONO、x126..176 / y214..250) |
| `--mon-toggle-off-band` | `#948e94` | 同、下端 3px (p068-1 の x126..176 / y251..253) |
| `--mon-toggle-off-ink` | `#3a3d3a` | 同、名前の文字 (p068-1 の x139..175 / y228..236) |
| `--toggle-band-lit` | `#5a9eb5` | 点灯したトグル (`.btn-toggle`) と言語ボタンの下端 3px (p068-1 の MONITOR バス 1 の MONO、x20..70 / y251..253。p057-1 の x80 / y81..83、p058-1 と p061-1 の x100 / y151..153、p055-1 の x200 / y155..157) |
| `--toolbar-sep` | `#5a5d6b` | 戻る矢印と HOME の間の 2px の線 (p067-1 の x431..432 / y10..31) |
| `--chip-mark` | `#848a8c` | チャンネル名の右上の複製マーク (p094-1) |
| `--toolbar-edge` | `#6b6d7b` | アイコン列の帯の左と下に沿う 2px の罫 (p099-1 の x384..385 / y40..41) |
| `--toolbar-sep-home` | `#737584` | HOME とチャンネルビューのアイコン列で、HOME の手前に立つ 1px の線 (p045-1 と p047-1 の x431 / y10..31) |
| `--toolbar-sep-end` | `#52515a` | `--toolbar-sep` の線の 1 行上と 1 行下 (p067-1 の x431..432 / y9 と y32) |
| `--toolbar-corner-outer` | `#525563` | アイコン列の帯の左下の角で、罫の曲がり目のすぐ外側の画素 (p047-1 の x295 / y37、x299 / y41) |
| `--toolbar-corner-fade` | `#293131` | そのさらに外側 (p047-1 の x295 / y38、x298 / y41) |
| `--toolbar-corner-step` | `#5a5d6b` | 曲がり目の段 (p047-1 の x296 / y39、x297 / y40) |
| `--toolbar-corner-dark` | `#101819` | 段の外側 (p047-1 の x296 / y40) |
| `--toolbar-corner-inner` | `#52555a` | 罫の内側で面に接する画素 (p047-1 の x297 / y37、x299 / y39) |
| `--toolbar-corner-inner-fade` | `#4a4d52` | そのさらに内側 (p047-1 の x297 / y36、x300 / y39) |
| `--sheet-back-corner-outer` | `#848a8c` | シートの戻るボタンの左下の角で、シートの地に接する外側の画素 (p100-2 の x389 / y54、x392 / y57) |
| `--sheet-back-corner-step` | `#636973` | 曲がり目の段 (p100-2 の x391 / y54、x390 / y55、x392 / y55、x391 / y56) |
| `--sheet-back-corner-light` | `#a5a6a5` | 段の外側 (p100-2 の x390 / y56) |
| `--sheet-back-corner-inner` | `#52555a` | 罫の内側で面に接する画素 (p100-2 の x391 / y53、x393 / y55) |
| `--sheet-back-corner-inner-fade` | `#4a4952` | そのさらに内側 (p100-2 の x391 / y52、x392 / y54) |
| `--sheet-back-corner-inner-soft` | `#4a4d52` | 段の内側の端 (p100-2 の x394 / y55) |
| `--sheet-back-top-corner-inner` | `#3a454a` | シートの戻るボタンの右上の角で、面に近い画素 (p100-2 の x444 / y16、x446 / y18) |
| `--sheet-back-top-corner-outer` | `#212d31` | 同、外側の画素 (p100-2 の x445 / y16、x446 / y17)。角そのものの画素 (x446 / y16) は後ろの画面 |
| `--radius-sm` | `2px` | ツールバーのバンクボタンのセルなど、小さな部品の角 (p045-1 の点灯セルの左上 x150 / y20。角の行ごとの欠けを四分円に当てると半径 2)。HOME ストリップのインジケーター枠の角はこの値ではなく画素で描く (`--surface-inset-corner`) |
| `--radius-md` | `4px` | ボタン・ドロップダウン・シーン名の箱の丸めた角 (p099-1 の COMP の箱 x254 / y2 と Off のドロップダウン x306 / y49、p045-1 のシーン名の箱 x2 / y2・[Sends] ボタン x422 / y50 の左上。四分円に当てるとどれも半径 4)。値ボックス・窪み・沈んだセルの角はこの値ではなく画素で描く (screen-inventory.md の「ボタンの角」) |
| `--radius-strip` | `6px` | 選ばれた HOME ストリップの角。枠が曲線で回るので丸めた箱のまま (p045-1 のストリップ 3 の右上 x311 / y50。四分円に当てると半径 6)。選ばれていないストリップは画素で描く |
| `--radius-lg` | `6px` | 画面の縁に沿う帯の角。ツールバーのアイコン列の帯の左下 (p099-1 の x384 / y41、p045-1 の x295 / y41)。四分円に当てると半径 6。ノブ読み出しバーとチャンネルビューのパネルの角は画素で描く |
| `--scrim` | `#000000ce` | 画面に重なるシートが下の画面に落とす暗幕の、backdrop-filter を持たないブラウザでの色。backdrop-filter を持つブラウザは下の画素を R 0.204 / G 0.202 / B 0.192 倍して R・B を 32 段、G を 64 段に丸める SVG フィルター (`src/ui/scrim.ts`) で暗くする。係数は p100-2・p060-2・p051-1 の暗くなった画素に当てはめたもの |
| `--sheet-shadow-near` | `#000000b8` | シートが右と下に落とす影の、外側 1px 目 (2px ずらしの影と重なって 0.82 暗くなる。p100-2・p060-2) |
| `--sheet-shadow-far` | `#00000059` | 同、外側 2px 目 (0.35 暗くなる)。左と上には影が無い |
| `--page-arrow` | `#ffffff7a` | SSMCS の画面を送る丸ボタンの面。下の画素を透かす (p108-1 の x386..421 / y117..152。黒の上で 123、`--graph-bg` の上で 140、`--surface` の上で 165 に読める白の不透明度 0.48) |
| `--block-gate` | `#ff8629` | GATE バッジ (p090-1)。作動中の Clip Safe の [Clip Safe] と [SAFE] も、面・角・帯を点灯した GATE と同じにする (操作者の指定) |
| `--block-comp` | `#ce4931` | COMP バッジ (p090-1) |
| `--block-eq` | `#29c26b` | EQ バッジ (p090-1) |
| `--block-ducker` | `#ff8629` | DUCKER バッジ (p098-1 の x405..464 / y57..73)、DUCKER 画面の [DUCKER] ボタン (p114-1 の x254..379 / y2..38) |
| `--block-delay` | `#84dfff` | HOME のインジケーター行で点いた DELAY の名前。点いた状態の図は無い |
| `--block-fx` | `#84d7ff` | 点灯した INS FX / DELAY のボタン (p098-2 の DELAY、x406..465 / y57..73)、SSMCS のタイトル札 (p108-1) と SSMCS の [Side Chain] (p111-1 の x251..417 / y50..89)・EQ のバンドのボタン (p112-1 の x107..199 / y49..86)、HOME のストリップの INS FX の印 (操作者の指定。p090-1 の図はここを淡い灰で描くが、実機はボタンと同じ色)。チャンネルビューで点灯した INS FX のボタンは図に例が無い |
| `--badge-off` | `#d6ced6` | 消灯したブロックのボタン (p090-1 と p094-1 の INS FX、x406..465 / y57..73) |
| `--badge-title-off` | `#cecace` | 消灯したブロックのツールバーの名前の箱 (p113-1 の INS FX、x255..378 / y3..38) |
| `--lamp-on` | `#42d763` | GATE / DUCKER のランプ。信号に手を付けていないとき (p094-1 の GATE) |
| `--lamp-hold` | `#f7f73a` | GATE / DUCKER のランプ。途中まで絞っているとき (p098-1 の DUCKER) |
| `--lamp-shut` | `#de5152` | GATE / DUCKER のランプ。RANGE まで絞りきったとき (p95 / p98) |
| `--meter-green` | `#3aeb73` | メーターの緑帯 |
| `--meter-yellow` | `#fffb42` | メーターのバーの上半分 |
| `--meter-red` | `#de5152` | HOME ストリップのクリップランプと、チャンネルビューの COMP ブロックのリダクション表示の点灯 |
| `--transport-rec` | `#ff696b` | レコーダーの [●] の丸 (p079-1 の x383..392 / y246..255)、録音を中断中の一時停止の 2 本の棒、録音モードのあいだ microSD アイコンと microSD トップの [Recorder] に出す丸 |
| `--transport-play` | `#31eb73` | レコーダーの再生の三角 (p079-2 の x322..332 / y243..256)。操作説明の [Play/Pause] の図も同じ色 |
| `--progress-played` | `#2196f7` | RECORDER の Play タブの進捗バーの再生済みの部分 (p081-1) |
| `--meter-track` | `#292d31` | メーターの消灯部とクリップ表示 (p036-1 の x87 / y99..128) |
| `--meter-track-wide` | `#4a4d5a` | 太いメーターの消灯部。ダイナミクス画面の IN / OUT とリダクションバー (p099-1)、HOME の STEREO/CUE メーター (p045-1) |
| `--meter-track-input` | `#101010` | INPUT 画面のヘッドアンプメーターの消灯部 (p100-1) |
| `--meter-end-outer` | `#3a454a` | パネル上のメーターの、消灯部の端の行の角 (p036-1 の x86 / y98) |
| `--meter-end-inner` | `#293131` | その内側と、次の行の両脇 (p036-1 の x87 / y98、x86 / y99) |
| `--meter-lit-outer` | `#31514a` | 緑に点いたバーの下端の行の角 (p036-1 の x86 / y160) |
| `--meter-lit-inner` | `#31ce7b` | その内側と、上の行の両脇 (p036-1 の x87 / y160、x86 / y159) |
| `--meter-top-outer` | `#313129` | 上端まで点いた 4px のバーの端の行の角。パネル上のメーターの図は無く、RECORDER の図の値を使う (p079-2 の x394 / y175) |
| `--meter-top-inner` | `#c5d752` | その内側と、次の行の両脇 (p079-2 の x395 / y175、x397 / y176) |
| `--meter-wide-end-outer` | `#212429` | 黒地の 6px のメーターの、消灯部の端の行の角と次の行の両脇 (p047-1 の x442 / y149、x441 / y150) |
| `--meter-wide-end-inner` | `#424552` | その内側と、その次の行の両脇 (p047-1 の x443 / y149、x441 / y151) |
| `--meter-wide-lit-outer` | `#215d4a` | 緑に点いた 6px のバーの下端の行の角と上の行の両脇 (p047-1 の x442 / y219、x441 / y218) |
| `--meter-wide-lit-inner` | `#31db7b` | その内側と、その上の行の両脇 (p047-1 の x443 / y219、x441 / y217) |
| `--meter-wide-top-outer` | `#526142` | 上端まで点いた 6px のバーの端の行の角と次の行の両脇 (p106-1 の x459 / y127、x458 / y128) |
| `--meter-wide-top-inner` | `#deeb52` | その内側と、その次の行の両脇 (p106-1 の x460 / y127、x458 / y129) |
| `--meter-card-end-outer` | `#212021` | `--surface-sunken` の上のメーター (RECORDER と INPUT) の、消灯部の端の行の角 (p079-2 の x88 / y85、p100-1 の x188 / y152) |
| `--meter-card-end-inner` | `#000400` | RECORDER のメーターのその内側と、次の行の両脇 (p079-2 の x89 / y85、x88 / y86) |
| `--meter-card-lit-outer` | `#213121` | RECORDER の緑に点いたバーの下端の行の角 (p079-2 の x394 / y223) |
| `--meter-card-lit-inner` | `#29ca7b` | その内側と、上の行の両脇 (p079-2 の x395 / y223、x394 / y222) |
| `--meter-input-lit-outer` | `#215942` | INPUT のメーターの、緑に点いたバーの下端の行の角と上の行の両脇 (p100-1 の x188 / y222、x187 / y221) |
| `--meter-sunk-end-outer` | `#293131` | OSC のメーター (`--surface-sunk` の上) の、消灯部の端の行の角と次の行の両脇 (p070-1 の x407 / y153、x406 / y154) |
| `--meter-sunk-lit-outer` | `#21614a` | OSC の緑に点いたバーの下端の行の左の角 (p070-1 の x407 / y227) |
| `--meter-sunk-lit-side` | `#216552` | その上の行の左端 (p070-1 の x406 / y226) |
| `--meter-sunk-lit-right` | `#195542` | 下端の行の右の角とその上の行の右端。右隣はパネルの角の黒 (p070-1 の x410 / y227、x411 / y226) |
| `--meter-level-outer` | `#63825a` | パネル上のメーターで、バーの上端より下で点灯が始まる行の角。黄に点いた行 (p047-1 の x86 / y116)。RECORDER のメーターもこの値を使う |
| `--meter-level-inner` | `#deeb52` | その内側と、次の行の両脇 (p047-1 の x87 / y116、x86 / y117)。RECORDER のメーターもこの値を使う。RECORDER のメーターで黄に点き始める行は図に例が無い |
| `--meter-level-green-outer` | `#217d6b` | 同、緑に点いた行の角 (p036-1 の x192 / y130)。RECORDER のメーターもこの値を使う |
| `--meter-level-green-inner` | `#31db7b` | その内側と、次の行の両脇 (p036-1 の x193 / y130、x192 / y131)。RECORDER のメーターもこの値を使う。RECORDER のメーターで緑に点き始める行は図に例が無い |
| `--meter-wide-level-outer` | `#94b673` | 黒地の 6px のメーターで点灯が始まる行の角と、次の行の両脇。黄に点いた行 (p099-1 の x431 / y156、x430 / y157)。角の外側はバーの消灯部の色 (p099-1 の x430 / y156) |
| `--meter-wide-level-inner` | `#eff34a` | その内側と、その次の行の両脇 (p099-1 の x432 / y156、x430 / y158)。INPUT のメーターも同じ値 (p100-1 の x189 / y157、x187 / y159) |
| `--meter-wide-level-green-outer` | `#31ae8c` | 同、緑に点いた行 (p037-1 の x8 / y182、x7 / y183) |
| `--meter-wide-level-green-inner` | `#31e373` | その内側と、その次の行の両脇 (p037-1 の x9 / y182、x7 / y184)。OSC のメーターも同じ値 (p070-1 の x408 / y171、x406 / y173) |
| `--meter-input-level-outer` | `#8ca663` | INPUT のメーターで点灯が始まる行の角と、次の行の両脇。黄に点いた行 (p100-1 の x188 / y157、x187 / y158) |
| `--meter-input-level-green-outer` | `#299e7c` | 同、緑に点いた行。図に例が無く、`--meter-wide-level-green-outer` に、黄の行で INPUT と黒地の 6px が違う分 (-8,-16,-16) を足した値 |
| `--meter-sunk-level-outer` | `#8cae6b` | OSC のメーターで点灯が始まる行の角と次の行の両脇、黄に点いた行。図に例が無く、`--meter-wide-level-outer` に、緑の行で OSC と黒地の 6px が違う分 (-8,-8,-8) を足した値 |
| `--meter-sunk-level-green-outer` | `#29a684` | 同、緑に点いた行 (p070-1 の x407 / y171、x406 / y172) |
| `--meter-clip-lit` | `#f73d3a` | 点いたクリップ点の面 (p106-1 の x460 / y120) |
| `--meter-clip-outer` | `#7b1c19` | その角。4px のクリップ点も同じ値を使う (p106-1 の x459 / y118) |
| `--meter-clip-inner` | `#e63931` | その内側 (p106-1 の x460 / y118) |
| `--gain-reduction` | `#ff8229` | ダイナミクス画面のゲインリダクションバーの面 (p099-1 の x230 / y121) |
| `--gain-reduction-outer` | `#3a2d29` | その上端の行の角と次の行の両脇 (p099-1 の x229 / y118、x228 / y119) |
| `--gain-reduction-inner` | `#d67529` | その内側と、その次の行の両脇 (p099-1 の x230 / y118、x228 / y120) |

## チャンネルカラー

CH SETTING で変更できるチャンネル色。色そのものは p045-1 と p048-4 のストリップ下端の
レールから採った。工場出荷時はモノ・ステレオ・FX の全入力が blue、MIX と STREAMING が
orange、STEREO が red で、残りは CH SETTING で選べる候補。

| 色 | 値 | 工場出荷時の割り当て |
| --- | --- | --- |
| blue | `#1965ff` | 全入力チャンネル、FX 1-2 |
| orange | `#ff8200` | MIX 1-2、STREAMING |
| red | `#ce4529` | STEREO |
| yellow | `#e6e710` | (候補のみ) |
| pink | `#ff499c` | (候補のみ) |

使えないチャンネルのレールは色の代わりに濃いグレーになる。値は `--strip-rail-shut` `#393a3e`。
色そのものではなく、同じ図の中のレールと面の比から求めた (画面の写真は表示プロファイルが掛かる
ため、絶対値では突き合わせられない)。

## ストリップのロータリー

値を示す円弧のトラックは、中心線の半径が図形の半分より 1.75px 内側 (38px の図形で 17.25px)、ダイヤルは図形の 62% の円
(`inset: 19%`)。指標はダイヤルの中心より 1px 下を軸に回る。

トラックと指標は 12 時方向から左右に 150 度ずつ回り、下端に 60 度の切れ目を残す。最小値の図 (p069-1 の PHONES 0.0、
p063-1 の Time 2、p094-6 の A.Gain -8) は -150 度、最大値の図 (p056-1 の Brightness 10) は +150 度。DELAY の時間の
つまみ (ms・frame などの 4 つ) は左右に 135 度ずつで、トラックも同じ長さになり、1 ms が -135 度、1000 ms が +135 度 (p115-1)。

値と向きの対応:

| つまみ | 対応 |
| --- | --- |
| フェーダー (チャンネル・MONITOR・Sends のレベル) | -40 dB が 9 時方向、0.00 dB が 3 時方向。目盛りは下端が粗く 0 dB 付近が細かい 40 段 + OFF (-∞) の 1 段で、下端まで回し切ったところがちょうど -∞ |
| A.Gain | +8 dB が 9 時方向、+55 dB が 3 時方向を通る直線 |
| A.Gain (HI-Z 入) | -8 dB が始点、+40 dB が終点を結ぶ直線 (終点は操作者の指定) |
| D.Gain | -14 dB が 9 時方向、+15 dB が 3 時方向を通る直線 |
| PHONES | 2.0 が 9 時方向、8.0 が 3 時方向を通る直線 |
| OSCILLATOR の Level | -96 dB が始点、-50 dB が 9 時方向、-8 dB が 3 時方向、0 dB が終点を結ぶ折れ線 |
| 周波数 (HPF・EQ・OSCILLATOR の Frequency) | min-max の対数 |
| スレッショルド・EQ ゲイン・PAN・Brightness・DELAY の時間など | min-max の線形 |

## 画面の外側

`--frame` (`#1c1f24`) と `--frame-edge` (`#2b2f36`) は画面を載せる枠の色。実機から採ったものでは
なく、ページの地 (`#14161a`) に対して選んだシミュレーター自身の値。実機の筐体・ノブは再現しない。

`--scale` (`2`) は画面を画面ピクセルの何倍で描くかを決めるシミュレーター自身の値で、実機から採ったものではない。`.lcd-frame` の幅と高さ、`.lcd` の `transform: scale()`、画面の上と下に置くシミュレーターの欄 (`.chrome` / `.chrome-foot`) の幅がこの値を使い、値を持つのは `src/style/tokens.css` だけ。表示倍率のセレクタと `?zoom=` が与える `--zoom` は、`.lcd` の `transform: scale()` と `.lcd-frame` の幅と高さで `--scale` に掛かり、`--scale` の値は変えない ([architecture.md](architecture.md) の「座標系」)。

## 書体

実機は大文字 I にセリフの付いた、小さめのヒューマニストサンセリフを使っている。`--font` は同じく大文字 I に
セリフの付いた同梱の IBM Plex Sans (SIL Open Font License 1.1、`public/fonts/`) を先頭に置き、読み込めないときは
各プラットフォームのサンセリフ (`-apple-system`, `Segoe UI`, `Meiryo`, `system-ui`) で描く。字の太さは名前より軽い
字形で描く (400 と 500 は Regular、600 と 700 は Medium の字形)。大文字 I のセリフのほかは、文字の形は実機と一致しない。

字の大きさのトークンと、字のインクの高さ (背景との色の差がいずれかのチャンネルで 90 を超える画素の縦の範囲) を
ガイドとシミュレーターで比べた値。

| トークン | 使う箇所 | ガイドのインク | シミュレーターのインク |
| --- | --- | --- | --- |
| `--fs-2xl` (18.5px) | ツールバー中央の名前の箱 | 14px (p099-1 の `COMP`、y15..28)、14px (p092-1 の `CH SETTING`、y15..28) | 14px (y15..28)、14px (y15..28) |
| `--fs-xl` (15px) | 1-knob を入れた EQ の、[1-knob] の横の種類の一覧 | — | — |
| `--fs-lg` (13px) | HOME ストリップの名前・[ON] / [CUE] / [PRE]・レベルの値、値の箱、つまみのキャプション、SETUP のメニューの名前、チャンネルビューの印など | 9px (p047-1 の [ON]、y182..190) | 9px (y182..190) |
| `--fs-md` (11px) | 画面の既定の字 (`.lcd`)、シーン番号、チャンネルビューのブロックのスイッチ、エフェクトの種類の名前、microSD の一覧など | 9px (p047-1 のシーン番号 `00`、y18..26) | 8px (y18..25) |
| `--fs-sm` (11.5px) | HOME ストリップの +48V の印、エフェクトのプルダウンの値、キャプションに帯域の名前を冠するエフェクトのキャプション | 9px (p047-1 の CH4 の点いた `+48V`、y100..108) | 8px (CH4 の +48V を入れた撮影で y101..108) |

トークンの大きさと、太さごとの字形の割り当ては、比較する画面の撮影とガイドの図の画素の差の平均で選んでいる。

トークンに載らないコントロールの字は、その画面の撮影とガイドの図の画素の差で 0.5px 刻みに選んだ大きさを
`lcd.css` の規則に直接書く (2 画面が同じ規則を使うときは 2 画面の合計で選ぶ)。字の行や列がガイドとずれるものは
`translate` で合わせる。
