import type { ParsedMove } from "../types/chess";
import { log } from "../shared/logger";
import { Chess } from "chess.js";
import { extractSanFromElement, isEmptyPly, tryMove } from "../chess/moveParser";
import { queryFirst, selectorCandidates } from "./selectors";

const ACTIVE_HINTS = /highlight|active|current|selected/i;
const MAINLINE_PLY_SELECTOR = ".main-line-ply";

function isMoveElementActive(el: HTMLElement): boolean {
  if (ACTIVE_HINTS.test(el.className)) return true;
  if (el.querySelector(".node-highlight-content")) return true;
  const parent = el.parentElement;
  if (parent && ACTIVE_HINTS.test(parent.className)) {
    const highlighted = parent.querySelector(".node-highlight-content");
    if (highlighted && (el.contains(highlighted) || highlighted.contains(el))) {
      return true;
    }
  }
  return false;
}

function resolveColor(el: HTMLElement, index: number): ParsedMove["color"] {
  if (el.classList.contains("black-move")) return "black";
  if (el.classList.contains("white-move")) return "white";
  return index % 2 === 0 ? "white" : "black";
}

function resolveMoveNumber(el: HTMLElement, index: number): number {
  const row = el.closest("[data-whole-move-number]");
  const attr = row?.getAttribute("data-whole-move-number");
  if (attr) {
    const n = parseInt(attr, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return Math.floor(index / 2) + 1;
}

export function parseMainLineFromDOM(
  root: ParentNode = document,
): ParsedMove[] {
  try {
    const container = queryFirst(root, selectorCandidates.moveContainer);
    if (!container) {
      log.warn("Mainline: move container not found");
      return [];
    }

    const plies = Array.from(
      container.querySelectorAll<HTMLElement>(MAINLINE_PLY_SELECTOR),
    );
    if (plies.length === 0) {
      log.warn("Mainline: no .main-line-ply elements found");
      return [];
    }

    const chess = new Chess();
    const moves: ParsedMove[] = [];

    plies.forEach((ply, index) => {
      if (isEmptyPly(ply)) return;

      const san = extractSanFromElement(ply);
      if (!san) {
        log.warn(`Mainline: empty SAN at ply index ${index}`);
        return;
      }

      const validated = tryMove(chess, san, index, ply);
      if (!validated) return;

      moves.push({
        moveNumber: resolveMoveNumber(ply, index),
        color: resolveColor(ply, index),
        san: validated.san,
        domElement: ply,
        source: "mainline",
        isActive: isMoveElementActive(ply),
      });
    });

    const active = moves.find((m) => m.isActive);
    log.info(
      `Mainline parsed: ${moves.length} moves` +
        (active ? `, active=${active.san}` : ", active=none"),
    );

    return moves;
  } catch (err) {
    log.error("parseMainLineFromDOM failed:", err);
    return [];
  }
}
