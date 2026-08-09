// A curated list of well-known tracker / ad / analytics / social-widget domains.
// This is intentionally not exhaustive -- it's a reasonable working set covering
// the networks responsible for the large majority of third-party tracking.
// Matching is done by suffix, so "doubleclick.net" also matches "stats.g.doubleclick.net".

const TRACKER_DOMAINS = {
  advertising: [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "adnxs.com", "adsrvr.org", "adform.net", "advertising.com",
    "rubiconproject.com", "pubmatic.com", "openx.net", "criteo.com",
    "criteo.net", "taboola.com", "outbrain.com", "media.net",
    "bidswitch.net", "casalemedia.com", "contextweb.com", "yieldmo.com",
    "smartadserver.com", "adroll.com", "amazon-adsystem.com", "moatads.com",
    "3lift.com", "sharethrough.com", "gumgum.com", "indexexchange.com",
    "sovrn.com", "spotxchange.com", "teads.tv", "loopme.com"
  ],
  analytics: [
    "google-analytics.com", "googletagmanager.com", "analytics.google.com",
    "hotjar.com", "mixpanel.com", "segment.com", "segment.io",
    "amplitude.com", "heap.io", "heapanalytics.com", "fullstory.com",
    "mouseflow.com", "crazyegg.com", "clicktale.net", "quantserve.com",
    "quantcast.com", "scorecardresearch.com", "chartbeat.com",
    "newrelic.com", "nr-data.net", "matomo.cloud", "clarity.ms",
    "yandex.ru/metrika", "mc.yandex.ru", "statcounter.com"
  ],
  social: [
    "facebook.com/tr", "connect.facebook.net", "facebook.net",
    "platform.twitter.com", "ads-twitter.com", "analytics.twitter.com",
    "linkedin.com/px", "px.ads.linkedin.com", "snap.licdn.com",
    "pinterest.com/ct", "ct.pinterest.com", "tiktok.com/i18n",
    "analytics.tiktok.com", "reddit.com/api", "pixel.reddit.com",
    "snapchat.com", "sc-static.net"
  ],
  fingerprinting: [
    "fingerprintjs.com", "fpjs.io", "fpapi.io", "iovation.com",
    "threatmetrix.com", "maxmind.com", "seon.io", "castle.io",
    "sift.com", "forter.com", "signifyd.com", "arkoselabs.com",
    "distilnetworks.com", "perimeterx.net", "datadome.co"
  ],
  cdn_widgets: [
    "hs-scripts.com", "hsforms.net", "hubspot.com", "intercom.io",
    "intercomcdn.com", "zendesk.com", "zdassets.com", "drift.com",
    "livechatinc.com", "tawk.to", "onesignal.com", "pusher.com",
    "optimizely.com", "cloudflareinsights.com"
  ]
};

// Flat map: domain -> category, built once.
const TRACKER_DOMAIN_MAP = (() => {
  const map = new Map();
  for (const [category, domains] of Object.entries(TRACKER_DOMAINS)) {
    for (const d of domains) map.set(d, category);
  }
  return map;
})();

function classifyHostname(hostname) {
  if (!hostname) return null;
  for (const [domain, category] of TRACKER_DOMAIN_MAP.entries()) {
    if (hostname === domain || hostname.endsWith("." + domain) || hostname.includes(domain)) {
      return category;
    }
  }
  return null;
}

// Exposed for use by the service worker (importScripts) and, via a plain
// var, is also reachable from module-less contexts.
if (typeof self !== "undefined") {
  self.classifyHostname = classifyHostname;
}
