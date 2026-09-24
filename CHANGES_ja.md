# 変更履歴

## 未リリース

- アプリケーションのバージョンだけを更新する PR を `main` にマージし、テストと本番ビルドが成功した後に GitHub Pages へデプロイする。公開先は `urx-lcd-sim.semnil.com`。通常のマージと PR では検査だけを行う。
- デプロイをキューへ入れ、配信直前に最新のバージョン更新か確認する。古い実行の再実行も含め、後続のバージョン更新がある場合は配信をスキップする。
- 検査済みのバージョン更新にタグを自動付与し、生成ノート付きのドラフト GitHub Release を作成する。再実行では既存 Release を保持し、競合するタグを移動しない。
- エフェクト画面のパネルと、Cho・Off・Vib・Gate・Sync のボタンの角を、ほかの画面のセルやボタンと同じ画素で描く。Cho・Off・Vib の幅は 59・60・59 にする。
- GATE・COMP・DUCKER の設定のパネルの角を、ガイドの図と同じ沈んだセルの画素で描く。エフェクトと SSMCS の画面の同じパネルも同じ。
- Pitch Fix の [Correction] と M.B.Comp の [Bypass] の角を、ほかのボタンと同じ画素で描く。
- シーンのリコールと設定ファイルの Load で、保存した値をそのまま戻す。Sync の入ったまま手で回した Mono Delay / Ping Pong の時間や、リンクしたペアへ戻した別々の 2 チャンネルの値が、変わって戻っていた。
- 1-knob のカーブを選んだとき、実機と同じく 4 バンドの入切を決める。Loudness は 4 バンドとも入、Vocal は LOW を切って残りの 3 バンドを入にする。
- USER DEFINED KNOBS の割り当てた値を、ノブのバーの区画のドラッグ・ホイール・矢印キーで回せるようにする。1-knob が入の間は実機と同じく回らない。
- EQ 画面とチャンネルビューの EQ ブロックのカーブを、各バンドのフィルターの形 (Bell / L.Shelf / H.Shelf / HPF / LPF) どおりに描く。Bell の幅はガイドの図と同じにする。
- ノブのバーを読み出しだけと書いていた README を直す。
- ツールバーのチャンネルの箱、USER DEFINED KNOBS の割り当てのシートの行、MONITOR の [Source]、ドロップダウンの一覧の盆、Pitch Fix の鍵盤のパネル、1-knob のパネル、SSMCS の Sweet Spot Data の角を、ガイドの図と同じ画素で描く。Sweet Spot Data に帯を付ける。
- MONITOR の [Source]、ダイナミクス画面の設定、RECORDER の Track Count の一覧をガイドの図の位置に置き、Pitch Fix の鍵盤のパネルを横の Scale の一覧と下端でそろえる。
