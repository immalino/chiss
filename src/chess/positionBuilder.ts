import type { MoveTree } from "../types/chess";
import { log } from "../shared/logger";
import { createChess, tryMove } from "./moveParser";

export function buildFenForTree(tree: MoveTree): void {
  try {
    if (!tree.root) {
      log.warn("buildFenForTree: tree has no root — skipped");
      return;
    }

    tree.root.fen = createChess().fen();

    const queue: string[] = [...tree.root.children];
    let filled = 0;
    let skipped = 0;

    while (queue.length > 0) {
      const id = queue.shift() as string;
      const node = tree.nodes[id];
      if (!node) {
        log.warn(`buildFenForTree: node "${id}" missing from tree — skipped`);
        skipped++;
        continue;
      }

      queue.push(...node.children);
      node.fen = "";

      const parent = node.parentId ? tree.nodes[node.parentId] : undefined;
      if (!parent?.fen) {
        log.warn(
          `buildFenForTree: parent FEN unavailable for "${id}" — skipped`,
        );
        skipped++;
        continue;
      }

      try {
        const chess = createChess(parent.fen);
        const moved = tryMove(chess, node.san, node.moveIndex, node.domElement);
        if (!moved) {
          skipped++;
          continue;
        }
        node.fen = chess.fen();
        filled++;
      } catch (err) {
        log.error(`buildFenForTree: failed to build FEN for "${id}":`, err);
        skipped++;
      }
    }

    log.info(`FEN built: ${filled} filled, ${skipped} skipped`);
  } catch (err) {
    log.error("buildFenForTree failed:", err);
  }
}
