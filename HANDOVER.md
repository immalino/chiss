# Handover — Chiss (Chess.com DOM Move Tree Tracker)

> Session baru: lanjutkan **Phase 8 — MutationObserver & State**.
> Baca `implementation-plan.md` untuk konteks full 13 phase.

---

## Status Phase

| Phase | Status | Bukti |
|-------|--------|-------|
| 1 — Project Setup & Types | ✅ | configs, `src/types/chess.ts`, `src/shared/*` |
| 2 — DOM Inspector | ✅ | `src/content/selectors.ts`, `domInspector.ts` |
| 3 — Game Detection | ✅ | `src/content/gameDetector.ts` |
| 4 — Main Line Parser | ✅ | `src/content/mainlineParser.ts`, `src/chess/moveParser.ts` |
| 5 — Variation Parser | ✅ | `src/content/variationParser.ts` |
| 6 — Move Tree Builder | ✅ | `src/chess/moveTree.ts` + `tests/moveTree.test.ts` (21 test pass) |
| **7 — FEN Position Builder** | ✅ | `src/chess/positionBuilder.ts` + `tests/positionBuilder.test.ts` (12 test pass) |
| 8 — MutationObserver & State | 🔜 **NEXT** | `moveTracker.ts` belum ada (observer inline di `content/index.ts`) |
| 9 — SPA Navigation | ⬜ | — |
| 10 — Chrome Message API | types only | `messages.ts` lengkap, belum ada handler |
| 11 — Popup UI | scaffold | `App.tsx` placeholder |
| 12 — Debug Commands | ⬜ | — |
| 13 — Testing | partial | `tests/moveTree.test.ts` + `tests/positionBuilder.test.ts`; test parser menyusul |

**Verify setelah tiap phase:** `npx tsc --noEmit` dan `npx vitest run`.

---

## Phase 7 — Selesai

**Done:** `buildFenForTree(tree): void` — BFS walk dari root via `children` (parent-before-child), root = `createChess().fen()`, tiap node `createChess(parent.fen)` + `tryMove()`, gagal → `fen = ""` + warn, descendants tetap di-walk agar ikut di-clear (idempotent). Summary log: `FEN built: N filled, M skipped`.

**Gotcha ditemukan saat test:** `new Chess().fen()` di chess.js v1.0.0-beta.8 pakai halfmove clock **`0`** (bukan `1` seperti konstanta lama). Jangan hard-code FEN full — bandingkan dengan `new Chess().fen()` atau hanya bagian placement. Assert posisi bidak via helper expand rank (digit `1`-`8` di FEN menekan index string ≠ file index).

---

## Arsitektur & File Kunci

```
src/
├── types/chess.ts          # MoveNode, MoveTree, ParsedMove, Variation, GameState, MoveParseError
├── shared/
│   ├── logger.ts           # log.info/warn/error/debug — prefix "[ChessTracker]"
│   ├── messages.ts         # MessageType, Message, Response, *Response interfaces
│   └── utils.ts            # debounce, normalizeState, serialize
├── chess/
│   ├── moveParser.ts       # extractSanFromElement, isEmptyPly, tryMove, isValidSan, createChess
│   ├── moveTree.ts         # ✅ Phase 6: buildMoveTree, addNode, findNode, makeNodeId, createRootNode, ROOT_ID
│   └── positionBuilder.ts  # ✅ Phase 7: buildFenForTree
├── content/
│   ├── index.ts            # entry: inspector + observer inline (debounce 200ms) — belum orchestrate tree
│   ├── selectors.ts        # selectorCandidates + queryFirst/queryAll + SAN_REGEX
│   ├── domInspector.ts     # inspectMoveDOM, inspectMoveTreeDOM
│   ├── gameDetector.ts     # detectGamePage(): GameState
│   ├── mainlineParser.ts   # parseMainLineFromDOM(): ParsedMove[]
│   └── variationParser.ts  # parseVariationsFromDOM(): Variation[]
├── popup/
│   ├── index.html          # loads ./App.tsx
│   └── App.tsx             # placeholder <h1>Chiss</h1>
└── manifest.ts             # MV3, content_script chess.com, popup
```

### Data model (ringkas — lihat `src/types/chess.ts` untuk full)

```typescript
interface MoveNode {
  id: string;              // "root" | "root:e4" | "root:e4:e6" ...
  moveIndex: number;       // root = -1, half-move 0-based
  moveNumber: number;      // root = 0, else 1-based
  color: "white" | "black"; // root = "white"
  san: string;             // root = ""
  fen: string;              // ✅ diisi buildFenForTree (Phase 7)
  uci?: string;
  isMainLine: boolean;
  parentId?: string;       // root = undefined
  children: string[];      // IDs
  variationDepth: number;  // root = 0
  source: "mainline" | "variation" | "exploration" | "engine";
  isCurrent: boolean;
  domElement?: HTMLElement;
}

interface MoveTree {
  root: MoveNode | null;
  nodes: Record<string, MoveNode>;
  mainLine: string[];      // ordered IDs, tidak termasuk "root"
  currentNodeId?: string;
  currentVariation?: string[];
}
```

---

## Konvensi (ikuti konsisten)

1. **Export bernama** (bukan default), kecuali `manifest.ts` (default export).
2. **`import type { ... }`** untuk type-only imports.
3. **Relative imports** (`../types/chess`, `../shared/logger`) — alias `@/` ada di config tapi TIDAK dipakai di `src/`.
4. **2-space indent, double quotes, semicolon.**
5. **try/catch** di tiap public function: `log.error("fnName failed:", err)` + return fallback (empty / void).
6. **Logging:** `import { log } from "../shared/logger"` → `log.info/warn/error`, jangan `console.*` langsung.
7. **chess.js v1.0.0-beta.8** — method `move()` throw saat illegal, `load()` throw saat FEN invalid.
8. **READ-ONLY** terhadap Chess.com — tanpa automation/API/PGN.
9. **Tests:** vitest, file di `tests/*.test.ts`, import dari `../src/...`. Sudah masuk `tsconfig` include.

---

## Cara Menjalankan

```bash
npm install           # kalau belum
npm run typecheck     # npx tsc --noEmit
npm test              # npx vitest run
npm run build         # tsc && vite build (build extension ke dist/)
npm run dev           # vite dev
```

Load unpacked extension dari `dist/` setelah `npm run build` (atau via CRXJS dev server).

---

## Known Gotchas

- **`tree.nodes` insertion order** tidak menjamin parent sebelum child — **walk tree via `root` + `children`** (BFS/DFS), jangan `Object.values(tree.nodes)`.
- Root `san: ""` → jangan coba `chess.move("")`; handle root case terpisah (set starting FEN).
- `tryMove()` di `moveParser.ts` sudah wrap try/catch + `MoveParseError` log — **reuse, jangan duplikasi**.
- Variation parser (`variationParser.ts`) men-clone `Chess` dan replay mainline untuk validasi — `buildFenForTree` tidak perlu replay; cukup `createChess(parent.fen)` + `move(san)`.
- Assert FEN di test: **jangan hard-code full FEN** (halfmove clock beta.8 = `0`), dan expand rank sebelum cek index file.
- Kalau menambah field/interface baru di `types/chess.ts`, cek `messages.ts` (response types) dan popup nanti (Phase 11).

---

## Acceptance Criteria (relevan Phase 7)

- ✅ #12 Generate FEN per node
- ✅ Node gagal parse → tidak crash, di-skip, logged
- ✅ Tidak ada duplikat node (Phase 6)
- ✅ `npm run typecheck && npm test` hijau semua (33 tests)

---

## Git

- Repo: `C:\Users\malino\Desktop\chiss` (git repo)
- Commits terakhir: `Phase 2-5: DOM inspector...`, `Phase 1: project setup...`
- **Belum commit Phase 6 & 7** (cek `git status` — `moveTree.ts`, `positionBuilder.ts`, tests, mungkin unstaged).
- **Jangan commit/push kecuali user minta eksplisit.**

---

## Next setelah Phase 7 (sudah selesai)

- **Phase 8 (NEXT):** `src/content/moveTracker.ts` — orchestrator: debounce → detect → parse → `buildMoveTree` → `buildFenForTree` → `normalizeState` diff → emit `MOVE_TREE_UPDATED`.
- Lalu Phase 9 (SPA history patch), 10 (message handlers), 11 (popup UI), 12 (`window.__CHESS_TRACKER__`), 13 (test parser sisa).
