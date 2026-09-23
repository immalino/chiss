# Chess.com DOM Move Tree & Variation Tracker — Implementation Plan

## Overview

Chrome Extension that reads Chess.com game moves from the DOM (not PGN, not API)
and builds a Move Tree with variations, FEN positions, and current state tracking.

---

## Architecture

```
chiss/
├── src/
│   ├── content/                    # Content scripts injected into Chess.com
│   │   ├── index.ts                # Entry point, orchestrates all modules
│   │   ├── moveTracker.ts          # MutationObserver + debounce + state diff
│   │   ├── domInspector.ts         # Self-discovering DOM probe tool
│   │   ├── mainlineParser.ts       # Parse main line moves from DOM
│   │   ├── variationParser.ts      # Detect & parse variation lines
│   │   ├── selectors.ts            # Selector definitions with fallbacks
│   │   └── gameDetector.ts         # Detect page type, game ID, finished state
│   │
│   ├── chess/                      # Pure chess logic (no DOM dependency)
│   │   ├── moveTree.ts             # MoveTree data structure + builder
│   │   ├── positionBuilder.ts      # FEN generation per node via chess.js
│   │   └── moveParser.ts           # SAN validation helper
│   │
│   ├── popup/                      # React popup UI
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── components/
│   │
│   ├── shared/                     # Shared utilities
│   │   ├── messages.ts             # Chrome message API types
│   │   ├── logger.ts               # [ChessTracker] console logger
│   │   └── utils.ts                # debounce, normalize, serialize
│   │
│   ├── types/
│   │   └── chess.ts                # All TypeScript interfaces
│   │
│   └── manifest.ts                 # Chrome MV3 manifest
│
├── tests/
│   ├── moveTree.test.ts
│   ├── positionBuilder.test.ts
│   ├── mainlineParser.test.ts
│   └── variationParser.test.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Data Model

```typescript
// src/types/chess.ts

interface MoveNode {
    id: string;                    // Deterministic: "root:e4:e6:d4:d5"
    moveIndex: number;             // 0-based half-move index
    moveNumber: number;            // 1-based move number (1, 2, 3...)
    color: "white" | "black";
    san: string;                   // e.g. "e4", "Nf3", "O-O"
    fen: string;                   // FEN after this move
    uci?: string;                  // Optional UCI format
    isMainLine: boolean;
    parentId?: string;             // ID of parent MoveNode
    children: string[];            // IDs of child MoveNodes
    variationDepth: number;        // 0 = mainline, 1 = first variation, etc.
    source: "mainline" | "variation" | "exploration" | "engine";
    isCurrent: boolean;            // Currently selected/active move
    domElement?: HTMLElement;       // Reference to DOM element
}

interface MoveTree {
    root: MoveNode | null;
    nodes: Record<string, MoveNode>;
    mainLine: string[];            // Ordered IDs of mainline moves
    currentNodeId?: string;
    currentVariation?: string[];   // IDs forming current variation path
}

interface ParsedMove {
    moveNumber: number;
    color: "white" | "black";
    san: string;
    domElement?: HTMLElement;
    source: "mainline";
}

interface Variation {
    id: string;
    parentMoveId?: string;         // MoveNode ID where variation branches
    moves: ParsedMove[];
    depth: number;
    source: "variation" | "exploration";
}

interface GameState {
    detected: boolean;
    gameId?: string;
    gameFinished?: boolean;
    pageType: "game" | "review" | "analysis" | "unknown";
}

interface MoveParseError {
    san: string;
    moveIndex: number;
    reason: string;
    domElement?: HTMLElement;
}
```

---

## Phase-by-Phase Plan

### Phase 1 — Project Setup & Types
**Goal:** Scaffold project with TypeScript, Vite, Vitest, chess.js, React.

**Create:**
- `package.json` — deps: chess.js, react, react-dom, vitest, typescript, vite, tailwindcss, @types/chrome
- `tsconfig.json` — strict mode, ES2020 target
- `vite.config.ts` — multi-entry build (content script + popup)
- `tailwind.config.ts`
- `src/types/chess.ts` — all interfaces above
- `src/shared/logger.ts` — [ChessTracker] prefixed console logger
- `src/shared/messages.ts` — Chrome message types
- `src/shared/utils.ts` — debounce, normalizeState, serialize

**Verify:** `npx tsc --noEmit` passes.

---

### Phase 2 — DOM Inspector (Self-Discovering)
**Goal:** Build inspector that probes Chess.com DOM and reports what it finds.

**Key strategies:**
1. Scan for elements containing chess move text (regex match)
2. Scan for `data-*` attributes on move elements
3. Scan for `aria-*` attributes related to moves
4. Scan DOM tree structure for move-list containers
5. Identify move number elements
6. Identify active/current move highlighting
7. Identify variation indentation (nested containers)

**Create:**
- `src/content/selectors.ts` — selector definitions with fallback arrays
- `src/content/domInspector.ts` — `inspectMoveDOM()`, `inspectMoveTreeDOM()`

**Output:** Detailed report logged to console:
```
[ChessTracker] DOM Inspector Report
Move container: <div class="..." data-...>
Move elements: 84 found
Active move: <span class="...highlighted...">d5</span>
Variation containers: 2 found
```

**Verify:** Load extension on Chess.com, open DevTools, see inspector output.

---

### Phase 3 — Game Detection
**Goal:** Determine page type, game ID, finished state.

**Logic:**
- URL pattern: `/game/live/`, `/game/review/`, `/analysis/`
- DOM elements: board presence, move list presence
- Game ID from URL
- Finished detection: result text "1-0", "0-1", "1/2-1/2"

**Create:**
- `src/content/gameDetector.ts` — `detectGamePage(): GameState`

---

### Phase 4 — Main Line Parser
**Goal:** Parse main game moves into `ParsedMove[]`.

**Strategy:**
1. Find move list container using selectors from Phase 2
2. Iterate through move elements in DOM order
3. Extract SAN text, determine move number and color
4. Check if active/highlighted
5. Validate SAN using chess.js

**Create:**
- `src/content/mainlineParser.ts` — `parseMainLineFromDOM(): ParsedMove[]`
- `src/chess/moveParser.ts` — SAN validation wrapper

---

### Phase 5 — Variation Detection & Parser
**Goal:** Detect alternate lines when user explores different moves.

**Strategy:**
1. Look for DOM structural cues:
   - Nested containers with left margin/padding
   - Containers with different background
   - "Variation" labels or annotations
   - Move elements that branch from a parent move
2. For each variation:
   - Determine parent move (mainline move where branching occurs)
   - Parse variation moves
   - Assign depth (1 = first level, 2 = nested, etc.)
   - Mark source as "variation" or "exploration"

**Critical rules:**
- Never assume a move is a variation without structural evidence
- If uncertain, mark as "unknown" and log warning
- Engine lines are NOT user variations

**Create:**
- `src/content/variationParser.ts` — `parseVariationsFromDOM(): Variation[]`

---

### Phase 6 — Move Tree Builder
**Goal:** Combine mainline + variations into tree structure.

**Algorithm:**
```
1. Create root node
2. For each mainline move:
   - Create MoveNode with parentId = previous node
   - Add to nodes map
   - Add id to mainLine array
3. For each variation:
   - Find parent node by matching parentMoveId
   - For each variation move:
     - Create MoveNode
     - Link to parent
     - Add children to parent
4. Assign IDs deterministically: "root:e4:e6:d4:d5"
5. Deduplicate: check (parentId + san) before creating new node
```

**Create:**
- `src/chess/moveTree.ts` — `buildMoveTree(): MoveTree`, `addNode()`, `findNode()`

---

### Phase 7 — FEN Position Builder
**Goal:** Generate FEN for every node using chess.js.

**Algorithm:**
```
For root: fen = starting position
For each node:
  1. Get parent's FEN
  2. chess.load(parentFen)
  3. result = chess.move(san)
  4. If result is null: log MoveParseError, skip
  5. node.fen = chess.fen()
```

**Create:**
- `src/chess/positionBuilder.ts` — `buildFenForTree(tree: MoveTree): void`

---

### Phase 8 — MutationObserver & State Management
**Goal:** Watch for DOM changes, rebuild state efficiently.

**Flow:**
```
DOM mutation detected
  → debounce (200ms)
  → detectGamePage()
  → parseMainLineFromDOM()
  → parseVariationsFromDOM()
  → buildMoveTree()
  → buildFenForTree()
  → compareNormalizedState(previous, current)
  → if changed: emit MOVE_TREE_UPDATED
  → if same: skip
```

**Create:**
- `src/content/moveTracker.ts` — orchestrator with MutationObserver

---

### Phase 9 — SPA Navigation Detection
**Goal:** Handle Chess.com client-side routing.

**Strategy:**
- Monkey-patch `history.pushState`, `history.replaceState`
- Listen to `popstate` event
- On navigation: reset all state, re-detect game, rebuild tree

**Add to:** `src/content/moveTracker.ts`

---

### Phase 10 — Chrome Message API ✅
**Goal:** Content script ↔ popup communication.

**Status:** Done — `src/content/messageHandler.ts` (`handleMessage` + `startMessageHandler`), registered in `index.ts`, tests in `tests/messageHandler.test.ts`.

**Messages:**
```
GET_GAME_STATE → { gameState }
GET_MOVE_TREE → { moveTree }
GET_MAINLINE → { mainline[] }
GET_VARIATIONS → { variations[] }
GET_CURRENT_POSITION → { currentNodeId, fen }
GET_CURRENT_NODE → { node }
REFRESH → triggers full re-parse
```

**Add to:** `src/content/index.ts`, `src/shared/messages.ts`

---

### Phase 11 — Popup UI
**Goal:** React popup showing game state, move list, variations.

**Components:**
- `StatusHeader` — connection status, game detected, move count
- `MainlineView` — formatted move list with move numbers
- `VariationView` — current variation display
- `PositionView` — FEN display with copy button
- `MoveTreeView` — indented tree visualization
- `ActionButtons` — Refresh, Copy Moves, Copy FEN, Copy JSON

**Create:**
- `src/popup/App.tsx`
- `src/popup/main.tsx`
- `src/popup/components/*.tsx`

---

### Phase 12 — Debug Commands
**Goal:** Expose `window.__CHESS_TRACKER__` for DevTools debugging.

**API:**
```javascript
window.__CHESS_TRACKER__ = {
  getState(),
  getMoveTree(),
  getMainline(),
  getVariations(),
  getCurrentNode(),
  inspectDOM(),
  refresh()
}
```

**Add to:** `src/content/index.ts`

---

### Phase 13 — Testing
**Goal:** Unit tests for chess logic and parsers.

**Tests:**
1. Mainline parsing from mock DOM
2. Variation detection from mock DOM
3. Move tree building with branches
4. Move tree with nested variations
5. FEN generation for all nodes
6. Deduplication of identical moves
7. Return from variation to mainline
8. Castling, promotion, checkmate SAN handling
9. State diff comparison
10. SPA navigation reset

**Create:**
- `tests/moveTree.test.ts`
- `tests/positionBuilder.test.ts`
- `tests/mainlineParser.test.ts`
- `tests/variationParser.test.ts`

---

## Key Design Decisions

1. **Self-discovering DOM:** Inspector probes Chess.com and logs findings. Selectors populated from real DOM, not guesses.

2. **Deterministic IDs:** `root:e4:e6:d4:d5` — based on path from root, enables deduplication.

3. **Source taxonomy:** `"mainline" | "variation" | "exploration" | "engine"` — engine lines architecturally supported but not implemented.

4. **FEN via chess.js:** Never manually parse positions. Use `chess.move(san)` for validation + FEN.

5. **Debounced observer:** 200ms debounce prevents excessive re-parsing.

6. **Normalized state comparison:** `JSON.stringify()` of normalized state for change detection.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Chess.com DOM changes | Self-discovering inspector, multiple fallback selectors |
| Variation structure unclear | Mark as "unknown", don't guess |
| Performance with large games | Debounce, only rebuild on actual change |
| SPA navigation breaks state | Monkey-patch history API, full reset |
| chess.js SAN parsing fails | Try/catch, log MoveParseError, skip node |

---

## Development Rules

1. **Inspect DOM first** before writing selectors — never guess
2. **Run tests** after each phase
3. **Log warnings** for uncertain states
4. **READ-ONLY** against Chess.com — no automation, no move sending
5. **Incremental** — complete one phase before starting next
6. **Verify** with `npx tsc --noEmit` and `npx vitest run` after each phase

---

## Final Acceptance Criteria

1. Detects Chess.com game page
2. Reads mainline from DOM
3. Reads SAN notation
4. Knows current move
5. Detects alternate/exploration lines
6. Knows parent variation
7. Builds Move Tree
8. Handles multiple branches
9. Handles nested branches
10. No duplicate nodes
11. Returns from variation to mainline
12. Generates FEN per node
13. Handles SPA navigation
14. Handles DOM rerender
15. Doesn't crash when move list unavailable
16. No PGN usage
17. No Chess.com API usage
18. No gameplay automation
