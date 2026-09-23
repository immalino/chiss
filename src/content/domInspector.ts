import { log } from "../shared/logger";
import {
  MOVE_NUMBER_REGEX,
  SAN_REGEX,
  queryAll,
  queryFirst,
  selectorCandidates,
} from "./selectors";

const ACTIVE_CLASS_HINTS =
  /highlight|active|current|selected|focus/i;
const VARIATION_CLASS_HINTS =
  /variation|exploration|branch/i;
const MAINLINE_CLASS_HINTS =
  /main-line|mainline|move-list-row/i;
const MAX_TEXT_LENGTH = 7;

interface ElementSummary {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  dataAttrs: Record<string, string>;
  ariaAttrs: Record<string, string>;
}

export interface MoveDOMReport {
  moveContainer: ElementSummary | null;
  moveElementCount: number;
  sampleMoves: string[];
  activeMove: ElementSummary | null;
  moveNumberCount: number;
  variationContainerCount: number;
  dataAttributesOnMoves: string[];
  ariaAttributesOnMoves: string[];
  figurineSamples: string[];
  dataNodeLineCounts: Record<string, number>;
  dataNodeTransitions: string[];
  structuralContainers: number;
}

export interface ContainerInfo {
  depth: number;
  element: Element;
  summary: ElementSummary;
  childContainerCount: number;
  moveCount: number;
  indentPx: number;
  isVariationLike: boolean;
}

export interface MoveTreeDOMReport {
  containers: ContainerInfo[];
  maxDepth: number;
  variationContainers: ContainerInfo[];
}

function summarize(el: Element): ElementSummary {
  const dataAttrs: Record<string, string> = {};
  const ariaAttrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-")) dataAttrs[attr.name] = attr.value;
    if (attr.name.startsWith("aria-")) ariaAttrs[attr.name] = attr.value;
  }
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    classes: Array.from(el.classList),
    text: (el.textContent ?? "").trim().slice(0, 40),
    dataAttrs,
    ariaAttrs,
  };
}

function formatSummary(s: ElementSummary | null): string {
  if (!s) return "not found";
  const cls = s.classes.length ? ` class="${s.classes.join(" ")}"` : "";
  const id = s.id ? `#${s.id}` : "";
  const data = Object.entries(s.dataAttrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  const aria = Object.entries(s.ariaAttrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  return `<${s.tag}${id}${cls}${data}${aria}> "${s.text}"`;
}

function isLeaf(el: Element): boolean {
  return el.children.length === 0;
}

function getDirectText(el: Element): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
  }
  return text.trim();
}

function isMoveText(el: Element): boolean {
  const text = (getDirectText(el) || (isLeaf(el) ? el.textContent ?? "" : ""))
    .trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return false;
  return SAN_REGEX.test(text);
}

function isActiveMove(el: Element): boolean {
  if (el.getAttribute("aria-current")) return true;
  if (el.getAttribute("aria-selected") === "true") return true;
  if (ACTIVE_CLASS_HINTS.test(el.className)) return true;
  const parent = el.parentElement;
  if (parent && ACTIVE_CLASS_HINTS.test(parent.className)) return true;
  return false;
}

function getIndentPx(el: Element): number {
  const style = window.getComputedStyle(el);
  return (
    (parseFloat(style.marginLeft) || 0) +
    (parseFloat(style.paddingLeft) || 0)
  );
}

function findMoveElements(root: ParentNode): HTMLElement[] {
  const fromCandidates = queryAll(root, selectorCandidates.moveElement)
    .filter((el) => isMoveText(el))
    .map((el) => el as HTMLElement);

  if (fromCandidates.length > 0) return fromCandidates;

  const scanned: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node) {
    if (isMoveText(node)) scanned.push(node as HTMLElement);
    node = walker.nextNode() as Element | null;
  }
  return scanned;
}

function findMoveContainer(
  root: ParentNode,
  moves: HTMLElement[],
): Element | null {
  if (moves.length > 0) {
    let best: Element | null = null;
    let bestScore = 0;
    for (const selector of selectorCandidates.moveContainer) {
      try {
        root.querySelectorAll(selector).forEach((el) => {
          let score = 0;
          for (const move of moves) {
            if (el.contains(move)) score++;
          }
          if (score > bestScore) {
            best = el;
            bestScore = score;
          }
        });
      } catch {
        // invalid selector candidate — skip
      }
    }
    if (best) return best;
  }

  const fromCandidates = queryFirst(root, selectorCandidates.moveContainer);
  if (fromCandidates) return fromCandidates;

  if (moves.length === 0) return null;

  const counts = new Map<Element, number>();
  for (const move of moves) {
    let parent = move.parentElement;
    while (parent && parent !== document.body) {
      counts.set(parent, (counts.get(parent) ?? 0) + 1);
      parent = parent.parentElement;
    }
  }

  let bestAncestor: Element | null = null;
  let bestCount = 0;
  for (const [el, count] of counts) {
    if (count > bestCount) {
      bestAncestor = el;
      bestCount = count;
    }
  }
  return bestAncestor;
}

function collectStructuralContainers(
  container: Element | null,
): ContainerInfo[] {
  if (!container) return [];

  const infos: ContainerInfo[] = [];
  const walk = (el: Element, depth: number): void => {
    const childContainers = Array.from(el.children).filter((child) =>
      Array.from(child.children).length > 0 ||
      queryAll(child, selectorCandidates.moveElement).length > 0,
    );
    const moveCount = queryAll(el, selectorCandidates.moveElement).filter(
      isMoveText,
    ).length;
    const className =
      typeof el.className === "string" ? el.className : "";
    const indent = getIndentPx(el);
    const isMainline = MAINLINE_CLASS_HINTS.test(className);
    const isVariationLike =
      !isMainline &&
      (VARIATION_CLASS_HINTS.test(className) ||
        (depth > 0 && indent > 0 && moveCount > 0));

    if (childContainers.length > 0 || moveCount > 0) {
      infos.push({
        depth,
        element: el,
        summary: summarize(el),
        childContainerCount: childContainers.length,
        moveCount,
        indentPx: indent,
        isVariationLike,
      });
    }

    for (const child of childContainers) walk(child, depth + 1);
  };

  walk(container, 0);
  return infos;
}

function findActiveMove(moves: HTMLElement[]): HTMLElement | null {
  for (const move of moves) {
    if (isActiveMove(move)) return move;
  }
  const fromCandidates = queryFirst(document, selectorCandidates.activeMove);
  if (fromCandidates && isMoveText(fromCandidates)) {
    return fromCandidates as HTMLElement;
  }
  return null;
}

function findMoveNumbers(root: ParentNode): Element[] {
  const fromCandidates = queryAll(root, selectorCandidates.moveNumber);
  const scanned: Element[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node) {
    const text = (node.textContent ?? "").trim();
    if (text && text.length <= 6 && MOVE_NUMBER_REGEX.test(text) && isLeaf(node)) {
      scanned.push(node);
    }
    node = walker.nextNode() as Element | null;
  }
  const seen = new Set<Element>();
  return [...fromCandidates, ...scanned].filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });
}

function findVariationContainers(root: ParentNode): Element[] {
  const fromCandidates = queryAll(root, selectorCandidates.variationContainer);
  if (fromCandidates.length > 0) return fromCandidates;

  const structural = collectStructuralContainers(
    findMoveContainer(root, findMoveElements(root)),
  );
  return structural
    .filter((info) => info.isVariationLike && info.moveCount > 0)
    .map((info) => info.element);
}

function collectAttributeHints(
  moves: HTMLElement[],
  prefix: "data-" | "aria-",
): string[] {
  const names = new Set<string>();
  for (const move of moves) {
    for (const attr of Array.from(move.attributes)) {
      if (attr.name.startsWith(prefix)) names.add(attr.name);
    }
    for (const el of Array.from(move.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith(prefix)) names.add(attr.name);
      }
    }
  }
  return Array.from(names).sort();
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "PATH",
  "META",
  "LINK",
  "TITLE",
]);

function dumpTextCandidates(root: ParentNode, limit = 40): void {
  const found: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node && found.length < limit) {
    if (
      node.children.length === 0 &&
      !SKIP_TAGS.has(node.tagName) &&
      node.textContent
    ) {
      const text = node.textContent.trim();
      if (text.length > 0 && text.length <= 10) {
        const cls =
          typeof node.className === "string" && node.className
            ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
        const ply = node.getAttribute("data-ply");
        const plyInfo = ply !== null ? ` data-ply="${ply}"` : "";
        found.push(
          `<${node.tagName.toLowerCase()}${cls}${plyInfo}> "${text}"`,
        );
      }
    }
    node = walker.nextNode() as Element | null;
  }
  if (found.length) {
    log.info(`Text candidates (short leaf text, ${found.length}):`);
    for (const f of found) log.info("  ", f);
  } else {
    log.warn("No short-text leaf elements found — DOM may not be ready.");
  }
}

function collectFigurineSamples(
  container: Element | null,
  moves: HTMLElement[],
): string[] {
  const samples: string[] = [];
  const seen = new Set<string>();
  const collect = (el: Element): void => {
    const val = el.getAttribute("data-figurine");
    if (val !== null && !seen.has(val)) {
      seen.add(val);
      const text = (el.textContent ?? "").trim();
      samples.push(`figurine="${val}" text="${text}"`);
    }
  };
  for (const move of moves) {
    collect(move);
    for (const child of Array.from(move.querySelectorAll("[data-figurine]"))) {
      collect(child);
    }
    if (samples.length >= 20) break;
  }
  if (container && samples.length < 20) {
    for (const el of Array.from(container.querySelectorAll("[data-figurine]"))) {
      collect(el);
      if (samples.length >= 20) break;
    }
  }
  return samples;
}

function analyzeDataNodes(moves: HTMLElement[]): {
  lineCounts: Record<string, number>;
  transitions: string[];
} {
  const lineCounts: Record<string, number> = {};
  const transitions: string[] = [];
  let lastLine: string | null = null;

  for (const move of moves) {
    const owner =
      move.getAttribute("data-node") !== null
        ? move
        : move.closest("[data-node]");
    const dataNode = owner?.getAttribute("data-node") ?? null;
    if (dataNode === null) continue;
    const lineId = dataNode.split("-")[0] ?? dataNode;
    lineCounts[lineId] = (lineCounts[lineId] ?? 0) + 1;
    if (lineId !== lastLine) {
      transitions.push(
        lastLine === null
          ? `${lineId}@start`
          : `${lastLine}->${lineId}`,
      );
      lastLine = lineId;
    }
  }
  return { lineCounts, transitions };
}

export function inspectMoveDOM(root: ParentNode = document): MoveDOMReport {
  try {
    const moves = findMoveElements(root);
    const container = findMoveContainer(root, moves);
    const active = findActiveMove(moves);
    const moveNumbers = findMoveNumbers(root);
    const variations = findVariationContainers(root);
    const structural = collectStructuralContainers(container);

    const report: MoveDOMReport = {
      moveContainer: container ? summarize(container) : null,
      moveElementCount: moves.length,
      sampleMoves: moves.slice(0, 10).map((el) => el.textContent?.trim() ?? ""),
      activeMove: active ? summarize(active) : null,
      moveNumberCount: moveNumbers.length,
      variationContainerCount: variations.length,
      dataAttributesOnMoves: collectAttributeHints(moves, "data-"),
      ariaAttributesOnMoves: collectAttributeHints(moves, "aria-"),
      figurineSamples: collectFigurineSamples(container, moves),
      ...(() => {
        const { lineCounts, transitions } = analyzeDataNodes(moves);
        return {
          dataNodeLineCounts: lineCounts,
          dataNodeTransitions: transitions,
        };
      })(),
      structuralContainers: structural.length,
    };

    log.info("DOM Inspector Report");
    log.info("Move container:", formatSummary(report.moveContainer));
    log.info(`Move elements: ${report.moveElementCount} found`);
    log.info("Active move:", formatSummary(report.activeMove));
    log.info(`Move number elements: ${report.moveNumberCount} found`);
    log.info(`Variation containers: ${report.variationContainerCount} found`);
    log.info(
      `Structural containers: ${report.structuralContainers} found, max depth ${
        structural.reduce((max, c) => Math.max(max, c.depth), 0)
      }`,
    );
    log.info(
      "data-* on moves:",
      report.dataAttributesOnMoves.length
        ? report.dataAttributesOnMoves.join(", ")
        : "none",
    );
    log.info(
      "aria-* on moves:",
      report.ariaAttributesOnMoves.length
        ? report.ariaAttributesOnMoves.join(", ")
        : "none",
    );
    if (report.figurineSamples.length) {
      log.info(`Figurine samples (${report.figurineSamples.length}):`);
      for (const s of report.figurineSamples) log.info("  ", s);
    }
    log.info(
      "data-node line counts:",
      JSON.stringify(report.dataNodeLineCounts),
    );
    if (report.dataNodeTransitions.length > 1) {
      log.info(
        "data-node line transitions:",
        report.dataNodeTransitions.join(", "),
      );
    }
    if (report.sampleMoves.length) {
      log.info("Sample moves:", report.sampleMoves.join(" "));
    } else {
      log.warn("No move elements matched SAN — dumping text candidates:");
      dumpTextCandidates(root);
    }

    return report;
  } catch (err) {
    log.error("inspectMoveDOM failed:", err);
    return {
      moveContainer: null,
      moveElementCount: 0,
      sampleMoves: [],
      activeMove: null,
      moveNumberCount: 0,
      variationContainerCount: 0,
      dataAttributesOnMoves: [],
      ariaAttributesOnMoves: [],
      figurineSamples: [],
      dataNodeLineCounts: {},
      dataNodeTransitions: [],
      structuralContainers: 0,
    };
  }
}

export function inspectMoveTreeDOM(
  root: ParentNode = document,
): MoveTreeDOMReport {
  try {
    const moves = findMoveElements(root);
    const container = findMoveContainer(root, moves);
    const containers = collectStructuralContainers(container);
    const variationContainers = containers.filter(
      (c) => c.isVariationLike && c.moveCount > 0 && c.depth > 0,
    );
    const maxDepth = containers.reduce((max, c) => Math.max(max, c.depth), 0);

    log.info("Move Tree DOM Report");
    log.info(`Containers: ${containers.length}, max depth: ${maxDepth}`);
    log.info(`Variation containers: ${variationContainers.length} found`);
    for (const info of variationContainers) {
      log.info(
        `  depth=${info.depth} indent=${info.indentPx}px moves=${info.moveCount} ${formatSummary(info.summary)}`,
      );
    }

    return { containers, maxDepth, variationContainers };
  } catch (err) {
    log.error("inspectMoveTreeDOM failed:", err);
    return { containers: [], maxDepth: 0, variationContainers: [] };
  }
}
