import { useState } from "react";
import { copyText } from "../helpers";

export interface ActionButtonsProps {
  onRefresh: () => void;
  refreshing: boolean;
  movesText: string;
  variationText: string;
  fen: string;
  jsonText: string;
}

type CopyKey = "moves" | "variation" | "fen" | "json";

export function ActionButtons({
  onRefresh,
  refreshing,
  movesText,
  variationText,
  fen,
  jsonText,
}: ActionButtonsProps) {
  const [copiedKey, setCopiedKey] = useState<CopyKey | null>(null);

  const handleCopy = async (key: CopyKey, text: string) => {
    if (!text) return;
    const ok = await copyText(text);
    if (!ok) return;
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const buttonClass =
    "flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={buttonClass}
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("moves", movesText)}
        disabled={!movesText}
        className={buttonClass}
      >
        {copiedKey === "moves" ? "Copied!" : "Copy Moves"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("variation", variationText)}
        disabled={!variationText}
        className={buttonClass}
        title="Copy moves of the active variation (branch point to current move)"
      >
        {copiedKey === "variation" ? "Copied!" : "Copy Variation"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("fen", fen)}
        disabled={!fen}
        className={buttonClass}
      >
        {copiedKey === "fen" ? "Copied!" : "Copy FEN"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("json", jsonText)}
        disabled={!jsonText}
        className={buttonClass}
      >
        {copiedKey === "json" ? "Copied!" : "Copy JSON"}
      </button>
    </div>
  );
}
