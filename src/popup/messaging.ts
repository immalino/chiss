import type { Message, Response } from "../shared/messages";
import { log } from "../shared/logger";

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  } catch (err) {
    log.error("getActiveTab failed:", err);
    return null;
  }
}

export async function sendToActiveTab<T>(
  message: Message<unknown>,
): Promise<Response<T>> {
  try {
    const tab = await getActiveTab();
    if (!tab || tab.id === undefined) {
      return { ok: false, error: "No active tab found" };
    }
    const response = (await chrome.tabs.sendMessage(
      tab.id,
      message,
    )) as Response<T> | undefined;
    if (!response) {
      return { ok: false, error: "Empty response from content script" };
    }
    return response;
  } catch (err) {
    log.warn("sendToActiveTab failed:", err);
    return {
      ok: false,
      error: "Cannot reach content script — open a Chess.com tab and reload it.",
    };
  }
}
