// Runs in the page's own JS context (MAIN world) at document_start, before
// most page scripts execute. It wraps APIs that are commonly abused for
// browser fingerprinting and reports first-use via a DOM CustomEvent, which
// the isolated-world content script (content.js) relays to the background
// service worker.

(() => {
  const REPORTED = new Set();

  function report(technique) {
    if (REPORTED.has(technique)) return;
    REPORTED.add(technique);
    window.dispatchEvent(
      new CustomEvent("__privacy_auditor_fp__", { detail: { technique } })
    );
  }

  function safeWrap(obj, prop, technique, isGetter) {
    try {
      if (isGetter) {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (!desc || !desc.get) return;
        const originalGetter = desc.get;
        Object.defineProperty(obj, prop, {
          ...desc,
          get() {
            report(technique);
            return originalGetter.apply(this, arguments);
          }
        });
      } else {
        const original = obj[prop];
        if (typeof original !== "function") return;
        obj[prop] = function (...args) {
          report(technique);
          return original.apply(this, args);
        };
      }
    } catch (e) {
      // Some pages / extensions lock these down; fail silently.
    }
  }

  // Canvas fingerprinting
  safeWrap(HTMLCanvasElement.prototype, "toDataURL", "Canvas fingerprinting (toDataURL)");
  safeWrap(HTMLCanvasElement.prototype, "toBlob", "Canvas fingerprinting (toBlob)");
  if (window.CanvasRenderingContext2D) {
    safeWrap(CanvasRenderingContext2D.prototype, "getImageData", "Canvas fingerprinting (getImageData)");
  }

  // WebGL fingerprinting (GPU / renderer info)
  if (window.WebGLRenderingContext) {
    safeWrap(WebGLRenderingContext.prototype, "getParameter", "WebGL fingerprinting (getParameter)");
    safeWrap(WebGLRenderingContext.prototype, "getSupportedExtensions", "WebGL fingerprinting (extensions)");
  }
  if (window.WebGL2RenderingContext) {
    safeWrap(WebGL2RenderingContext.prototype, "getParameter", "WebGL fingerprinting (getParameter)");
  }

  // Audio fingerprinting
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    safeWrap(AC.prototype, "createOscillator", "Audio fingerprinting (AudioContext)");
    safeWrap(AC.prototype, "createDynamicsCompressor", "Audio fingerprinting (AudioContext)");
    if (window.OfflineAudioContext || window.webkitOfflineAudioContext) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      safeWrap(OAC.prototype, "startRendering", "Audio fingerprinting (OfflineAudioContext)");
    }
  }

  // Font / plugin enumeration
  safeWrap(Navigator.prototype, "plugins", "Plugin enumeration", true);
  safeWrap(Navigator.prototype, "mimeTypes", "MIME type enumeration", true);

  // Battery status API
  if (navigator.getBattery) {
    safeWrap(Navigator.prototype, "getBattery", "Battery status fingerprinting");
  }

  // Hardware concurrency / device memory (often combined with other signals)
  safeWrap(Navigator.prototype, "hardwareConcurrency", "Hardware concurrency probing", true);
  safeWrap(Navigator.prototype, "deviceMemory", "Device memory probing", true);

  // WebRTC local IP leak technique (constructors need a Proxy, not a plain
  // function wrap, or `new` breaks the resulting instance's prototype chain).
  if (window.RTCPeerConnection) {
    try {
      const OriginalRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = new Proxy(OriginalRTC, {
        construct(target, args) {
          report("WebRTC IP probing");
          return new target(...args);
        }
      });
    } catch (e) {
      // ignore
    }
  }
})();
