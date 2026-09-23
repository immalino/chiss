import { Chess } from "chess.js";
import type { MoveParseError } from "../types/chess";
import { log } from "../shared/logger";

const LEADING_MOVE_NUMBER = /^\d+\s*(?:\.\.\.)?\s*\./;
const ALREADY_HAS_PIECE = /^[KQRBN]/;
const CASTLING = /^O-O(-O)?[+#]?$/;
const EMPTY_PLY_TEXT = /^(?:\.\.\.|…|\s)*$/;

export function isEmptyPly(el: HTMLElement): boolean {
  if (el.classList.contains("empty")) return true;
  const text = (el.textContent ?? "").trim();
  return EMPTY_PLY_TEXT.test(text) || text.length === 0;
}

export function extractSanFromElement(el: HTMLElement): string {
  if (isEmptyPly(el)) return "";
  const figurine =
    el.getAttribute("data-figurine") ??
    el
      .querySelector("[data-figurine]")
      ?.getAttribute("data-figurine") ??
    "";

  let text = (el.textContent ?? "").trim().replace(/\s+/g, "");
  text = text.replace(LEADING_MOVE_NUMBER, "");

  if (
    figurine &&
    !ALREADY_HAS_PIECE.test(text) &&
    !CASTLING.test(text) &&
    text.length > 0
  ) {
    return `${figurine}${text}`;
  }
  return text;
}

export function createChess(fen?: string): Chess {
  const chess = new Chess();
  if (fen) chess.load(fen);
  return chess;
}

export function tryMove(
  chess: Chess,
  san: string,
  moveIndex: number,
  domElement?: HTMLElement,
): { san: string } | null {
  try {
    const result = chess.move(san);
    if (!result) {
      const err: MoveParseError = {
        san,
        moveIndex,
        reason: "chess.js returned null",
        domElement,
      };
      log.warn("MoveParseError:", err);
      return null;
    }
    return { san: result.san };
  } catch (err) {
    const parseErr: MoveParseError = {
      san,
      moveIndex,
      reason: err instanceof Error ? err.message : String(err),
      domElement,
    };
    log.warn("MoveParseError:", parseErr);
    return null;
  }
}

export function isValidSan(san: string): boolean {
  if (!san) return false;
  if (CASTLING.test(san)) return true;
  try {
    const chess = new Chess();
    const result = chess.move(san);
    return result !== null;
  } catch {
    return false;
  }
}
