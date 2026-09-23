import { describe, expect, it } from "vitest";
import type { MoveTree, ParsedMove, Variation } from "../src/types/chess";
import {
  ROOT_ID,
  addNode,
  buildMoveTree,
  createRootNode,
  findNode,
  makeNodeId,
} from "../src/chess/moveTree";

function ply(
  san: string,
  moveNumber: number,
  color: "white" | "black",
  overrides: Partial<ParsedMove> = {},
): ParsedMove {
  return { moveNumber, color, san, source: "mainline", ...overrides };
}

function varMove(
  san: string,
  moveNumber: number,
  color: "white" | "black",
  overrides: Partial<ParsedMove> = {},
): ParsedMove {
  return { moveNumber, color, san, source: "variation", ...overrides };
}

function variation(
  id: string,
  parentMoveId: string | undefined,
  moves: ParsedMove[],
  depth = 1,
  source: "variation" | "exploration" = "variation",
): Variation {
  return { id, parentMoveId, moves, depth, source };
}

function fakeEl(dataNode?: string): HTMLElement {
  return {
    hasAttribute: (name: string) =>
      name === "data-node" && dataNode !== undefined,
    getAttribute: (name: string) =>
      name === "data-node" ? (dataNode ?? null) : null,
    closest: () => null,
    querySelector: () => null,
  } as unknown as HTMLElement;
}

describe("makeNodeId", () => {
  it("builds deterministic path-based ids", () => {
    expect(makeNodeId(ROOT_ID, "e4")).toBe("root:e4");
    expect(makeNodeId("root:e4", "e6")).toBe("root:e4:e6");
    expect(makeNodeId("root:e4:e6:d4", "d5")).toBe("root:e4:e6:d4:d5");
  });
});

describe("findNode / addNode", () => {
  it("adds a node under its parent and finds it by id", () => {
    const tree = buildMoveTree([ply("e4", 1, "white")]);
    const node = findNode(tree, "root:e4");
    expect(node?.san).toBe("e4");
    expect(node?.parentId).toBe(ROOT_ID);
    expect(tree.nodes[ROOT_ID].children).toContain("root:e4");
  });

  it("deduplicates when adding the same (parentId + san) twice", () => {
    const tree: MoveTree = { root: null, nodes: {}, mainLine: [] };
    const root = createRootNode();
    tree.root = root;
    tree.nodes[ROOT_ID] = root;

    const first = addNode(
      tree,
      {
        id: "root:e4",
        moveIndex: 0,
        moveNumber: 1,
        color: "white",
        san: "e4",
        fen: "",
        isMainLine: true,
        parentId: ROOT_ID,
        children: [],
        variationDepth: 0,
        source: "mainline",
        isCurrent: false,
      },
      ROOT_ID,
    );
    const second = addNode(
      tree,
      {
        id: "root:e4",
        moveIndex: 0,
        moveNumber: 1,
        color: "white",
        san: "e4",
        fen: "",
        isMainLine: true,
        parentId: ROOT_ID,
        children: [],
        variationDepth: 0,
        source: "mainline",
        isCurrent: false,
      },
      ROOT_ID,
    );

    expect(second).toBe(first);
    expect(root.children).toHaveLength(1);
    expect(Object.keys(tree.nodes)).toHaveLength(2);
  });
});

describe("buildMoveTree — mainline", () => {
  it("creates root-only tree for empty input", () => {
    const tree = buildMoveTree([]);
    expect(tree.root?.id).toBe(ROOT_ID);
    expect(tree.mainLine).toEqual([]);
    expect(Object.keys(tree.nodes)).toEqual([ROOT_ID]);
  });

  it("builds linear mainline with deterministic ids and metadata", () => {
    const tree = buildMoveTree([
      ply("e4", 1, "white"),
      ply("e5", 1, "black"),
      ply("d4", 2, "white"),
      ply("d5", 2, "black"),
    ]);

    expect(tree.mainLine).toEqual([
      "root:e4",
      "root:e4:e5",
      "root:e4:e5:d4",
      "root:e4:e5:d4:d5",
    ]);

    const last = findNode(tree, "root:e4:e5:d4:d5");
    expect(last?.moveIndex).toBe(3);
    expect(last?.moveNumber).toBe(2);
    expect(last?.color).toBe("black");
    expect(last?.isMainLine).toBe(true);
    expect(last?.variationDepth).toBe(0);
    expect(last?.source).toBe("mainline");
    expect(last?.parentId).toBe("root:e4:e5:d4");
    expect(findNode(tree, "root:e4")?.moveIndex).toBe(0);
  });

  it("handles castling SAN in ids", () => {
    const tree = buildMoveTree([
      ply("e4", 1, "white"),
      ply("e5", 1, "black"),
      ply("Nf3", 2, "white"),
      ply("Nc6", 2, "black"),
      ply("Bc4", 3, "white"),
      ply("Bc5", 3, "black"),
      ply("O-O", 4, "white"),
    ]);
    expect(tree.mainLine).toContain("root:e4:e5:Nf3:Nc6:Bc4:Bc5:O-O");
    expect(tree.nodes["root:e4:e5:Nf3:Nc6:Bc4:Bc5:O-O"]).toBeDefined();
  });

  it("keeps mainline linear when variation branches off mid-line", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black"), ply("d4", 2, "white")],
      [variation("v1", "root:e4", [varMove("c5", 1, "black")])],
    );

    expect(tree.mainLine).toEqual([
      "root:e4",
      "root:e4:e5",
      "root:e4:e5:d4",
    ]);
    expect(tree.nodes["root:e4:c5"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.children).toEqual([
      "root:e4:e5",
      "root:e4:c5",
    ]);
  });
});

describe("buildMoveTree — variations", () => {
  it("attaches variation via parentMoveId data-node mapping", () => {
    const tree = buildMoveTree(
      [
        ply("e4", 1, "white", { domElement: fakeEl("1-a") }),
        ply("e5", 1, "black"),
      ],
      [variation("v1", "1-a", [varMove("c5", 1, "black")])],
    );

    expect(tree.nodes["root:e4:c5"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.children).toContain("root:e4:c5");
    const varNode = findNode(tree, "root:e4:c5");
    expect(varNode?.isMainLine).toBe(false);
    expect(varNode?.variationDepth).toBe(1);
    expect(varNode?.source).toBe("variation");
    expect(varNode?.parentId).toBe("root:e4");
  });

  it("attaches depth-1 variation via move-number heuristic when parentMoveId missing", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black")],
      [variation("v1", undefined, [varMove("c5", 1, "black")])],
    );

    expect(tree.nodes["root:e4:c5"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.children).toContain("root:e4:c5");
  });

  it("attaches white-to-move variation via heuristic to preceding black mainline move", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black"), ply("Nf3", 2, "white")],
      [variation("v1", undefined, [varMove("Nc3", 2, "white")])],
    );

    expect(tree.nodes["root:e4:e5:Nc3"]).toBeDefined();
    expect(findNode(tree, "root:e4:e5")?.children).toContain("root:e4:e5:Nc3");
  });

  it("supports multiple branches from the same parent", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black")],
      [
        variation("v1", "root:e4", [varMove("c5", 1, "black")]),
        variation("v2", "root:e4", [varMove("e6", 1, "black")]),
      ],
    );

    expect(tree.nodes["root:e4:c5"]).toBeDefined();
    expect(tree.nodes["root:e4:e6"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.children).toEqual([
      "root:e4:e5",
      "root:e4:c5",
      "root:e4:e6",
    ]);
  });

  it("merges variation move identical to mainline continuation (no duplicate node)", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black")],
      [variation("v1", "root:e4", [varMove("e5", 1, "black")])],
    );

    expect(tree.nodes["root:e4:e5"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.children).toEqual(["root:e4:e5"]);
    expect(Object.keys(tree.nodes)).toHaveLength(3);
  });

  it("attaches nested variation (depth 2) to its variation parent", () => {
    const tree = buildMoveTree(
      [
        ply("e4", 1, "white"),
        ply("e5", 1, "black"),
        ply("Nf3", 2, "white"),
      ],
      [
        variation("v1", "root:e4", [
          varMove("c5", 1, "black", { domElement: fakeEl("v-c5") }),
        ]),
        variation("v2", "v-c5", [varMove("Nc3", 2, "white")], 2),
      ],
    );

    expect(tree.nodes["root:e4:c5"]).toBeDefined();
    expect(tree.nodes["root:e4:c5:Nc3"]).toBeDefined();
    expect(findNode(tree, "root:e4:c5:Nc3")?.variationDepth).toBe(2);
    expect(findNode(tree, "root:e4:c5")?.children).toContain("root:e4:c5:Nc3");
  });

  it("skips nested variation when parent cannot be resolved", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black")],
      [variation("v2", "does-not-exist", [varMove("Nf3", 2, "white")], 2)],
    );

    expect(tree.nodes["root:e4:e5:Nf3"]).toBeUndefined();
    expect(tree.mainLine).toEqual(["root:e4", "root:e4:e5"]);
  });

  it("attaches depth-1 variation to root when mainline empty and first move is white's move 1", () => {
    const tree = buildMoveTree(
      [],
      [variation("v1", "missing", [varMove("e4", 1, "white")])],
    );

    expect(tree.mainLine).toEqual([]);
    expect(tree.nodes["root:e4"]).toBeDefined();
    expect(findNode(tree, "root:e4")?.isMainLine).toBe(false);
    expect(findNode(tree, "root:e4")?.parentId).toBe(ROOT_ID);
  });

  it("skips variation when heuristic also fails to resolve parent", () => {
    const tree = buildMoveTree(
      [],
      [variation("v1", "missing", [varMove("c5", 1, "black")])],
    );

    expect(Object.keys(tree.nodes)).toEqual([ROOT_ID]);
    expect(tree.nodes["root:c5"]).toBeUndefined();
  });

  it("marks exploration source from move source", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white")],
      [
        variation("v1", "root:e4", [
          varMove("c5", 1, "black", { source: "exploration" }),
        ]),
      ],
    );

    expect(findNode(tree, "root:e4:c5")?.source).toBe("exploration");
  });
});

describe("buildMoveTree — current state", () => {
  it("has no current node when nothing is active", () => {
    const tree = buildMoveTree([ply("e4", 1, "white")]);
    expect(tree.currentNodeId).toBeUndefined();
    expect(tree.currentVariation).toBeUndefined();
    expect(findNode(tree, "root:e4")?.isCurrent).toBe(false);
  });

  it("marks active mainline move as current", () => {
    const tree = buildMoveTree([
      ply("e4", 1, "white"),
      ply("e5", 1, "black", { isActive: true }),
    ]);

    expect(tree.currentNodeId).toBe("root:e4:e5");
    expect(findNode(tree, "root:e4:e5")?.isCurrent).toBe(true);
    expect(findNode(tree, "root:e4")?.isCurrent).toBe(false);
    expect(tree.currentVariation).toBeUndefined();
  });

  it("prefers active variation move and builds currentVariation path", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black")],
      [
        variation("v1", "root:e4", [
          varMove("c5", 1, "black"),
          varMove("Nc3", 2, "white", { isActive: true }),
        ]),
      ],
    );

    expect(tree.currentNodeId).toBe("root:e4:c5:Nc3");
    expect(tree.currentVariation).toEqual([
      "root:e4",
      "root:e4:c5",
      "root:e4:c5:Nc3",
    ]);
    expect(findNode(tree, "root:e4:c5:Nc3")?.isCurrent).toBe(true);
    expect(findNode(tree, "root:e4")?.isCurrent).toBe(false);
  });

  it("resolves only one current node when multiple actives exist", () => {
    const tree = buildMoveTree([
      ply("e4", 1, "white", { isActive: true }),
      ply("e5", 1, "black", { isActive: true }),
    ]);

    expect(tree.currentNodeId).toBe("root:e4:e5");
    const currents = Object.values(tree.nodes).filter((n) => n.isCurrent);
    expect(currents).toHaveLength(1);
  });
});
