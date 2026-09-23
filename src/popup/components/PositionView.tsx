import { useState } from "react";
import { copyText } from "../helpers";

export interface PositionViewProps {
  fen: string;
  currentNodeId?: string;
  currentLabel?: string;
}

export function PositionView({
  fen,
  currentNodeId,
  currentLabel,
}: PositionViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!fen) return;
    const ok = await copyText(fen);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Current Position
        </h2>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!fen}
          className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        >
          {copied ? "Copied!" : "Copy FEN"}
        </button>
      </div>
      <p className="font-mono text-[11px] leading-relaxed break-all text-slate-300">
        {fen || "—"}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        {currentLabel ?? (currentNodeId ? `node: ${currentNodeId}` : "start")}
      </p>
    </section>
  );
}
