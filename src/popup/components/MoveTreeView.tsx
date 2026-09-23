import type { MoveNode, MoveTree, Variation } from "../../types/chess";
import { currentIndexInVariation } from "../helpers";

export interface MoveTreeViewProps {
  tree: MoveTree | null;
  variations: Variation[];
  currentNodeId?: string;
  currentPathSans: string[];
}

interface Row {
  moveNumber: number;
  white?: MoveNode;
  black?: MoveNode;
}

const INDENT_PX = 14;
const BASE_INDENT_PX = 40;

function buildRows(mainline: MoveNode[]): Row[] {
  const rows: Row[] = [];
  for (const node of mainline) {
    let row = rows.find((r) => r.moveNumber === node.moveNumber);
    if (!row) {
      row = { moveNumber: node.moveNumber };
      rows.push(row);
    }
    if (node.color === "white") row.white = node;
    else row.black = node;
  }
  return rows;
}

function groupByMoveNumber(variations: Variation[]): Map<number, Variation[]> {
  const map = new Map<number, Variation[]>();
  for (const variation of variations) {
    const first = variation.moves[0];
    if (!first) continue;
    const list = map.get(first.moveNumber) ?? [];
    list.push(variation);
    map.set(first.moveNumber, list);
  }
  return map;
}

function MoveChip({
  node,
  currentNodeId,
}: {
  node: MoveNode;
  currentNodeId?: string;
}) {
  const isCurrent = node.id === currentNodeId;
  const className = isCurrent
    ? "inline-flex w-14 justify-center rounded bg-amber-400 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900"
    : "inline-flex w-14 justify-center rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-200";
  return (
    <span className={className} title={node.id}>
      {node.san}
    </span>
  );
}

function VariationLine({
  variation,
  currentPathSans,
}: {
  variation: Variation;
  currentPathSans: string[];
}) {
  const currentIndex = currentIndexInVariation(variation, currentPathSans);
  const indent = BASE_INDENT_PX + (Math.max(variation.depth, 1) - 1) * INDENT_PX;

  return (
    <div
      style={{ paddingLeft: `${indent}px` }}
      className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5"
    >
      {variation.moves.map((move, index) => {
        let prefix = "";
        if (move.color === "white") {
          prefix = `${move.moveNumber}.`;
        } else if (index === 0) {
          prefix = `${move.moveNumber}. ...`;
        }
        const isCurrent = index === currentIndex;
        const sanClass = isCurrent
          ? "rounded bg-amber-400 px-1 font-semibold text-slate-900"
          : "text-slate-400";
        return (
          <span
            key={`${variation.id}:${index}`}
            className="whitespace-nowrap font-mono text-xs"
          >
            {prefix && <span className="mr-1 text-slate-500">{prefix}</span>}
            <span className={sanClass}>{move.san}</span>
          </span>
        );
      })}
    </div>
  );
}

export function MoveTreeView({
  tree,
  variations,
  currentNodeId,
  currentPathSans,
}: MoveTreeViewProps) {
  const mainline: MoveNode[] = [];
  if (tree) {
    for (const id of tree.mainLine) {
      const node = tree.nodes[id];
      if (node) mainline.push(node);
    }
  }

  const rows = buildRows(mainline);
  const byMove = groupByMoveNumber(variations);
  const rowNumbers = new Set(rows.map((r) => r.moveNumber));
  const orphans = variations
    .filter((v) => {
      const first = v.moves[0];
      return first && !rowNumbers.has(first.moveNumber);
    })
    .sort((a, b) => (a.moves[0]?.moveNumber ?? 0) - (b.moves[0]?.moveNumber ?? 0));

  const isEmpty = rows.length === 0 && variations.length === 0;

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Move Tree
      </h2>
      {isEmpty ? (
        <p className="text-xs text-slate-500">Tree is empty.</p>
      ) : (
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {rows.map((row) => {
            const rowVars = byMove.get(row.moveNumber) ?? [];
            const whiteVars = rowVars.filter(
              (v) => v.moves[0]?.color === "white",
            );
            const blackVars = rowVars.filter(
              (v) => v.moves[0]?.color !== "white",
            );
            const hasWhiteVar = whiteVars.length > 0;
            return (
              <div key={`row-${row.moveNumber}`}>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-slate-500">
                    {row.moveNumber}.
                  </span>
                  {row.white ? (
                    <MoveChip node={row.white} currentNodeId={currentNodeId} />
                  ) : (
                    <span className="inline-flex w-14 justify-center font-mono text-xs text-slate-500">
                      ...
                    </span>
                  )}
                  {hasWhiteVar || !row.black ? (
                    <span className="inline-flex w-14 justify-center font-mono text-xs text-slate-500">
                      ...
                    </span>
                  ) : (
                    <MoveChip node={row.black} currentNodeId={currentNodeId} />
                  )}
                </div>
                {whiteVars.map((variation) => (
                  <VariationLine
                    key={variation.id}
                    variation={variation}
                    currentPathSans={currentPathSans}
                  />
                ))}
                {hasWhiteVar && row.black && (
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-slate-500">
                      {row.moveNumber}.
                    </span>
                    <span className="inline-flex w-14 justify-center font-mono text-xs text-slate-500">
                      ...
                    </span>
                    <MoveChip node={row.black} currentNodeId={currentNodeId} />
                  </div>
                )}
                {blackVars.map((variation) => (
                  <VariationLine
                    key={variation.id}
                    variation={variation}
                    currentPathSans={currentPathSans}
                  />
                ))}
              </div>
            );
          })}
          {orphans.map((variation) => (
            <VariationLine
              key={variation.id}
              variation={variation}
              currentPathSans={currentPathSans}
            />
          ))}
        </div>
      )}
    </section>
  );
}
