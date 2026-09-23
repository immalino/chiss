export const SAN_REGEX =
  /^(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;

export const MOVE_NUMBER_REGEX = /^\d+(?:\.\.\.|\.)$/;

export interface SelectorCandidates {
  moveContainer: string[];
  moveElement: string[];
  moveNumber: string[];
  activeMove: string[];
  variationContainer: string[];
}

export const selectorCandidates: SelectorCandidates = {
  moveContainer: [
    "wc-move-list",
    ".analysis-view-movelist",
    ".move-list",
    "[data-moves]",
    "[data-ply]",
    "[class*='move-list']",
    "[class*='MoveList']",
    "[class*='moveList']",
    "[class*='move_list']",
    "[class*='notation']",
    "[class*='Notation']",
    "ul[role='list']",
    "ol[role='list']",
  ],
  moveElement: [
    ".main-line-ply",
    ".node[data-node]",
    "[data-node]",
    ".main-variation-ply",
    ".variation-ply",
    "[data-ply]",
    "[data-move]",
    "[data-san]",
  ],
  moveNumber: [
    "[data-whole-move-number]",
    "[data-move-number]",
    "[class*='move-number']",
    "[class*='moveNumber']",
  ],
  activeMove: [
    ".node-highlight-content",
    "[aria-current='true']",
    "[aria-current='move']",
    "[aria-selected='true']",
    "[class*='highlight']",
    "[class*='Highlight']",
    "[class*='active']",
    "[class*='Active']",
    "[class*='current']",
    "[class*='Current']",
    "[class*='selected']",
    "[class*='Selected']",
  ],
  variationContainer: [
    "[class*='variation']",
    "[class*='Variation']",
    "[class*='exploration']",
    "[class*='Exploration']",
    "[data-variation]",
    "[data-variation-depth]",
  ],
};

export function queryFirst(
  root: ParentNode,
  candidates: string[],
): Element | null {
  for (const selector of candidates) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {
      // invalid selector candidate — skip
    }
  }
  return null;
}

export function queryAll(
  root: ParentNode,
  candidates: string[],
): Element[] {
  const seen = new Set<Element>();
  const results: Element[] = [];
  for (const selector of candidates) {
    try {
      root.querySelectorAll(selector).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      });
    } catch {
      // invalid selector candidate — skip
    }
  }
  return results;
}
