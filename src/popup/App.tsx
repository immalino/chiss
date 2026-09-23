import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GameState,
  MoveNode,
  MoveTree,
  Variation,
} from "../types/chess";
import type {
  CurrentPositionResponse,
  GameStateResponse,
  MoveTreeResponse,
  RefreshResponse,
  Response,
  VariationsResponse,
} from "../shared/messages";
import { log } from "../shared/logger";
import { sendToActiveTab } from "./messaging";
import { formatMoves } from "./helpers";
import { StatusHeader } from "./components/StatusHeader";
import { MainlineView } from "./components/MainlineView";
import { VariationView } from "./components/VariationView";
import { PositionView } from "./components/PositionView";
import { MoveTreeView } from "./components/MoveTreeView";
import { ActionButtons } from "./components/ActionButtons";

interface PopupData {
  gameState: GameState;
  moveTree: MoveTree;
  variations: Variation[];
  fen: string;
  currentNodeId?: string;
}

async function fetchData(): Promise<PopupData> {
  const [stateRes, treeRes, varRes, posRes] = await Promise.all([
    sendToActiveTab<GameStateResponse>({ type: "GET_GAME_STATE" }),
    sendToActiveTab<MoveTreeResponse>({ type: "GET_MOVE_TREE" }),
    sendToActiveTab<VariationsResponse>({ type: "GET_VARIATIONS" }),
    sendToActiveTab<CurrentPositionResponse>({ type: "GET_CURRENT_POSITION" }),
  ]);

  const responses: Response<unknown>[] = [stateRes, treeRes, varRes, posRes];
  const failed = responses.find((r) => !r.ok);
  if (
    failed ||
    !stateRes.data ||
    !treeRes.data ||
    !varRes.data ||
    !posRes.data
  ) {
    throw new Error(
      failed?.error ?? "Incomplete response from content script",
    );
  }

  return {
    gameState: stateRes.data.gameState,
    moveTree: treeRes.data.moveTree,
    variations: varRes.data.variations,
    fen: posRes.data.fen ?? "",
    currentNodeId: posRes.data.currentNodeId,
  };
}

export function App() {
  const [data, setData] = useState<PopupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchData();
      setData(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("popup load failed:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await sendToActiveTab<RefreshResponse>({ type: "REFRESH" });
      if (!res.ok) log.warn("REFRESH failed:", res.error);
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const mainline = useMemo<MoveNode[]>(() => {
    if (!data) return [];
    const out: MoveNode[] = [];
    for (const id of data.moveTree.mainLine) {
      const node = data.moveTree.nodes[id];
      if (node) out.push(node);
    }
    return out;
  }, [data]);

  const currentPathSans = useMemo<string[]>(() => {
    if (!data?.moveTree.currentNodeId) return [];
    const path: string[] = [];
    let node: MoveNode | undefined =
      data.moveTree.nodes[data.moveTree.currentNodeId];
    while (node && node.parentId) {
      path.unshift(node.san);
      node = data.moveTree.nodes[node.parentId];
    }
    return path;
  }, [data]);

  const currentNode = useMemo(() => {
    if (!data?.moveTree.currentNodeId) return undefined;
    return data.moveTree.nodes[data.moveTree.currentNodeId];
  }, [data]);

  const movesText = useMemo(() => formatMoves(mainline), [mainline]);

  const variationText = useMemo(() => {
    if (!data?.moveTree.currentNodeId) return "";
    const segment: MoveNode[] = [];
    let node: MoveNode | undefined =
      data.moveTree.nodes[data.moveTree.currentNodeId];
    while (node && !node.isMainLine) {
      segment.unshift(node);
      node = node.parentId ? data.moveTree.nodes[node.parentId] : undefined;
    }
    return formatMoves(segment);
  }, [data]);

  const jsonText = useMemo(() => {
    if (!data) return "";
    return JSON.stringify(
      {
        gameState: data.gameState,
        moveTree: data.moveTree,
        variations: data.variations,
        currentNodeId: data.currentNodeId,
        fen: data.fen,
      },
      null,
      2,
    );
  }, [data]);

  const currentLabel = currentNode
    ? `${currentNode.moveNumber}${
        currentNode.color === "white" ? "." : "..."
      } ${currentNode.san}`
    : "start";

  if (loading && !data) {
    return (
      <div className="w-[400px] p-4 text-sm text-slate-400">Loading…</div>
    );
  }

  return (
    <div className="w-[400px] space-y-3 p-3">
      <StatusHeader
        connected={!error}
        gameState={data?.gameState ?? null}
        moveCount={mainline.length}
        variationCount={data?.variations.length ?? 0}
      />

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            Retry
          </button>
        </div>
      )}

      {!error && data && (
        <>
          <PositionView
            fen={data.fen}
            currentNodeId={data.currentNodeId}
            currentLabel={currentLabel}
          />
          <MainlineView
            mainline={mainline}
            currentNodeId={data.currentNodeId}
          />
          <VariationView
            variations={data.variations}
            currentPathSans={currentPathSans}
          />
          <MoveTreeView
            tree={data.moveTree}
            variations={data.variations}
            currentNodeId={data.currentNodeId}
            currentPathSans={currentPathSans}
          />
          <ActionButtons
            onRefresh={handleRefresh}
            refreshing={refreshing}
            movesText={movesText}
            variationText={variationText}
            fen={data.fen}
            jsonText={jsonText}
          />
        </>
      )}
    </div>
  );
}
