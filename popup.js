const CIRCUMFERENCE = 2 * Math.PI * 52;

const BAND_DESC = {
  Low: "Few or no trackers detected. This site looks relatively privacy-respecting.",
  Moderate: "Some tracking activity detected. Typical of many commercial sites.",
  High: "Substantial tracking, cookies, or fingerprinting detected.",
  Critical: "Heavy tracking and/or active fingerprinting detected on this page."
};

const BAND_COLOR = {
  Low: "var(--low)",
  Moderate: "var(--moderate)",
  High: "var(--high)",
  Critical: "var(--critical)"
};

let activeTabId = null;

function $(id) { return document.getElementById(id); }

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderGauge(score, band) {
  $("scoreValue").textContent = score;
  const offset = CIRCUMFERENCE * (1 - score / 100);
  const fill = $("gaugeFill");
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = BAND_COLOR[band] || "var(--accent)";
  $("bandLabel").textContent = `${band} risk`;
  $("bandLabel").style.color = BAND_COLOR[band] || "var(--text)";
  $("bandDesc").textContent = BAND_DESC[band] || "";
}

function renderBreakdown(breakdown) {
  const maxima = { trackers: 35, cookies: 20, fingerprinting: 30, scripts: 15, volume: 10 };
  const labels = { trackers: "Trackers", cookies: "3P cookies", fingerprinting: "Fingerprint", scripts: "3P scripts", volume: "Volume" };
  const container = $("breakdown");
  container.innerHTML = "";
  for (const key of Object.keys(labels)) {
    const val = breakdown[key] || 0;
    const pct = Math.min(100, Math.round((val / maxima[key]) * 100));
    container.appendChild(
      el(`
        <div class="breakdown-row">
          <span class="breakdown-row__label">${labels[key]}</span>
          <span class="breakdown-row__bar"><span class="breakdown-row__bar-fill" style="width:${pct}%"></span></span>
        </div>
      `)
    );
  }
}

function renderTrackers(trackers, otherThirdParty) {
  const list = $("trackersList");
  const empty = $("trackersEmpty");
  list.innerHTML = "";
  if (!trackers.length && !otherThirdParty.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const t of trackers) {
    list.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${t.host}</div>
            <div class="list-item__tag">${t.category.replace("_", " ")}</div>
          </div>
          <span class="chip chip--${t.category}">${t.category.replace("_", " ")}</span>
          <span class="list-item__count">${t.count}×</span>
        </li>
      `)
    );
  }
  for (const o of otherThirdParty.slice(0, 15)) {
    list.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${o.host}</div>
            <div class="list-item__tag">third-party</div>
          </div>
          <span class="list-item__count">${o.count}×</span>
        </li>
      `)
    );
  }
}

function renderCookies(cookies) {
  $("cookieSummary").innerHTML = "";
  $("cookieSummary").appendChild(
    el(`
      <div class="cookie-stat">
        <div class="cookie-stat__num">${cookies.firstPartyCount}</div>
        <div class="cookie-stat__label">First-party</div>
      </div>
    `)
  );
  $("cookieSummary").appendChild(
    el(`
      <div class="cookie-stat">
        <div class="cookie-stat__num">${cookies.thirdPartyCount}</div>
        <div class="cookie-stat__label">Third-party</div>
      </div>
    `)
  );

  const tp = $("cookiesThirdParty");
  tp.innerHTML = "";
  if (!cookies.thirdParty.length) {
    tp.appendChild(el(`<li class="panel__empty" style="padding:8px 0;">None detected.</li>`));
  }
  for (const c of cookies.thirdParty) {
    tp.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${c.name}</div>
            <div class="list-item__tag">${c.domain}</div>
          </div>
        </li>
      `)
    );
  }

  const fp = $("cookiesFirstParty");
  fp.innerHTML = "";
  if (!cookies.firstParty.length) {
    fp.appendChild(el(`<li class="panel__empty" style="padding:8px 0;">None detected.</li>`));
  }
  for (const c of cookies.firstParty) {
    fp.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${c.name}</div>
            <div class="list-item__tag">${c.domain}</div>
          </div>
        </li>
      `)
    );
  }
}

function renderFingerprint(techniques) {
  const list = $("fpList");
  const empty = $("fpEmpty");
  list.innerHTML = "";
  if (!techniques.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  for (const t of techniques) {
    list.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${t}</div>
          </div>
          <span class="chip chip--fingerprinting">API</span>
        </li>
      `)
    );
  }
}

function renderScripts(scripts) {
  const list = $("scriptsList");
  const empty = $("scriptsEmpty");
  list.innerHTML = "";
  if (!scripts.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  for (const s of scripts) {
    list.appendChild(
      el(`
        <li class="list-item">
          <div class="list-item__main">
            <div class="list-item__host">${s}</div>
          </div>
        </li>
      `)
    );
  }
}

function render(report) {
  if (!report) return;
  $("site").textContent = report.hostname || report.url || "—";
  renderGauge(report.score, report.band);
  renderBreakdown(report.breakdown);
  renderTrackers(report.trackers, report.otherThirdParty);
  renderCookies(report.cookies);
  renderFingerprint(report.fingerprinting);
  renderScripts(report.thirdPartyScripts);
  $("footerNote").textContent = `Live scan · ${report.trackers.length} trackers · ${report.cookies.thirdPartyCount} 3P cookies`;
}

function refresh() {
  if (activeTabId == null) return;
  chrome.runtime.sendMessage({ type: "GET_REPORT_FOR_TAB", tabId: activeTabId }, (report) => {
    if (chrome.runtime.lastError) return;
    render(report);
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add("is-active");
    });
  });
}

function init() {
  setupTabs();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;
    activeTabId = tabs[0].id;
    refresh();
    setInterval(refresh, 1000);
  });
}

document.addEventListener("DOMContentLoaded", init);
