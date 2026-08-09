# Browser-Privacy-Auditor

A Chrome/Edge (Manifest V3) browser extension that audits the privacy posture
of the site you're currently viewing: known trackers, first- and third-party
cookies, fingerprinting API usage, and third-party scripts — rolled up into a
single 0–100 privacy risk score shown in the toolbar and a popup dashboard.

## How it works

| Signal | How it's detected |
|---|---|
| **Trackers / ad & analytics networks** | Every outgoing request from the page is inspected via `chrome.webRequest`; hostnames are matched against a curated list of known ad, analytics, social-widget, and anti-fraud/fingerprinting domains (`trackers.js`), categorized accordingly. |
| **Cookies** | First- and third-party cookies are captured two ways: `Set-Cookie` response headers seen by `webRequest.onHeadersReceived`, and `document.cookie` read from the content script (covers cookies set via JS). |
| **Fingerprinting** | A script runs in the page's own JS context (`world: "MAIN"`) at `document_start`, *before* most page scripts run, and wraps fingerprinting-prone APIs — Canvas `toDataURL`/`getImageData`, WebGL `getParameter`, `AudioContext`, `navigator.plugins`/`mimeTypes`, `hardwareConcurrency`/`deviceMemory`, the Battery API, and `RTCPeerConnection` (WebRTC local-IP leak). First use of each is reported back to the extension. |
| **Third-party scripts** | `<script src>` tags with a different eTLD+1 than the page, cross-checked against network-level `script`-type requests. |

### Scoring

The 0–100 risk score (higher = worse) blends five weighted, capped signals:

- Trackers detected — up to 35 pts
- Third-party cookies — up to 20 pts
- Fingerprinting attempts — up to 30 pts
- Third-party scripts — up to 15 pts
- Overall third-party request volume — up to 10 pts

Bands: **Low** (0–19) · **Moderate** (20–44) · **High** (45–69) · **Critical** (70–100).
Tune the weights/caps in `computeScore()` in `background.js` to match your
own idea of what matters most.

## Install (unpacked, for development)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Visit any website — the toolbar badge shows the live score, and clicking
   the icon opens the full breakdown (Trackers / Cookies / Fingerprint / Scripts tabs).

## Project structure

```
manifest.json     Manifest V3 config, permissions, content script registration
background.js     Service worker: network + cookie monitoring, scoring, messaging
trackers.js       Curated known-tracker domain list, imported into background.js
inject.js         MAIN-world page script: wraps fingerprinting APIs
content.js        Isolated-world content script: relays events, reads document.cookie
popup.html/.css/.js  Toolbar popup dashboard
icons/            Toolbar icon (16/48/128px)
```

## Notes & limitations

- The tracker domain list is a curated working set, not an exhaustive feed
  like EasyPrivacy/Disconnect — swap in a full list in `trackers.js` for
  production use.
- First-party vs third-party is determined by a simple eTLD+1 heuristic
  (`example.com` vs `sub.example.com` treated as same-party); it won't be
  perfectly correct for multi-part public suffixes (e.g. `co.uk`).
- The score is a heuristic, not a certified privacy audit — use it to spot
  patterns and compare sites relative to each other, not as a legal/compliance
  measure.
- Requires the `webRequest`, `cookies`, and `<all_urls>` host permissions to
  see all first- and third-party network activity.

