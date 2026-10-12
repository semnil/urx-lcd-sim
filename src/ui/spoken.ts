// What a screen reader is handed for a name or a description.
//
// The glass prints its marks the way the unit does, and a screen reader reads several of
// them as something other than what they are: "CH" as a word, an a/b pair as a fraction or a
// date, a slash on its own as nothing, the middle dot as its character name or as nothing, and
// the polarity mark as a Greek or Cyrillic letter. Each is handed over in a reading of its
// own instead: "CH" letter by letter, a pair as its two halves with "slash" between them, the
// slash and the dot by their words, the polarity mark as "Phase". What the screen prints is
// left as it is.

/** The marks read in a reading of their own. */
export const SPOKEN_MARK = /(?<![A-Za-z0-9])ch(?![A-Za-z0-9])|([A-Za-z0-9.]+)\/([A-Za-z0-9.]+)|\/|·|[ФΦ]/gi;

/** The attributes a screen reader reads as a name or a description. */
const SPOKEN_ATTRS = new Set(["aria-label", "aria-description"]);

/** Whether `text` holds a mark that is read in a reading of its own. */
export function holdsMark(text: string): boolean {
  SPOKEN_MARK.lastIndex = 0;
  return SPOKEN_MARK.test(text);
}

function reading(mark: RegExpExecArray): string {
  if (mark[1] !== undefined) return ` ${mark[1]} slash ${mark[2]} `;
  if (mark[0] === "/") return " slash ";
  if (mark[0] === "·") return " dot ";
  if (mark[0] === "Ф" || mark[0] === "Φ") return " Phase ";
  return " C H ";
}

/** `text` as a screen reader is handed it: each mark in its reading, the words a single space apart. */
export function spoken(text: string): string {
  SPOKEN_MARK.lastIndex = 0;
  return text
    .replace(SPOKEN_MARK, (...args) => reading(args.slice(0, 3) as unknown as RegExpExecArray))
    .replace(/ {2,}/g, " ")
    .replace(/ ([,.:;!?)\]…])/g, "$1")
    .replace(/([(\[]) /g, "$1")
    .trim();
}

/** Set `name` on `node`, in the form a screen reader is handed when it is a name or a description. */
export function setSpokenAttr(node: Element, name: string, value: string): void {
  node.setAttribute(name, SPOKEN_ATTRS.has(name) ? spoken(value) : value);
}
