importScripts("trackers.js");

// ---- Per-tab audit state -------------------------------------------------
// tabData[tabId] = {
//   url, hostname, requests: Map<hostname, {count, category}>,
//   cookies: { firstParty: [], thirdParty: [] },
//   fingerprinting: Set<string>,
//   thirdPartyScripts: Set<string>,
//   score, band
// }
const tabData = new Map();

function freshTabState(url) {
  let hostname = "";
  try { hostname = new URL(url).hostname; } catch (e) {}
  return {
    url,
    hostname,
    requests: new Map(),
    trackerHits: new Map(), // category -> count
    cookies: { firstParty: [], thirdParty: [] },
    fingerprinting: new Set(),
    thirdPartyScripts: new Set(),
    updatedAt: Date.now()
  };
}

function getState(tabId, url) {
  let state = tabData.get(tabId);
  if (!state || (url && state.url !== url)) {
    state = freshTabState(url || (state && state.url));
    tabData.set(tabId, state);
  }
  return state;
}

function isThirdParty(requestHostname, pageHostname) {
  if (!requestHostname || !pageHostname) return false;
  if (requestHostname === pageHostname) return false;
  // treat subdomains of the same registrable-ish domain as first-party (rough heuristic)
  const strip = (h) => h.split(".").slice(-2).join(".");
  return strip(requestHostname) !== strip(pageHostname);
}

// ---- Reset state on navigation ------------------------------------------
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    tabData.set(details.tabId, freshTabState(details.url));
  }
});

// ---- Network request monitoring -----------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const state = getState(details.tabId);
    let reqHost = "";
    try { reqHost = new URL(details.url).hostname; } catch (e) { return; }

    const thirdParty = isThirdParty(reqHost, state.hostname);
    const category = classifyHostname(reqHost);

    if (thirdParty) {
      const entry = state.requests.get(reqHost) || { count: 0, category };
      entry.count += 1;
      entry.category = category || entry.category;
      state.requests.set(reqHost, entry);

      if (category) {
        state.trackerHits.set(category, (state.trackerHits.get(category) || 0) + 1);
      }

      if (details.type === "script") {
        state.thirdPartyScripts.add(reqHost);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// ---- Cookie monitoring (Set-Cookie headers on responses) ----------------
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const setCookie = (details.responseHeaders || []).find(
      (h) => h.name.toLowerCase() === "set-cookie"
    );
    if (!setCookie) return;

    const state = getState(details.tabId);
    let reqHost = "";
    try { reqHost = new URL(details.url).hostname; } catch (e) { return; }

    const cookieName = (setCookie.value || "").split("=")[0].trim();
    const target = isThirdParty(reqHost, state.hostname)
      ? state.cookies.thirdParty
      : state.cookies.firstParty;

    if (cookieName && !target.some((c) => c.name === cookieName && c.domain === reqHost)) {
      target.push({ name: cookieName, domain: reqHost });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// ---- Messages from content scripts (fingerprinting, cookies via JS) -----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;

  if (message.type === "FINGERPRINT_ATTEMPT") {
    const state = getState(tabId);
    state.fingerprinting.add(message.technique);
    updateBadge(tabId);
  }

  if (message.type === "DOCUMENT_COOKIES") {
    const state = getState(tabId);
    for (const name of message.names) {
      if (!state.cookies.firstParty.some((c) => c.name === name && c.domain === state.hostname)) {
        state.cookies.firstParty.push({ name, domain: state.hostname, viaJS: true });
      }
    }
  }

  if (message.type === "GET_REPORT") {
    const state = tabData.get(tabId);
    sendResponse(state ? buildReport(state) : null);
    return true;
  }
});

// Popup asks for the active tab's report directly.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_REPORT_FOR_TAB") {
    const state = tabData.get(message.tabId);
    sendResponse(state ? buildReport(state) : null);
    return true;
  }
});

// ---- Scoring --------------------------------------------------------------
function buildReport(state) {
  const trackerDomains = Array.from(state.requests.entries())
    .filter(([, v]) => v.category)
    .map(([host, v]) => ({ host, category: v.category, count: v.count }));

  const nonTrackerThirdParty = Array.from(state.requests.entries())
    .filter(([, v]) => !v.category)
    .map(([host, v]) => ({ host, count: v.count }));

  const fingerprinting = Array.from(state.fingerprinting);
  const thirdPartyScripts = Array.from(state.thirdPartyScripts);
  const thirdPartyCookieCount = state.cookies.thirdParty.length;
  const firstPartyCookieCount = state.cookies.firstParty.length;

  const score = computeScore({
    trackerCount: trackerDomains.length,
    thirdPartyCookieCount,
    fingerprintingCount: fingerprinting.length,
    thirdPartyScriptCount: thirdPartyScripts.length,
    thirdPartyRequestCount: state.requests.size
  });

  return {
    url: state.url,
    hostname: state.hostname,
    generatedAt: Date.now(),
    score: score.value,
    band: score.band,
    breakdown: score.breakdown,
    trackers: trackerDomains.sort((a, b) => b.count - a.count),
    otherThirdParty: nonTrackerThirdParty.sort((a, b) => b.count - a.count),
    fingerprinting,
    thirdPartyScripts,
    cookies: {
      firstParty: state.cookies.firstParty,
      thirdParty: state.cookies.thirdParty,
      firstPartyCount: firstPartyCookieCount,
      thirdPartyCount: thirdPartyCookieCount
    },
    trackerCategoryCounts: Object.fromEntries(state.trackerHits)
  };
}

function computeScore({
  trackerCount,
  thirdPartyCookieCount,
  fingerprintingCount,
  thirdPartyScriptCount,
  thirdPartyRequestCount
}) {
  // Each factor contributes up to a capped amount, then we sum and clamp to 100.
  const trackerPts = Math.min(trackerCount * 6, 35);
  const cookiePts = Math.min(thirdPartyCookieCount * 4, 20);
  const fingerprintPts = Math.min(fingerprintingCount * 12, 30);
  const scriptPts = Math.min(thirdPartyScriptCount * 3, 15);
  const volumePts = Math.min(Math.max(thirdPartyRequestCount - 10, 0) * 0.5, 10);

  const raw = trackerPts + cookiePts + fingerprintPts + scriptPts + volumePts;
  const value = Math.round(Math.min(raw, 100));

  let band;
  if (value >= 70) band = "Critical";
  else if (value >= 45) band = "High";
  else if (value >= 20) band = "Moderate";
  else band = "Low";

  return {
    value,
    band,
    breakdown: {
      trackers: Math.round(trackerPts),
      cookies: Math.round(cookiePts),
      fingerprinting: Math.round(fingerprintPts),
      scripts: Math.round(scriptPts),
      volume: Math.round(volumePts)
    }
  };
}

function updateBadge(tabId) {
  const state = tabData.get(tabId);
  if (!state) return;
  const report = buildReport(state);
  const colors = {
    Low: "#34D399",
    Moderate: "#FBBF24",
    High: "#FB923C",
    Critical: "#F87171"
  };
  chrome.action.setBadgeText({ tabId, text: String(report.score) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: colors[report.band] || "#94A3B8" });
}

// Periodically refresh the badge for the active tab as requests roll in.
chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId));
setInterval(() => {
  chrome.tabs.query({ active: true }, (tabs) => {
    for (const t of tabs) updateBadge(t.id);
  });
}, 2000);

chrome.tabs.onRemoved.addListener((tabId) => tabData.delete(tabId));
