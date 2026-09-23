# Handover — Chiss (Chess.com DOM Move Tree Tracker)

> Session baru: lanjutkan **Phase 11 — Popup UI**.
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
| 7 — FEN Position Builder | ✅ | `src/chess/positionBuilder.ts` + `tests/positionBuilder.test.ts` (12 test pass) |
| 8 — MutationObserver & State | ✅ | `src/content/moveTracker.ts` + observer pindah dari `index.ts` |
| 9 — SPA Navigation | ✅ | `startSpaNavigation/stopSpaNavigation` di `moveTracker.ts`, dipanggil di `index.ts` |
| 10 — Chrome Message API | ✅ | `src/content/messageHandler.ts` + `tests/messageHandler.test.ts` (9 test pass) |
| 11 — Popup UI | 📋 NEXT | `App.tsx` placeholder |
| 12 — Debug Commands | ⬜ | — |
| 13 — Testing | partial | `moveTree` + `positionBuilder` + `messageHandler`; parser tests menyusul |

**Verify setelah tiap phase:** `npx tsc --noEmit` dan `npx vitest run`.

---

## Phase 10 — Selesai

**Done:** `src/content/messageHandler.ts` — `handleMessage(message): Response<unknown>` (pure, testable) handle 7 type: `GET_GAME_STATE`, `GET_MOVE_TREE`, `GET_MAINLINE` (nodes urut `mainLine`), `GET_VARIATIONS`, `GET_CURRENT_POSITION` (`currentNodeId` + `fen`, fallback root fen), `GET_CURRENT_NODE`, `REFRESH` (panggil `refresh()`, return `{ refreshed: boolean }`). Unknown/invalid → `{ ok: false, error }`. `startMessageHandler()` daftarkan `chrome.runtime.onMessage.addListener` (sync, return false), dipanggil di `index.ts` setelah `startSpaNavigation()`.

**Perubahan pendukung:** `TrackerState` sekarang punya field `variations: Variation[]` (diisi di `refresh()`, ikut masuk state-diff). Export baru `getSerializableState()` di `moveTracker.ts` — deep-strip `domElement` dari semua node + variation moves (wajib: HTMLElement tidak bisa di-serialize lewat chrome messaging). `messages.ts` + `RefreshResponse`.

**Gotcha:** `domElement` (HTMLElement) TIDAK boleh ikut dikirim via `chrome.runtime.sendMessage` — DataCloneError. Selalu lewat `getSerializableState()`. `handleMessage` sengaja terpisah dari listener agar bisa di-test tanpa env `chrome`.

---

## Phase 9 — Selesai

**Done:** `moveTracker.ts` — `startSpaNavigation()`: (1) monkey-patch `history.pushState/replaceState` (simpan original, `stopSpaNavigation()` restore), (2) listener `popstate`, (3) fallback poll `location.href` tiap 500ms. Deteksi = href berubah → `resetState()` → `scheduleNavRefresh(150ms)` → loop retry `startObserver()+refresh()` tiap 500ms max 10×; stop awal kalau `pageType === "unknown"` (bukan halaman game) atau mainline ketemu. `index.ts` panggil `startSpaNavigation()` di awal (sebelum retry-loop inspector).

**Gotcha:** monkey-patch history di content script **isolated world** — call `pushState` dari page JS TIDAK lewat patch kita. Poll 500ms adalah safety net utama; patch hanya untuk call dari content-script context sendiri.

---

## Phase 8 — Selesai

**Done:** `src/content/moveTracker.ts` — orchestrator: `refresh()` = detect → parse mainline → parse variations → `buildMoveTree` → `buildFenForTree` → `normalizeState` diff (tanpa `domElement`) → kalau berubah emit `CustomEvent("chiss:MOVE_TREE_UPDATED")` (export `MOVE_TREE_UPDATED`); kalau sama skip. `startObserver()/stopObserver()` (debounce 200ms, filter mutation di move-list), `resetState()` disiapkan untuk Phase 9, getter `getState/getMoveTree/getGameState`. `index.ts` tinggal retry-loop + `refresh()` + `startObserver()`.

**Bug fix saat Phase 8:** `normalizeState` lama pakai `JSON.stringify(state, Object.keys(state))` — array-replacer menyaring key **secara rekursif** → semua nested key hilang → diff selalu "sama". Diganti deep-sort-keys lalu stringify.

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
│   ├── index.ts            # entry: startSpaNavigation() + startMessageHandler() + retry-loop + refresh() + startObserver()
│   ├── moveTracker.ts      # ✅ Phase 8-10: orchestrator refresh + observer + state diff + SPA nav + getSerializableState()
│   ├── messageHandler.ts   # ✅ Phase 10: handleMessage + startMessageHandler (7 message types)
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
- Content script isolated world: patch `history.pushState` **tidak intercept call dari page JS** — SPA detection mengandalkan poll href 500ms + `popstate`.
- Root `san: ""` → jangan coba `chess.move("")`; handle root case terpisah (set starting FEN).
- `tryMove()` di `moveParser.ts` sudah wrap try/catch + `MoveParseError` log — **reuse, jangan duplikasi**.
- Variation parser (`variationParser.ts`) men-clone `Chess` dan replay mainline untuk validasi — `buildFenForTree` tidak perlu replay; cukup `createChess(parent.fen)` + `move(san)`.
- Assert FEN di test: **jangan hard-code full FEN** (halfmove clock beta.8 = `0`), dan expand rank sebelum cek index file.
- Kalau menambah field/interface baru di `types/chess.ts`, cek `messages.ts` (response types) dan popup nanti (Phase 11).
- Kirim data ke popup **hanya** via `getSerializableState()` — field `domElement` (HTMLElement) membuat chrome messaging gagal clone.

---

## Acceptance Criteria (relevan Phase 10)

- ✅ #13 Handles SPA navigation (Phase 9)
- ✅ 7 message types ter-handle dengan benar
- ✅ Response tanpa `domElement` (serializable)
- ✅ `npm run typecheck && npm test` hijau semua (42 tests)

---

## Git

- Repo: `C:\Users\malino\Desktop\chiss` (git repo)
- Commits terakhir: `Phase 8: moveTracker...`, `Phase 6-7: move tree...`, `Phase 2-5...`, `Phase 1...` (Phase 9-10 belum di-commit)
- **Jangan commit/push kecuali user minta eksplisit.**

---

## Next setelah Phase 10 (sudah selesai)

- **Phase 11 (NEXT):** Popup UI React — `App.tsx` + `src/popup/components/`: `StatusHeader`, `MainlineView`, `VariationView`, `PositionView` (FEN + copy), `MoveTreeView`, `ActionButtons` (Refresh/Copy Moves/Copy FEN/Copy JSON). Komunikasi via `chrome.tabs.sendMessage` ke content script (handler sudah siap di Phase 10); popup perlu query tab aktif `*://*.chess.com/*`.
- Lalu Phase 12 (`window.__CHESS_TRACKER__`), 13 (test parser sisa).
