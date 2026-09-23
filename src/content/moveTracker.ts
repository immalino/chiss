import type { GameState, MoveNode, MoveTree, ParsedMove, Variation } from "../types/chess";
import { log } from "../shared/logger";
import { debounce, normalizeState } from "../shared/utils";
import { buildFenForTree } from "../chess/positionBuilder";
import { buildMoveTree } from "../chess/moveTree";
import { detectGamePage } from "./gameDetector";
import { parseMainLineFromDOM } from "./mainlineParser";
import { parseVariationsFromDOM } from "./variationParser";

export const MOVE_TREE_UPDATED = "chiss:MOVE_TREE_UPDATED";

const DEBOUNCE_MS = 200;
const MOVE_LIST_HINTS =
  "wc-move-list, .move-list, .analysis-view-movelist";

export interface TrackerState {
  gameState: GameState;
  moveTree: MoveTree;
  variations: Variation[];
  updatedAt: number;
}

function emptyState(): TrackerState {
  return {
    gameState: { detected: false, pageType: "unknown", gameFinished: false },
    moveTree: { root: null, nodes: {}, mainLine: [] },
    variations: [],
    updatedAt: 0,
  };
}

let state: TrackerState = emptyState();
let lastSerialized: string | null = null;
let observer: MutationObserver | null = null;

function stripDom(node: MoveNode): MoveNode {
  const copy: MoveNode = { ...node };
  delete copy.domElement;
  return copy;
}

function stripParsedMoveDom(move: ParsedMove): ParsedMove {
  const copy: ParsedMove = { ...move };
  delete copy.domElement;
  return copy;
}

function stripVariationDom(variation: Variation): Variation {
  return { ...variation, moves: variation.moves.map(stripParsedMoveDom) };
}

function stripTreeDom(tree: MoveTree): MoveTree {
  const nodes: Record<string, MoveNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    nodes[id] = stripDom(node);
  }
  return {
    ...tree,
    root: tree.root ? stripDom(tree.root) : null,
    nodes,
  };
}

function serializeState(s: TrackerState): string {
  return normalizeState({
    gameState: s.gameState,
    variations: s.variations.map(stripVariationDom),
    moveTree: stripTreeDom(s.moveTree),
  });
}

export function getSerializableState(): TrackerState {
  return {
    gameState: state.gameState,
    moveTree: stripTreeDom(state.moveTree),
    variations: state.variations.map(stripVariationDom),
    updatedAt: state.updatedAt,
  };
}

function emit(s: TrackerState): void {
  window.dispatchEvent(
    new CustomEvent<TrackerState>(MOVE_TREE_UPDATED, { detail: s }),
  );
}

export function getState(): TrackerState {
  return state;
}

export function getMoveTree(): MoveTree {
  return state.moveTree;
}

export function getGameState(): GameState {
  return state.gameState;
}

export function resetState(): void {
  state = emptyState();
  lastSerialized = null;
  log.info("Tracker state reset");
}

export function refresh(): boolean {
  try {
    const gameState = detectGamePage();
    const mainline = parseMainLineFromDOM();
    const variations = parseVariationsFromDOM();
    const moveTree = buildMoveTree(mainline, variations);
    buildFenForTree(moveTree);

    const next: TrackerState = {
      gameState,
      moveTree,
      variations,
      updatedAt: Date.now(),
    };
    const serialized = serializeState(next);

    if (serialized === lastSerialized) {
      log.debug("Refresh: state unchanged — skip emit");
      return moveTree.mainLine.length > 0;
    }

    lastSerialized = serialized;
    state = next;
    emit(next);
    log.info(
      `MOVE_TREE_UPDATED: mainline=${moveTree.mainLine.length} nodes=${Object.keys(moveTree.nodes).length} detected=${gameState.detected}`,
    );
    return moveTree.mainLine.length > 0;
  } catch (err) {
    log.error("refresh failed:", err);
    return false;
  }
}

const debouncedRefresh = debounce(() => {
  refresh();
}, DEBOUNCE_MS);

function isRelevantMutation(mutation: MutationRecord): boolean {
  const target =
    mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;
  if (!target) return false;
  return target.closest(MOVE_LIST_HINTS) !== null;
}

export function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (mutations.some(isRelevantMutation)) debouncedRefresh();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  log.info("MutationObserver started on move list");
}

export function stopObserver(): void {
  if (!observer) return;
  observer.disconnect();
  observer = null;
  log.info("MutationObserver stopped");
}

const NAV_INITIAL_DELAY_MS = 150;
const NAV_RETRY_MS = 500;
const NAV_MAX_RETRIES = 10;
const NAV_POLL_MS = 500;

let spaStarted = false;
let lastHref = "";
let navTimer: number | null = null;
let navAttempts = 0;
let pollTimer: number | null = null;
let savedPushState: History["pushState"] | null = null;
let savedReplaceState: History["replaceState"] | null = null;
let popstateHandler: (() => void) | null = null;

function clearNavTimer(): void {
  if (navTimer !== null) {
    window.clearTimeout(navTimer);
    navTimer = null;
  }
}

function runNavRefresh(): void {
  navTimer = null;
  navAttempts++;
  startObserver();
  const ok = refresh();
  if (ok) {
    log.info(`SPA nav refresh ok (attempt ${navAttempts})`);
    return;
  }
  const pageType = getGameState().pageType;
  if (pageType === "unknown") {
    log.info("SPA nav: not a game page — stop retrying");
    return;
  }
  if (navAttempts >= NAV_MAX_RETRIES) {
    log.warn(`SPA nav: no mainline after ${navAttempts} attempts`);
    return;
  }
  navTimer = window.setTimeout(runNavRefresh, NAV_RETRY_MS);
}

function scheduleNavRefresh(delayMs: number): void {
  clearNavTimer();
  navAttempts = 0;
  navTimer = window.setTimeout(runNavRefresh, delayMs);
}

function handleNavigation(source: string): void {
  try {
    const href = window.location.href;
    if (href === lastHref) return;
    lastHref = href;
    log.info(`SPA navigation (${source}): ${href}`);
    resetState();
    scheduleNavRefresh(NAV_INITIAL_DELAY_MS);
  } catch (err) {
    log.error("handleNavigation failed:", err);
  }
}

function patchHistory(): void {
  savedPushState = history.pushState;
  savedReplaceState = history.replaceState;
  history.pushState = function patchedPushState(
    this: History,
    ...args: Parameters<History["pushState"]>
  ): void {
    savedPushState?.apply(this, args);
    handleNavigation("pushState");
  };
  history.replaceState = function patchedReplaceState(
    this: History,
    ...args: Parameters<History["replaceState"]>
  ): void {
    savedReplaceState?.apply(this, args);
    handleNavigation("replaceState");
  };
}

function unpatchHistory(): void {
  if (savedPushState) history.pushState = savedPushState;
  if (savedReplaceState) history.replaceState = savedReplaceState;
  savedPushState = null;
  savedReplaceState = null;
}

export function startSpaNavigation(): void {
  try {
    if (spaStarted) return;
    spaStarted = true;
    lastHref = window.location.href;
    patchHistory();
    popstateHandler = () => handleNavigation("popstate");
    window.addEventListener("popstate", popstateHandler);
    pollTimer = window.setInterval(
      () => handleNavigation("poll"),
      NAV_POLL_MS,
    );
    log.info("SPA navigation tracking started");
  } catch (err) {
    log.error("startSpaNavigation failed:", err);
    spaStarted = false;
  }
}

export function stopSpaNavigation(): void {
  try {
    if (!spaStarted) return;
    spaStarted = false;
    unpatchHistory();
    if (popstateHandler) {
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    }
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    clearNavTimer();
    log.info("SPA navigation tracking stopped");
  } catch (err) {
    log.error("stopSpaNavigation failed:", err);
  }
}
