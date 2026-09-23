import type { GameState } from "../../types/chess";

export interface StatusHeaderProps {
  connected: boolean;
  gameState: GameState | null;
  moveCount: number;
  variationCount: number;
}

export function StatusHeader({
  connected,
  gameState,
  moveCount,
  variationCount,
}: StatusHeaderProps) {
  const detected = gameState?.detected ?? false;
  const statusText = !connected
    ? "Disconnected"
    : detected
      ? "Game detected"
      : "Waiting for game";
  const dotClass = !connected
    ? "h-2 w-2 rounded-full bg-red-500"
    : detected
      ? "h-2 w-2 rounded-full bg-emerald-500"
      : "h-2 w-2 rounded-full bg-amber-400";
  const pillClass = !connected
    ? "rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400"
    : detected
      ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
      : "rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-400";

  return (
    <header className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={dotClass} aria-hidden="true" />
          <h1 className="text-sm font-semibold text-slate-100">Chiss</h1>
        </div>
        <span className={pillClass}>{statusText}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>page: {gameState?.pageType ?? "unknown"}</span>
        {gameState?.gameId && <span>game: {gameState.gameId}</span>}
        <span>moves: {moveCount}</span>
        <span>variations: {variationCount}</span>
        {gameState?.gameFinished && (
          <span className="text-slate-300">finished</span>
        )}
      </div>
    </header>
  );
}
