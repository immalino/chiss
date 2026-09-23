import type { MoveNode } from "../../types/chess";

export interface MainlineViewProps {
  mainline: MoveNode[];
  currentNodeId?: string;
}

interface Row {
  moveNumber: number;
  white?: MoveNode;
  black?: MoveNode;
}

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

function MoveChip({
  node,
  currentNodeId,
}: {
  node?: MoveNode;
  currentNodeId?: string;
}) {
  if (!node) return <span className="inline-block w-14" />;
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

export function MainlineView({
  mainline,
  currentNodeId,
}: MainlineViewProps) {
  const rows = buildRows(mainline);

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Main Line
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No moves yet.</p>
      ) : (
        <ol className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {rows.map((row) => (
            <li key={row.moveNumber} className="flex items-center gap-2">
              <span className="w-8 text-right font-mono text-xs text-slate-500">
                {row.moveNumber}.
              </span>
              <MoveChip node={row.white} currentNodeId={currentNodeId} />
              <MoveChip node={row.black} currentNodeId={currentNodeId} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
