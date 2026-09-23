import type { MoveNode } from "../types/chess";
import type {
  CurrentNodeResponse,
  CurrentPositionResponse,
  GameStateResponse,
  MainlineResponse,
  Message,
  MoveTreeResponse,
  RefreshResponse,
  Response,
  VariationsResponse,
} from "../shared/messages";
import { log } from "../shared/logger";
import { getSerializableState, refresh } from "./moveTracker";

function ok<T>(data: T): Response<T> {
  return { ok: true, data };
}

function fail(error: string): Response<never> {
  return { ok: false, error };
}

export function handleMessage(
  message: Message<unknown>,
): Response<unknown> {
  try {
    if (!message || typeof message.type !== "string") {
      return fail("Invalid message: missing type");
    }

    switch (message.type) {
      case "GET_GAME_STATE": {
        const { gameState } = getSerializableState();
        return ok<GameStateResponse>({ gameState });
      }

      case "GET_MOVE_TREE": {
        const { moveTree } = getSerializableState();
        return ok<MoveTreeResponse>({ moveTree });
      }

      case "GET_MAINLINE": {
        const { moveTree } = getSerializableState();
        const mainline: MoveNode[] = [];
        for (const id of moveTree.mainLine) {
          const node = moveTree.nodes[id];
          if (node) mainline.push(node);
        }
        return ok<MainlineResponse>({ mainline });
      }

      case "GET_VARIATIONS": {
        const { variations } = getSerializableState();
        return ok<VariationsResponse>({ variations });
      }

      case "GET_CURRENT_POSITION": {
        const { moveTree } = getSerializableState();
        const currentNodeId = moveTree.currentNodeId;
        const node = currentNodeId ? moveTree.nodes[currentNodeId] : undefined;
        const fen = node?.fen || moveTree.root?.fen || "";
        return ok<CurrentPositionResponse>({ currentNodeId, fen });
      }

      case "GET_CURRENT_NODE": {
        const { moveTree } = getSerializableState();
        const node = moveTree.currentNodeId
          ? moveTree.nodes[moveTree.currentNodeId]
          : undefined;
        return ok<CurrentNodeResponse>({ node });
      }

      case "REFRESH": {
        const refreshed = refresh();
        return ok<RefreshResponse>({ refreshed });
      }

      default:
        return fail(`Unknown message type: ${String(message.type)}`);
    }
  } catch (err) {
    log.error("handleMessage failed:", err);
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export function startMessageHandler(): void {
  try {
    chrome.runtime.onMessage.addListener(
      (message: Message<unknown>, _sender, sendResponse) => {
        const response = handleMessage(message);
        sendResponse(response);
        return false;
      },
    );
    log.info("Message handler registered");
  } catch (err) {
    log.error("startMessageHandler failed:", err);
  }
}
