import type { GameState, MoveTree, MoveNode, Variation } from "../types/chess";

export type MessageType =
  | "GET_GAME_STATE"
  | "GET_MOVE_TREE"
  | "GET_MAINLINE"
  | "GET_VARIATIONS"
  | "GET_CURRENT_POSITION"
  | "GET_CURRENT_NODE"
  | "REFRESH"
  | "MOVE_TREE_UPDATED";

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface Response<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface GameStateResponse {
  gameState: GameState;
}

export interface MoveTreeResponse {
  moveTree: MoveTree;
}

export interface MainlineResponse {
  mainline: MoveNode[];
}

export interface VariationsResponse {
  variations: Variation[];
}

export interface CurrentPositionResponse {
  currentNodeId?: string;
  fen?: string;
}

export interface CurrentNodeResponse {
  node?: MoveNode;
}
