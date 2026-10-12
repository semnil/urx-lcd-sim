// The focus and the events of a glass that may be drawn in a shadow tree
// (src/embed.ts). Seen from the document, a shadow tree is its host element: the
// focus inside it reads as the host, and an event from inside it reaches a
// listener on the window or the document as sent to the host. These read the
// tree the glass is in instead.

/** The element holding the focus in the tree `node` is in: the glass's shadow tree, or the document. */
export function activeIn(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
}

/**
 * Whether anything holds the focus, on the glass `node` is in or on the page
 * around it. The host of the glass's shadow tree holding it stands for the
 * glass, which is asked of its own tree.
 */
export function focusHeld(node: Node): boolean {
  const inner = activeIn(node);
  if (inner && inner !== document.body) return true;
  const outer = document.activeElement;
  const root = node.getRootNode();
  return outer !== null && outer !== document.body && !(root instanceof ShadowRoot && outer === root.host);
}

/** The element an event was sent to, inside a shadow tree as much as outside one. */
export function originOf(ev: Event): EventTarget | null {
  return ev.composedPath()[0] ?? ev.target;
}

/** The element under a point of the viewport, in the tree `node` is in. */
export function elementAt(node: Node, x: number, y: number): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.elementFromPoint(x, y) : document.elementFromPoint(x, y);
}
