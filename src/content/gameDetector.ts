import type { GameState } from "../types/chess";
import { log } from "../shared/logger";
import { queryFirst, selectorCandidates } from "./selectors";

const GAME_ID_FROM_URL =
  /\/game\/(?:live|review)\/(\d+)|\/analysis\/game\/(?:live|computer|friend|review)\/(?:\d+\/)?(\d+)/;

const FINISHED_PATTERNS = ["1-0", "0-1", "1/2-1/2"];

function detectPageType(pathname: string): GameState["pageType"] {
  if (/\/game\/live\//.test(pathname)) return "game";
  if (/\/game\/review\//.test(pathname)) return "review";
  if (/\/analysis\//.test(pathname)) return "analysis";
  return "unknown";
}

function detectGameId(pathname: string): string | undefined {
  const match = pathname.match(GAME_ID_FROM_URL);
  if (!match) return undefined;
  return match[1] ?? match[2];
}

function isBoardPresent(root: ParentNode): boolean {
  return (
    root.querySelector("[class*='board']") !== null ||
    root.querySelector("wc-board") !== null ||
    root.querySelector("[data-board]") !== null
  );
}

function isMoveListPresent(root: ParentNode): boolean {
  return queryFirst(root, selectorCandidates.moveContainer) !== null;
}

function detectFinished(root: ParentNode): boolean {
  const candidates = root.querySelectorAll(
    "[class*='result'], [class*='Result'], [data-result], [class*='game-over'], [class*='GameOver'], [class*='outcome'], [class*='Outcome']",
  );
  for (const el of Array.from(candidates)) {
    const text = (el.textContent ?? "").trim();
    if (FINISHED_PATTERNS.some((p) => text.includes(p))) return true;
  }
  return false;
}

export function detectGamePage(root: ParentNode = document): GameState {
  try {
    const pathname = window.location.pathname;
    const pageType = detectPageType(pathname);
    const gameId = detectGameId(pathname);
    const boardPresent = isBoardPresent(root);
    const moveListPresent = isMoveListPresent(root);
    const detected = pageType !== "unknown" && boardPresent && moveListPresent;
    const gameFinished = detectFinished(root);

    const state: GameState = {
      detected,
      pageType,
      ...(gameId !== undefined && { gameId }),
      gameFinished,
    };

    if (detected) {
      log.info(
        `Game detected: type=${pageType} id=${gameId ?? "n/a"} finished=${gameFinished}`,
      );
    } else {
      log.warn(
        `Game NOT detected: type=${pageType} board=${boardPresent} moveList=${moveListPresent}`,
      );
    }

    return state;
  } catch (err) {
    log.error("detectGamePage failed:", err);
    return { detected: false, pageType: "unknown", gameFinished: false };
  }
}
