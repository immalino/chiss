import type { Variation } from "../../types/chess";
import { currentIndexInVariation } from "../helpers";

export interface VariationViewProps {
  variations: Variation[];
  currentPathSans: string[];
}

function branchLabel(parentMoveId?: string): string {
  if (!parentMoveId) return "unknown branch";
  const last = parentMoveId.split(":").pop();
  return last ? `after ${last}` : "unknown branch";
}

export function VariationView({
  variations,
  currentPathSans,
}: VariationViewProps) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Variations
      </h2>
      {variations.length === 0 ? (
        <p className="text-xs text-slate-500">No variations detected.</p>
      ) : (
        <div className="max-h-36 space-y-2 overflow-y-auto">
          {variations.map((variation) => {
            const currentIndex = currentIndexInVariation(
              variation,
              currentPathSans,
            );
            return (
              <div
                key={variation.id}
                style={{ marginLeft: `${(variation.depth - 1) * 12}px` }}
                className="border-l-2 border-slate-700 pl-2"
              >
                <div className="text-[11px] text-slate-500">
                  {variation.source} · {branchLabel(variation.parentMoveId)} ·
                  depth {variation.depth}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {variation.moves.map((move, index) => {
                    const isCurrent = index === currentIndex;
                    const className = isCurrent
                      ? "rounded bg-amber-400 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900"
                      : "rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-300";
                    return (
                      <span
                        key={`${variation.id}:${index}`}
                        className={className}
                      >
                        {move.color === "white" ? `${move.moveNumber}. ` : ""}
                        {move.san}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
