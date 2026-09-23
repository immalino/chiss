import { log } from "../shared/logger";
import { debounce } from "../shared/utils";
import { inspectMoveDOM, inspectMoveTreeDOM } from "./domInspector";
import { detectGamePage } from "./gameDetector";
import { parseMainLineFromDOM } from "./mainlineParser";
import { parseVariationsFromDOM } from "./variationParser";

log.info("Content script loaded on", window.location.href);

let observer: MutationObserver | null = null;

function fullScan(label: string): boolean {
  log.info(`--- scan: ${label} ---`);
  const report = inspectMoveDOM();
  if (report.moveElementCount === 0) return false;
  inspectMoveTreeDOM();
  detectGamePage();
  parseMainLineFromDOM();
  parseVariationsFromDOM();
  return true;
}

const rescan = debounce(() => {
  const mainline = parseMainLineFromDOM();
  const variations = parseVariationsFromDOM();
  log.info(
    `Rescan after DOM mutation: mainline=${mainline.length} variations=${variations.length}`,
  );
}, 200);

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const target =
        m.target instanceof Element ? m.target : m.target.parentElement;
      if (!target) return false;
      return (
        target.closest("wc-move-list, .move-list, .analysis-view-movelist") !==
        null
      );
    });
    if (relevant) rescan();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  log.info("MutationObserver started on move list");
}

function runOnce(label: string): boolean {
  const ok = fullScan(label);
  if (ok) startObserver();
  return ok;
}

if (!runOnce("initial")) {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts++;
    if (runOnce(`retry ${attempts}`) || attempts >= 10) {
      window.clearInterval(timer);
      if (attempts >= 10) {
        log.warn("Inspector gave up after 10 retries — move list never appeared.");
      }
    }
  }, 1500);
}
