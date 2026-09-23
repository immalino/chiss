export interface MoveNode {
  id: string;
  moveIndex: number;
  moveNumber: number;
  color: "white" | "black";
  san: string;
  fen: string;
  uci?: string;
  isMainLine: boolean;
  parentId?: string;
  children: string[];
  variationDepth: number;
  source: "mainline" | "variation" | "exploration" | "engine";
  isCurrent: boolean;
  domElement?: HTMLElement;
}

export interface MoveTree {
  root: MoveNode | null;
  nodes: Record<string, MoveNode>;
  mainLine: string[];
  currentNodeId?: string;
  currentVariation?: string[];
}

export interface ParsedMove {
  moveNumber: number;
  color: "white" | "black";
  san: string;
  domElement?: HTMLElement;
  source: "mainline";
}

export interface Variation {
  id: string;
  parentMoveId?: string;
  moves: ParsedMove[];
  depth: number;
  source: "variation" | "exploration";
}

export interface GameState {
  detected: boolean;
  gameId?: string;
  gameFinished?: boolean;
  pageType: "game" | "review" | "analysis" | "unknown";
}

export interface MoveParseError {
  san: string;
  moveIndex: number;
  reason: string;
  domElement?: HTMLElement;
}
