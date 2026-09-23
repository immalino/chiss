import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { ParsedMove, Variation } from "../src/types/chess";
import { buildMoveTree } from "../src/chess/moveTree";
import { buildFenForTree } from "../src/chess/positionBuilder";
import { log } from "../src/shared/logger";

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
): Variation {
  return { id, parentMoveId, moves, depth, source: "variation" };
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

function line(sans: string[]): ParsedMove[] {
  return sans.map((san, i) =>
    ply(san, Math.floor(i / 2) + 1, i % 2 === 0 ? "white" : "black"),
  );
}

function rankFiles(rank: string): string[] {
  const files: string[] = [];
  for (const ch of rank) {
    if (ch >= "1" && ch <= "8") {
      for (let i = 0; i < Number(ch); i++) files.push("");
    } else {
      files.push(ch);
    }
  }
  return files;
}

function replay(sans: string[]): string[] {
  const chess = new Chess();
  const fens: string[] = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildFenForTree — root", () => {
  it("sets starting FEN on root", () => {
    const tree = buildMoveTree([ply("e4", 1, "white")]);
    buildFenForTree(tree);
    expect(tree.nodes["root"].fen).toBe(new Chess().fen());
    expect(tree.nodes["root"].fen.split(" ")[0]).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    );
  });

  it("handles root-only tree without crash", () => {
    const tree = buildMoveTree([]);
    expect(() => buildFenForTree(tree)).not.toThrow();
    expect(tree.nodes["root"].fen).toBe(new Chess().fen());
    expect(tree.root?.fen).toBe(new Chess().fen());
  });

  it("handles null-root tree without crash", () => {
    const tree = { root: null, nodes: {}, mainLine: [] };
    expect(() => buildFenForTree(tree)).not.toThrow();
  });
});

describe("buildFenForTree — mainline", () => {
  it("generates correct FEN per ply for linear mainline", () => {
    const sans = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];
    const tree = buildMoveTree(line(sans));
    buildFenForTree(tree);

    const expected = replay(sans);
    expect(tree.nodes["root"].fen).toBe(expected[0]);
    tree.mainLine.forEach((id, i) => {
      expect(tree.nodes[id].fen).toBe(expected[i + 1]);
    });
    expect(tree.nodes[tree.mainLine[tree.mainLine.length - 1]].fen).not.toBe(
      "",
    );
  });

  it("is idempotent — second run yields identical FENs", () => {
    const tree = buildMoveTree(
      line(["e4", "e5", "Nf3", "Nc6"]),
      [variation("v1", "root:e4", [varMove("c5", 1, "black")])],
    );
    buildFenForTree(tree);
    const first = Object.fromEntries(
      Object.entries(tree.nodes).map(([id, n]) => [id, n.fen]),
    );

    buildFenForTree(tree);
    const second = Object.fromEntries(
      Object.entries(tree.nodes).map(([id, n]) => [id, n.fen]),
    );

    expect(second).toEqual(first);
    expect(Object.values(first).every((fen) => fen !== "")).toBe(true);
  });
});

describe("buildFenForTree — variations", () => {
  it("builds variation FEN from its own parent, not linear mainline", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black"), ply("d4", 2, "white")],
      [variation("v1", "root:e4", [varMove("c5", 1, "black")])],
    );
    buildFenForTree(tree);

    expect(tree.nodes["root:e4:c5"].fen).toBe(replay(["e4", "c5"])[2]);
    expect(tree.nodes["root:e4:e5:d4"].fen).toBe(
      replay(["e4", "e5", "d4"])[3],
    );
    expect(tree.nodes["root:e4:c5"].fen).not.toBe(
      tree.nodes["root:e4:e5"].fen,
    );
  });

  it("builds nested variation (depth 2) FEN from its variation parent", () => {
    const tree = buildMoveTree(
      [ply("e4", 1, "white"), ply("e5", 1, "black"), ply("Nf3", 2, "white")],
      [
        variation("v1", "root:e4", [
          varMove("c5", 1, "black", { domElement: fakeEl("v-c5") }),
        ]),
        variation("v2", "v-c5", [varMove("Nc3", 2, "white")], 2),
      ],
    );
    buildFenForTree(tree);

    expect(tree.nodes["root:e4:c5"].fen).toBe(replay(["e4", "c5"])[2]);
    expect(tree.nodes["root:e4:c5:Nc3"].fen).toBe(
      replay(["e4", "c5", "Nc3"])[3],
    );
  });
});

describe("buildFenForTree — failures", () => {
  it("skips illegal SAN: fen stays empty, no throw, logged", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    const tree = buildMoveTree([
      ply("e4", 1, "white"),
      ply("d4", 1, "black"),
    ]);

    expect(() => buildFenForTree(tree)).not.toThrow();
    expect(tree.nodes["root:e4"].fen).toBe(replay(["e4"])[1]);
    expect(tree.nodes["root:e4:d4"].fen).toBe("");

    expect(log.warn).toHaveBeenCalledWith(
      "MoveParseError:",
      expect.objectContaining({ san: "d4", moveIndex: 1 }),
    );
  });

  it("skips children when parent FEN is empty", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    const tree = buildMoveTree([
      ply("e4", 1, "white"),
      ply("d4", 1, "black"),
      ply("Nf3", 2, "white"),
    ]);

    expect(() => buildFenForTree(tree)).not.toThrow();
    expect(tree.nodes["root:e4:d4"].fen).toBe("");
    expect(tree.nodes["root:e4:d4:Nf3"].fen).toBe("");
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('parent FEN unavailable for "root:e4:d4:Nf3"'),
    );
  });
});

describe("buildFenForTree — special moves", () => {
  it("handles kingside castling: rook moves, castling rights lost", () => {
    const sans = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"];
    const tree = buildMoveTree(line(sans));
    buildFenForTree(tree);

    const fen = tree.nodes["root:e4:e5:Nf3:Nc6:Bc4:Bc5:O-O"].fen;
    expect(fen).toBe(replay(sans)[sans.length]);

    const [placement, , rights] = fen.split(" ");
    const rank1 = rankFiles(placement.split("/")[7]);
    expect(rank1[6]).toBe("K"); // king g1
    expect(rank1[5]).toBe("R"); // rook f1
    expect(rank1[0]).toBe("R"); // a1 rook untouched
    expect(rights).toBe("kq"); // white lost both K and Q rights
  });

  it("handles queenside castling: rook to d1, king to c1", () => {
    const sans = ["d4", "d5", "Nc3", "Nf6", "Bf4", "Bg4", "Qd2", "e6", "O-O-O"];
    const tree = buildMoveTree(line(sans));
    buildFenForTree(tree);

    const fen = tree.nodes[
      "root:d4:d5:Nc3:Nf6:Bf4:Bg4:Qd2:e6:O-O-O"
    ].fen;
    expect(fen).toBe(replay(sans)[sans.length]);

    const [placement, , rights] = fen.split(" ");
    const rank1 = rankFiles(placement.split("/")[7]);
    expect(rank1[2]).toBe("K"); // king c-file
    expect(rank1[3]).toBe("R"); // rook d-file
    expect(rank1[0]).toBe(""); // a1 rook moved away
    expect(rights).toBe("kq");
  });

  it("handles promotion — pawn becomes queen in FEN", () => {
    const sans = [
      "e4",
      "d5",
      "exd5",
      "c6",
      "dxc6",
      "Nf6",
      "cxb7",
      "e6",
      "bxa8=Q",
    ];
    const tree = buildMoveTree(line(sans));
    buildFenForTree(tree);

    const fen =
      tree.nodes[
        "root:e4:d5:exd5:c6:dxc6:Nf6:cxb7:e6:bxa8=Q"
      ].fen;
    expect(fen).toBe(replay(sans)[sans.length]);

    const rank8 = fen.split("/")[0];
    expect(rank8[0]).toBe("Q"); // white queen on a8
  });
});
