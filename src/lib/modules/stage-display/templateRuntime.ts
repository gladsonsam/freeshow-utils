import type { StageData } from "$lib/core/types";

export const UPDATE_MESSAGE = "freeshow:update";
export const READY_MESSAGE = "freeshow:ready";
export const ERROR_MESSAGE = "freeshow:error";

/**
 * Injected ahead of every template. This is the whole API a template gets:
 * `window.freeShowData` to pull, `window.onFreeShowUpdate` to be pushed to.
 */
const BOOTSTRAP = `
window.freeShowData = null;
window.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "${UPDATE_MESSAGE}") return;
  window.freeShowData = event.data.data;
  try {
    if (typeof window.onFreeShowUpdate === "function") window.onFreeShowUpdate(event.data.data);
  } catch (error) {
    report(String((error && error.message) || error));
  }
});

function report(message) {
  parent.postMessage({ type: "${ERROR_MESSAGE}", message: message }, "*");
}

window.addEventListener("error", function (event) {
  report(event.message + (event.lineno ? " (line " + event.lineno + ")" : ""));
});
window.addEventListener("unhandledrejection", function (event) {
  report("Unhandled promise rejection: " + String(event.reason));
});

parent.postMessage({ type: "${READY_MESSAGE}" }, "*");
`;

/** minimal reset - templates own everything else */
const BASE_STYLE = `
html, body { margin: 0; padding: 0; height: 100%; }
body { background: #000; color: #fff; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-user-select: none; user-select: none; }
`;

/**
 * Wrap a template body into a full document for an `srcdoc` iframe.
 *
 * Templates are authored as document *fragments* - style, markup and script, no
 * <html>/<head>/<body> of their own.
 */
export function buildTemplateDocument(html: string): string {
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    `<style>${BASE_STYLE}</style>`,
    `<script>${BOOTSTRAP}<\/script>`,
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

export function postStageData(frame: HTMLIFrameElement | null, data: StageData) {
  frame?.contentWindow?.postMessage({ type: UPDATE_MESSAGE, data }, "*");
}
