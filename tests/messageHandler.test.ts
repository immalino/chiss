import { describe, expect, it } from "vitest";
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
} from "../src/shared/messages";
import { handleMessage } from "../src/content/messageHandler";

function send(type: Message["type"]): Response<unknown> {
  return handleMessage({ type });
}

function expectOk<T>(response: Response<unknown>): T {
  expect(response.ok).toBe(true);
  expect(response.error).toBeUndefined();
  return response.data as T;
}

describe("handleMessage", () => {
  it("returns error for invalid message", () => {
    const response = handleMessage(null as unknown as Message);
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/missing type/);
  });

  it("returns error for unknown message type", () => {
    const response = handleMessage({ type: "NOPE" as Message["type"] });
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/Unknown message type/);
  });

  it("GET_GAME_STATE returns game state", () => {
    const data = expectOk<GameStateResponse>(send("GET_GAME_STATE"));
    expect(data.gameState).toBeDefined();
    expect(data.gameState.pageType).toBeDefined();
    expect(typeof data.gameState.detected).toBe("boolean");
  });

  it("GET_MOVE_TREE returns a tree structure without domElement", () => {
    const data = expectOk<MoveTreeResponse>(send("GET_MOVE_TREE"));
    expect(data.moveTree).toBeDefined();
    expect(data.moveTree.nodes).toBeDefined();
    expect(Array.isArray(data.moveTree.mainLine)).toBe(true);
    for (const node of Object.values(data.moveTree.nodes)) {
      expect(node).not.toHaveProperty("domElement");
    }
  });

  it("GET_MAINLINE returns array of nodes", () => {
    const data = expectOk<MainlineResponse>(send("GET_MAINLINE"));
    expect(Array.isArray(data.mainline)).toBe(true);
    for (const node of data.mainline) {
      expect(node).not.toHaveProperty("domElement");
    }
  });

  it("GET_VARIATIONS returns array of variations", () => {
    const data = expectOk<VariationsResponse>(send("GET_VARIATIONS"));
    expect(Array.isArray(data.variations)).toBe(true);
    for (const variation of data.variations) {
      for (const move of variation.moves) {
        expect(move).not.toHaveProperty("domElement");
      }
    }
  });

  it("GET_CURRENT_POSITION returns currentNodeId and fen", () => {
    const data = expectOk<CurrentPositionResponse>(
      send("GET_CURRENT_POSITION"),
    );
    expect(data).toHaveProperty("currentNodeId");
    expect(typeof data.fen).toBe("string");
  });

  it("GET_CURRENT_NODE returns node or undefined", () => {
    const data = expectOk<CurrentNodeResponse>(send("GET_CURRENT_NODE"));
    expect(data).toHaveProperty("node");
    if (data.node) {
      expect(data.node).not.toHaveProperty("domElement");
    }
  });

  it("REFRESH triggers re-parse and returns boolean", () => {
    const data = expectOk<RefreshResponse>(send("REFRESH"));
    expect(typeof data.refreshed).toBe("boolean");
  });
});
