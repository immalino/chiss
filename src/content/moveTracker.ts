import type { GameState, MoveNode, MoveTree } from "../types/chess";
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
  updatedAt: number;
}

function emptyState(): TrackerState {
  return {
    gameState: { detected: false, pageType: "unknown", gameFinished: false },
    moveTree: { root: null, nodes: {}, mainLine: [] },
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

function serializeState(s: TrackerState): string {
  const nodes: Record<string, MoveNode> = {};
  for (const [id, node] of Object.entries(s.moveTree.nodes)) {
    nodes[id] = stripDom(node);
  }
  return normalizeState({
    gameState: s.gameState,
    moveTree: {
      ...s.moveTree,
      root: s.moveTree.root ? stripDom(s.moveTree.root) : null,
      nodes,
    },
  });
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
