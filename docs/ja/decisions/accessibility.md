# アクセシビリティの決定

> For the English version, see [../../en/decisions/accessibility.md](../../en/decisions/accessibility.md).

画面が、読み上げなどの支援技術に何を伝えるかについて閉じた判断と、その経緯。

## 開いた一覧の下で描き直された箱は、`aria-expanded="false"` と読まれる

- **起きること**: 一覧やシートを開く箱は、`aria-expanded="false"` で作られ、開くと `true` になる
  (`src/ui/widgets.ts` の `dropdown()`)。一覧を開いたまま画面が描き直されると、箱は作り直されて
  `false` に戻る。一覧は開いたまま。
- **決定** (2026-10-19): 今のままにする。もう一度持ち出さない。
- **理由**: 一覧やシートが出ている間、その奥の画面は `inert` になっている (`src/app/shell.ts` の
  `shutBehind()`)。この決定は、ページの `inert` の部分が支援技術に渡されないことを前提にしている。
  値が誤っている間、箱は読まれない。
