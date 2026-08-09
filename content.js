// Relay fingerprinting-technique events from the MAIN-world inject.js
window.addEventListener("__privacy_auditor_fp__", (e) => {
  chrome.runtime.sendMessage({
    type: "FINGERPRINT_ATTEMPT",
    technique: e.detail.technique
  });
});

function reportDocumentCookies() {
  if (!document.cookie) return;
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);
  if (names.length) {
    chrome.runtime.sendMessage({ type: "DOCUMENT_COOKIES", names });
  }
}

function scanThirdPartyScripts() {
  // Handled primarily by background.js via webRequest, but we also do a DOM
  // pass so scripts injected without triggering a fresh network log (e.g.
  // already cached) are still counted where possible. This is best-effort.
  const scripts = Array.from(document.scripts || []);
  const pageHost = location.hostname;
  const foreign = scripts
    .map((s) => s.src)
    .filter(Boolean)
    .map((src) => {
      try { return new URL(src).hostname; } catch (e) { return null; }
    })
    .filter((host) => host && host !== pageHost);
  // No-op if none found; background.js's webRequest listener is authoritative.
  return foreign;
}

function run() {
  reportDocumentCookies();
  scanThirdPartyScripts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
// Cookies can be set later by scripts too; re-check periodically for the
// life of the page (cheap, and stops mattering once the popup is closed).
setInterval(reportDocumentCookies, 3000);
