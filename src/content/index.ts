import { log } from "../shared/logger";
import { inspectMoveDOM, inspectMoveTreeDOM } from "./domInspector";
import { refresh, startObserver, startSpaNavigation } from "./moveTracker";

log.info("Content script loaded on", window.location.href);

startSpaNavigation();

function runOnce(label: string): boolean {
  log.info(`--- scan: ${label} ---`);
  const report = inspectMoveDOM();
  if (report.moveElementCount === 0) return false;
  inspectMoveTreeDOM();
  refresh();
  startObserver();
  return true;
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
