import type { ParsedMove, Variation } from "../types/chess";
import { log } from "../shared/logger";
import { Chess } from "chess.js";
import { extractSanFromElement, isEmptyPly, tryMove } from "../chess/moveParser";
import { queryFirst, selectorCandidates } from "./selectors";

const MAINLINE_PLY_SELECTOR = ".main-line-ply";
const VARIATION_CLASS_HINTS = /variation|exploration|branch/i;
const MAINLINE_CLASS_HINTS = /main-line|mainline|move-list-row/i;
const ENGINE_HINTS = /engine|evaluation|multi-pv|best-move|hint/i;
const ACTIVE_HINTS = /highlight|active|current|selected/i;

function isMoveElement(el: HTMLElement): boolean {
  if (isEmptyPly(el)) return false;
  if (!el.classList.contains("node") && !el.classList.contains("main-line-ply")) {
    return false;
  }
  const text = (el.textContent ?? "").trim();
  return text.length > 0 && text.length <= 15;
}

function getLineId(el: HTMLElement): string | null {
  const owner =
    el.getAttribute("data-node") !== null
      ? el
      : el.closest<HTMLElement>("[data-node]");
  if (!owner) return null;
  const dataNode = owner.getAttribute("data-node");
  if (dataNode === null) return null;
  return dataNode.split("-")[0] ?? dataNode;
}

function getDataNodeValue(el: HTMLElement): string | null {
  if (el.getAttribute("data-node") !== null) return el.getAttribute("data-node");
  return el.closest<HTMLElement>("[data-node]")?.getAttribute("data-node") ?? null;
}

function getMainlineLineId(mainlinePlies: HTMLElement[]): string | null {
  if (mainlinePlies.length === 0) return null;
  return getLineId(mainlinePlies[0]);
}

function hasStructuralEvidence(
  el: HTMLElement,
  mainlineLineId: string | null,
): boolean {
  if (ENGINE_HINTS.test(el.className)) return false;

  const lineId = getLineId(el);
  if (
    lineId !== null &&
    mainlineLineId !== null &&
    lineId !== mainlineLineId
  ) {
    return true;
  }

  const explicit = el.closest(
    "[class*='variation'], [class*='Variation'], [class*='exploration'], [data-variation]",
  );
  if (explicit && !MAINLINE_CLASS_HINTS.test(explicit.className)) {
    return true;
  }

  const container = el.closest("wc-move-list, .move-list, .analysis-view-movelist");
  if (!container) return false;

  const mainlineBaseline = container.querySelector(MAINLINE_PLY_SELECTOR);
  if (!mainlineBaseline) return false;

  const style = window.getComputedStyle(el);
  const mainlineStyle = window.getComputedStyle(mainlineBaseline);
  const indent =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.marginLeft) || 0);
  const mainlineIndent =
    (parseFloat(mainlineStyle.paddingLeft) || 0) +
    (parseFloat(mainlineStyle.marginLeft) || 0);

  const row = el.closest("[class*='row'], [class*='Row']");
  const rowIndent = row ? getIndentPx(row) : 0;
  const mainlineRow = mainlineBaseline.closest("[class*='row']");
  const mainlineRowIndent = mainlineRow ? getIndentPx(mainlineRow) : 0;

  if (indent > mainlineIndent + 4) return true;
  if (rowIndent > mainlineRowIndent + 4) return true;

  return false;
}

function getIndentPx(el: Element): number {
  const style = window.getComputedStyle(el);
  return (
    (parseFloat(style.marginLeft) || 0) +
    (parseFloat(style.paddingLeft) || 0)
  );
}

function getVariationDepth(el: HTMLElement, container: Element): number {
  let depth = 0;
  let current: Element | null = el.parentElement;
  while (current && current !== container) {
    if (
      VARIATION_CLASS_HINTS.test(
        typeof current.className === "string" ? current.className : "",
      ) ||
      getIndentPx(current) > 0
    ) {
      const mainlineBaseline = container.querySelector(MAINLINE_PLY_SELECTOR);
      const baselineIndent = mainlineBaseline
        ? getIndentPx(mainlineBaseline)
        : 0;
      if (getIndentPx(current) > baselineIndent + 4) depth++;
    }
    current = current.parentElement;
  }
  return Math.max(depth, 1);
}

function resolveColor(el: HTMLElement, indexInVariation: number, fallbackColor: ParsedMove["color"] | null): ParsedMove["color"] {
  if (el.classList.contains("black-move")) return "black";
  if (el.classList.contains("white-move")) return "white";
  if (fallbackColor) {
    return fallbackColor === "white" ? "black" : "white";
  }
  return indexInVariation % 2 === 0 ? "white" : "black";
}

function resolveMoveNumber(el: HTMLElement, indexInVariation: number): number {
  const row = el.closest("[data-whole-move-number]");
  const attr = row?.getAttribute("data-whole-move-number");
  if (attr) {
    const n = parseInt(attr, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const plyAttr = el.getAttribute("data-ply");
  if (plyAttr) {
    const ply = parseInt(plyAttr, 10);
    if (!Number.isNaN(ply)) return Math.floor(ply / 2) + 1;
  }
  return Math.floor(indexInVariation / 2) + 1;
}

function findParentReference(
  el: HTMLElement,
  mainlinePlies: HTMLElement[],
): string | undefined {
  const parentDataNode = el.parentElement?.closest("[data-node]");
  if (
    parentDataNode &&
    parentDataNode !== el &&
    !parentDataNode.classList.contains("node")
  ) {
    const childPly = parentDataNode.querySelector("[data-node]");
    const id = childPly?.getAttribute("data-node");
    if (id) return id;
  }

  let previous: HTMLElement | null = null;
  for (const ply of mainlinePlies) {
    if (
      ply === el ||
      (el.compareDocumentPosition(ply) & Node.DOCUMENT_POSITION_FOLLOWING)
    ) {
      break;
    }
    previous = ply;
  }

  return previous ? getDataNodeValue(previous) ?? undefined : undefined;
}

function isActive(el: HTMLElement): boolean {
  if (ACTIVE_HINTS.test(el.className)) return true;
  return el.querySelector(".node-highlight-content") !== null;
}

function sourceFor(el: HTMLElement): "variation" | "exploration" {
  if (/exploration/i.test(el.className)) return "exploration";
  if (el.closest("[class*='exploration']")) return "exploration";
  return "variation";
}

function variationContainerOf(el: HTMLElement): Element {
  const lineId = getLineId(el);
  if (lineId !== null) {
    const explicit = el.closest(
      "[class*='variation'], [class*='Variation'], [class*='exploration']",
    );
    if (explicit) return explicit;
    return el.parentElement ?? el;
  }
  return (
    el.closest(
      "[class*='variation'], [class*='Variation'], [class*='exploration']",
    ) ?? el.parentElement ??
    el
  );
}

function groupVariationElements(plies: HTMLElement[]): HTMLElement[][] {
  if (plies.length === 0) return [];

  const groups: HTMLElement[][] = [];
  let current: HTMLElement[] = [plies[0]];
  let currentKey = groupKeyOf(plies[0]);

  for (let i = 1; i < plies.length; i++) {
    const key = groupKeyOf(plies[i]);
    if (key === currentKey) {
      current.push(plies[i]);
    } else {
      groups.push(current);
      current = [plies[i]];
      currentKey = key;
    }
  }
  groups.push(current);
  return groups;
}

function groupKeyOf(el: HTMLElement): string {
  const lineId = getLineId(el);
  if (lineId !== null) return `line:${lineId}`;
  const container = variationContainerOf(el);
  const cls =
    typeof container.className === "string" ? container.className : "";
  return `container:${cls}`;
}

export function parseVariationsFromDOM(
  root: ParentNode = document,
): Variation[] {
  try {
    const container = queryFirst(root, selectorCandidates.moveContainer);
    if (!container) {
      log.warn("Variations: move container not found");
      return [];
    }

    const mainlinePlies = Array.from(
      container.querySelectorAll<HTMLElement>(MAINLINE_PLY_SELECTOR),
    );
    const mainlineSet = new Set(mainlinePlies);
    const mainlineLineId = getMainlineLineId(mainlinePlies);

    const allNodes = Array.from(container.querySelectorAll<HTMLElement>(".node"));
    const candidates = allNodes.filter(
      (el) =>
        !mainlineSet.has(el) &&
        !el.closest(MAINLINE_PLY_SELECTOR) &&
        isMoveElement(el) &&
        hasStructuralEvidence(el, mainlineLineId),
    );

    const uncertain = allNodes.filter(
      (el) =>
        !mainlineSet.has(el) &&
        !el.closest(MAINLINE_PLY_SELECTOR) &&
        isMoveElement(el) &&
        !hasStructuralEvidence(el, mainlineLineId) &&
        !ENGINE_HINTS.test(el.className),
    );
    if (uncertain.length > 0) {
      log.warn(
        `Variations: ${uncertain.length} move-like elements without structural evidence — marked unknown, skipped`,
      );
    }

    if (candidates.length === 0) {
      log.info("Variations: none found");
      return [];
    }

    const groups = groupVariationElements(candidates);
    const variations: Variation[] = [];

    groups.forEach((group, groupIndex) => {
      const chess = new Chess();
      const parentRef = findParentReference(group[0], mainlinePlies);
      const source = sourceFor(group[0]);
      const depth = getVariationDepth(group[0], container);
      const moves: ParsedMove[] = [];
      let lastColor: ParsedMove["color"] | null = null;

      // Replay mainline up to branch point for legal validation
      if (parentRef !== undefined) {
        const parentIdx = mainlinePlies.findIndex(
          (p) => getDataNodeValue(p) === parentRef,
        );
        if (parentIdx >= 0) {
          for (let i = 0; i <= parentIdx; i++) {
            const san = extractSanFromElement(mainlinePlies[i]);
            if (san) tryMove(chess, san, i, mainlinePlies[i]);
          }
          lastColor = mainlinePlies[parentIdx].classList.contains("black-move")
            ? "black"
            : "white";
        }
      }

      group.forEach((ply, i) => {
        const san = extractSanFromElement(ply);
        if (!san) {
          log.warn(`Variation ${groupIndex}: empty SAN at index ${i}`);
          return;
        }
        const validated = tryMove(chess, san, i, ply);
        if (!validated) return;

        const color = resolveColor(ply, i, lastColor);
        lastColor = color;

        moves.push({
          moveNumber: resolveMoveNumber(ply, i),
          color,
          san: validated.san,
          domElement: ply,
          source,
          isActive: isActive(ply),
        });
      });

      if (moves.length === 0) return;

      const id =
        parentRef !== undefined
          ? `var:${parentRef}:${depth}:${groupIndex}`
          : `var:${depth}:${groupIndex}`;

      variations.push({
        id,
        parentMoveId: parentRef,
        moves,
        depth,
        source: source === "exploration" ? "exploration" : "variation",
      });
    });

    log.info(
      `Variations parsed: ${variations.length} ` +
        `(${variations.map((v) => `${v.moves.length}m@d${v.depth}`).join(", ")})`,
    );

    return variations;
  } catch (err) {
    log.error("parseVariationsFromDOM failed:", err);
    return [];
  }
}
