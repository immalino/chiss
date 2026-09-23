import type { MoveNode, MoveTree, ParsedMove, Variation } from "../types/chess";
import { log } from "../shared/logger";

export const ROOT_ID = "root";

export function makeNodeId(parentId: string, san: string): string {
  return `${parentId}:${san}`;
}

export function createRootNode(): MoveNode {
  return {
    id: ROOT_ID,
    moveIndex: -1,
    moveNumber: 0,
    color: "white",
    san: "",
    fen: "",
    isMainLine: true,
    parentId: undefined,
    children: [],
    variationDepth: 0,
    source: "mainline",
    isCurrent: false,
  };
}

export function findNode(tree: MoveTree, id: string): MoveNode | undefined {
  return tree.nodes[id];
}

export function addNode(
  tree: MoveTree,
  node: MoveNode,
  parentId?: string,
): MoveNode {
  const existing = tree.nodes[node.id];
  if (existing) return existing;

  const pid = parentId ?? node.parentId;
  if (pid) node.parentId = pid;

  tree.nodes[node.id] = node;

  if (node.parentId) {
    const parent = tree.nodes[node.parentId];
    if (parent && !parent.children.includes(node.id)) {
      parent.children.push(node.id);
    }
  }

  return node;
}

function extractDataNode(el?: HTMLElement): string | null {
  if (!el) return null;
  if (el.hasAttribute("data-node")) return el.getAttribute("data-node");
  const ancestor = el.closest<HTMLElement>("[data-node]");
  if (ancestor) return ancestor.getAttribute("data-node");
  const descendant = el.querySelector<HTMLElement>("[data-node]");
  if (descendant) return descendant.getAttribute("data-node");
  return null;
}

function registerDataNode(node: MoveNode, map: Map<string, string>): void {
  const key = extractDataNode(node.domElement);
  if (key && !map.has(key)) map.set(key, node.id);
}

function findMainlineMove(
  tree: MoveTree,
  moveNumber: number,
  color: ParsedMove["color"],
): MoveNode | undefined {
  for (const id of tree.mainLine) {
    const node = tree.nodes[id];
    if (node.moveNumber === moveNumber && node.color === color) return node;
  }
  return undefined;
}

function heuristicParent(tree: MoveTree, first: ParsedMove): MoveNode | undefined {
  if (first.color === "black") {
    return findMainlineMove(tree, first.moveNumber, "white");
  }
  if (first.moveNumber <= 1) return tree.nodes[ROOT_ID];
  return findMainlineMove(tree, first.moveNumber - 1, "black");
}

function resolveVariationParent(
  variation: Variation,
  tree: MoveTree,
  dataNodeMap: Map<string, string>,
): MoveNode | undefined {
  const first = variation.moves[0];
  if (!first) return undefined;

  if (variation.parentMoveId) {
    const mappedId = dataNodeMap.get(variation.parentMoveId);
    const mapped = mappedId ? tree.nodes[mappedId] : undefined;
    if (mapped) return mapped;
    log.warn(
      `Variation ${variation.id}: parentMoveId "${variation.parentMoveId}" not found in tree`,
    );
  }

  if (variation.depth >= 2) {
    log.warn(
      `Variation ${variation.id}: nested variation (depth=${variation.depth}) without resolvable parent — skipped`,
    );
    return undefined;
  }

  const parent = heuristicParent(tree, first);
  if (!parent) {
    log.warn(`Variation ${variation.id}: could not resolve parent — skipped`);
  }
  return parent;
}

function pathToRoot(tree: MoveTree, nodeId: string): string[] {
  const path: string[] = [];
  let current: MoveNode | undefined = tree.nodes[nodeId];
  while (current && current.id !== ROOT_ID) {
    path.unshift(current.id);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path;
}

export function buildMoveTree(
  mainline: ParsedMove[],
  variations: Variation[] = [],
): MoveTree {
  try {
    const tree: MoveTree = {
      root: null,
      nodes: {},
      mainLine: [],
    };

    const root = createRootNode();
    tree.root = root;
    tree.nodes[ROOT_ID] = root;

    const dataNodeMap = new Map<string, string>();
    let mainlineActiveId: string | undefined;
    const variationActiveIds: string[] = [];

    let parentId = ROOT_ID;
    mainline.forEach((move, index) => {
      if (!move.san) {
        log.warn(`Move tree: empty SAN at mainline index ${index} — skipped`);
        return;
      }

      const id = makeNodeId(parentId, move.san);
      const node = addNode(
        tree,
        {
          id,
          moveIndex: index,
          moveNumber:
            move.moveNumber > 0 ? move.moveNumber : Math.floor(index / 2) + 1,
          color: move.color,
          san: move.san,
          fen: "",
          isMainLine: true,
          parentId,
          children: [],
          variationDepth: 0,
          source: "mainline",
          isCurrent: false,
          domElement: move.domElement,
        },
        parentId,
      );

      parentId = node.id;
      if (!tree.mainLine.includes(node.id)) tree.mainLine.push(node.id);
      registerDataNode(node, dataNodeMap);
      if (move.isActive) {
        node.isCurrent = true;
        mainlineActiveId = node.id;
      }
    });

    let attached = 0;
    let skipped = 0;

    for (const variation of variations) {
      if (variation.moves.length === 0) {
        skipped++;
        continue;
      }

      const parent = resolveVariationParent(variation, tree, dataNodeMap);
      if (!parent) {
        skipped++;
        continue;
      }

      const depth = Math.max(variation.depth, 1);
      let varParentId = parent.id;
      let nextMoveIndex = parent.moveIndex + 1;

      for (const move of variation.moves) {
        if (!move.san) {
          log.warn(`Variation ${variation.id}: empty SAN — skipped move`);
          continue;
        }

        const id = makeNodeId(varParentId, move.san);
        const source: MoveNode["source"] =
          move.source === "variation" || move.source === "exploration"
            ? move.source
            : variation.source;

        const node = addNode(
          tree,
          {
            id,
            moveIndex: nextMoveIndex,
            moveNumber:
              move.moveNumber > 0
                ? move.moveNumber
                : Math.floor(nextMoveIndex / 2) + 1,
            color: move.color,
            san: move.san,
            fen: "",
            isMainLine: false,
            parentId: varParentId,
            children: [],
            variationDepth: depth,
            source,
            isCurrent: false,
            domElement: move.domElement,
          },
          varParentId,
        );

        if (move.isActive) {
          node.isCurrent = true;
          variationActiveIds.push(node.id);
        }

        varParentId = node.id;
        nextMoveIndex = node.moveIndex + 1;
        registerDataNode(node, dataNodeMap);
      }

      attached++;
    }

    const currentNodeId =
      variationActiveIds.length > 0
        ? variationActiveIds[variationActiveIds.length - 1]
        : mainlineActiveId;

    if (currentNodeId && tree.nodes[currentNodeId]) {
      tree.currentNodeId = currentNodeId;
      for (const node of Object.values(tree.nodes)) {
        node.isCurrent = node.id === currentNodeId;
      }
      const current = tree.nodes[currentNodeId];
      if (current.variationDepth > 0) {
        tree.currentVariation = pathToRoot(tree, currentNodeId);
      }
    }

    log.info(
      `Move tree: mainline=${tree.mainLine.length} variations=${attached} attached, ${skipped} skipped, nodes=${Object.keys(tree.nodes).length}` +
        (tree.currentNodeId
          ? ` current=${tree.nodes[tree.currentNodeId].san}`
          : " current=none"),
    );

    return tree;
  } catch (err) {
    log.error("buildMoveTree failed:", err);
    return { root: null, nodes: {}, mainLine: [] };
  }
}
