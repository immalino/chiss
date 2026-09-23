import type { MoveNode, Variation } from "../types/chess";
import { log } from "../shared/logger";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    log.error("copyText failed:", err);
    return false;
  }
}

export function formatMoves(mainline: MoveNode[]): string {
  try {
    const parts: string[] = [];
    mainline.forEach((node, index) => {
      if (node.color === "white") {
        parts.push(`${node.moveNumber}.`, node.san);
        return;
      }
      const prev = mainline[index - 1];
      if (!prev || prev.color === "black") {
        parts.push(`${node.moveNumber}.`, "...");
      }
      parts.push(node.san);
    });
    return parts.join(" ");
  } catch (err) {
    log.error("formatMoves failed:", err);
    return "";
  }
}

export function endsWithSequence(
  path: string[],
  sequence: string[],
): boolean {
  if (sequence.length === 0 || sequence.length > path.length) return false;
  const offset = path.length - sequence.length;
  return sequence.every((san, i) => path[offset + i] === san);
}

export function currentIndexInVariation(
  variation: Variation,
  currentPathSans: string[],
): number {
  try {
    for (let len = variation.moves.length; len >= 1; len--) {
      const prefix = variation.moves.slice(0, len).map((m) => m.san);
      if (endsWithSequence(currentPathSans, prefix)) return len - 1;
    }
    return -1;
  } catch (err) {
    log.error("currentIndexInVariation failed:", err);
    return -1;
  }
}
