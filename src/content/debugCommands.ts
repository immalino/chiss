import type { GameState, MoveNode, MoveTree, Variation } from "../types/chess";
import type { MoveDOMReport, MoveTreeDOMReport } from "./domInspector";
import { log } from "../shared/logger";
import { inspectMoveDOM, inspectMoveTreeDOM } from "./domInspector";
import { getSerializableState, refresh } from "./moveTracker";

export interface ChessTrackerDebug {
  getState(): {
    gameState: GameState;
    moveTree: MoveTree;
    variations: Variation[];
    updatedAt: number;
  };
  getMoveTree(): MoveTree;
  getMainline(): MoveNode[];
  getVariations(): Variation[];
  getCurrentNode(): MoveNode | undefined;
  inspectDOM(): { move: MoveDOMReport; tree: MoveTreeDOMReport };
  refresh(): boolean;
}

type DebuggableWindow = Window & { __CHESS_TRACKER__?: ChessTrackerDebug };

export function installDebugCommands(): void {
  try {
    const api: ChessTrackerDebug = {
      getState() {
        return getSerializableState();
      },
      getMoveTree() {
        return getSerializableState().moveTree;
      },
      getMainline() {
        const { moveTree } = getSerializableState();
        const mainline: MoveNode[] = [];
        for (const id of moveTree.mainLine) {
          const node = moveTree.nodes[id];
          if (node) mainline.push(node);
        }
        return mainline;
      },
      getVariations() {
        return getSerializableState().variations;
      },
      getCurrentNode() {
        const { moveTree } = getSerializableState();
        const id = moveTree.currentNodeId;
        if (id && moveTree.nodes[id]) return moveTree.nodes[id];
        return moveTree.root ?? undefined;
      },
      inspectDOM() {
        return { move: inspectMoveDOM(), tree: inspectMoveTreeDOM() };
      },
      refresh() {
        return refresh();
      },
    };

    (window as DebuggableWindow).__CHESS_TRACKER__ = api;
    log.info(
      "Debug commands installed — window.__CHESS_TRACKER__ (content script console only)",
    );
  } catch (err) {
    log.error("installDebugCommands failed:", err);
  }
}
