'use strict';
'require view';

'require poll';

// ── Inject Chart.js from CDN (once) ──────────────────────────────────────
// Locating the LuCI session id.
//
// LuCI's sysauth cookie is scoped to Path=/cgi-bin/luci and marked HttpOnly,
// so it is neither sent to sibling CGI scripts nor readable from JS. The page
// env is the only source available to us. L.session.getID() is the documented
// accessor; it returns 32 zeros when not logged in.
function sessionId() {
  var sid = '';
  try {
    if (typeof L !== 'undefined' && L.session && L.session.getID) sid = L.session.getID();
  } catch (e) {}
  if (!sid) {
    try {
      if (typeof L !== 'undefined' && L.env && L.env.sessionid) sid = L.env.sessionid;
    } catch (e) {}
  }
  return /^[a-fA-F0-9]{32}$/.test(sid || '') ? sid : '';
}

// Getting the token to the CGI.
//
// uhttpd exports only a fixed whitelist of headers to CGI processes, so a
// custom header (X-LuCI-Session, which an earlier revision used) is dropped
// ever runs. Authorization and Cookie are both on that whitelist, so the token
// goes through those two. SameSite=Strict on the cookie, and the preflight
// requirement on Authorization, preserve the CSRF protection.
function publishSession() {
  var sid = sessionId();
  if (!sid) return '';
  try {
    document.cookie = 'st_sid=' + sid + '; path=/cgi-bin; SameSite=Strict'
      + (window.location && window.location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {}
  return sid;
}

function stFetchOpts(method) {
  var sid = publishSession();
  var opts = {
    method: method || 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  };
  if (sid) opts.headers = { 'Authorization': 'Bearer ' + sid };
  return opts;
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve();

  // Local copy first: a connectivity dashboard must still render its charts
  // when the WAN or the VPN is down, which is precisely when it gets opened.
  // The CDN is only a fallback for installs where the bundled file was
  // stripped to save flash.
  var SOURCES = [
    (typeof L !== 'undefined' && L.resource)
      ? L.resource('speedtest/chart.umd.min.js')
      : '/luci-static/resources/speedtest/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
  ];

  function chartFailed() {
    document.querySelectorAll('.st-chart-wrap').forEach(function(el) {
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.innerHTML = '<span style="font-family:JetBrains Mono,monospace;font-size:0.72rem;color:var(--st-muted)">\u26a0 Chart.js unavailable</span>';
    });
  }

  return new Promise(function(resolve, reject) {
    var existing = document.getElementById('st-chartjs');
    if (existing) {
      // Another view instance is already loading it - wait, but not forever.
      var tries = 0;
      var t = setInterval(function() {
        if (window.Chart) { clearInterval(t); resolve(); }
        else if (++tries > 125) { clearInterval(t); chartFailed(); reject(new Error('Chart.js load timed out')); }
      }, 80);
      return;
    }

    function attempt(i) {
      if (i >= SOURCES.length) { chartFailed(); reject(new Error('Chart.js unavailable')); return; }
      var s = document.createElement('script');
      s.id = 'st-chartjs';
      s.src = SOURCES[i];
      s.onload = function() { resolve(); };
      s.onerror = function() { s.remove(); attempt(i + 1); };
      document.head.appendChild(s);
    }
    attempt(0);
  });
}

// ── CSS ───────────────────────────────────────────────────────────────────
document.head.append(Object.assign(document.createElement('style'), { textContent: `
  /* ── Speedtest theme tokens ──────────────────────────────────── */
  :root {
    --st-surface: rgba(0,0,0,0.04);
    --st-border:  rgba(0,0,0,0.13);
    --st-green:   #00a355;
    --st-blue:    #1a5fd6;
    --st-orange:  #cc5200;
    --st-purple:  #8a00c8;
    --st-muted:   #94a3b8;
    --st-text:    #111827;
    --st-subtext: #4b5573;
    --st-thead:   rgba(0,0,0,0.05);
    --st-row-hover: rgba(0,0,0,0.04);
    --st-modal-bg:  rgba(240,244,249,0.92);
    --st-modal-box-bg: #ffffff;
    --st-si-bg:  #e8f0ff; --st-si-bd: #93b4f5; --st-si-tx: #1a5fd6;
    --st-so-bg:  #e8fff2; --st-so-bd: #6ed4a0; --st-so-tx: #00a355;
    --st-se-bg:  #fff0f0; --st-se-bd: #f5a0a0; --st-se-tx: #c42b2b;
  }
  :root[data-darkmode="true"] {
    --st-surface: rgba(255,255,255,0.04);
    --st-border:  rgba(255,255,255,0.10);
    --st-green:   #00e676;
    --st-blue:    #2979ff;
    --st-orange:  #ff9100;
    --st-purple:  #d500f9;
    --st-muted:   #4a5568;
    --st-text:    #e2e8f0;
    --st-subtext: #718096;
    --st-thead:   rgba(0,0,0,0.25);
    --st-row-hover: rgba(255,255,255,0.04);
    --st-modal-bg:  rgba(10,12,16,0.92);
    --st-modal-box-bg: #161b27;
    --st-si-bg:  #0a1628; --st-si-bd: #1e3a6e; --st-si-tx: #63a0f5;
    --st-so-bg:  #071a0f; --st-so-bd: #1a4d2e; --st-so-tx: #00e676;
    --st-se-bg:  #1a0a0a; --st-se-bd: #5c1a1a; --st-se-tx: #f66;
  }

  /* ── Layout ──────────────────────────────────────────────────── */
  .st-root { font-family: 'Space Grotesk', 'Inter', sans-serif; }

  .st-toolbar {
    display: flex; align-items: center; gap: 0.6rem;
    margin-bottom: 1.25rem; flex-wrap: wrap;
  }
  .st-last { font-size: 0.72rem; color: var(--st-subtext);
    font-family: 'JetBrains Mono', monospace; margin-left: auto; }

  /* buttons */
  .st-btn {
    display: inline-flex; align-items: center; gap: 0.45rem;
    font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
    font-weight: 600; letter-spacing: 0.8px;
    padding: 0.48rem 1rem; border-radius: 6px; cursor: pointer;
    transition: background 0.15s, color 0.15s; background: transparent;
  }
  .st-btn:disabled { border-color: var(--st-muted) !important; color: var(--st-muted) !important; cursor: not-allowed; }
  .st-btn-run  { border: 1px solid var(--st-green);  color: var(--st-green); }
  .st-btn-run:hover:not(:disabled)  { background: var(--st-green);  color: #000; }
  .st-btn-wg   { border: 1px solid #7c3aed; color: #a78bfa; }
  .st-btn-wg:hover:not(:disabled)   { background: #7c3aed; color: #fff; }
  .st-btn-clr  { border: 1px solid #f44336; color: #f44336; }
  .st-btn-clr:hover:not(:disabled)  { background: #f44336; color: #fff; }

  /* progress ring */
  .st-ring { width: 22px; height: 22px; flex-shrink: 0; }
  .st-ring circle { fill:none; stroke-width:3; stroke-linecap:round; transform-origin:center; }
  .st-ring .st-ring-track { stroke: var(--st-border); }
  .st-ring .st-ring-fill  { stroke-dasharray:60; stroke-dashoffset:60; transform:rotate(-90deg); transition:stroke-dashoffset .8s ease,stroke .5s; }

  /* status bar */
  #st-status { display:none; font-family:'JetBrains Mono',monospace; font-size:0.78rem;
    padding:0.65rem 1rem; border-radius:7px; margin-bottom:1rem; border:1px solid; }
  #st-status.info    { background:var(--st-si-bg); border-color:var(--st-si-bd); color:var(--st-si-tx); }
  #st-status.success { background:var(--st-so-bg); border-color:var(--st-so-bd); color:var(--st-so-tx); }
  #st-status.error   { background:var(--st-se-bg); border-color:var(--st-se-bd); color:var(--st-se-tx); }

  /* stat cards */
  .st-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(115px,1fr));
    gap:0.4rem; margin-bottom:0.5rem; }
  .st-card { background:var(--st-surface); border:1px solid var(--st-border);
    border-radius:10px; padding:0.6rem 0.85rem; }
  .st-card .st-lbl { font-size:0.6rem; text-transform:uppercase; letter-spacing:1.5px;
    color:var(--st-subtext); margin-bottom:0.2rem; }
  .st-card .st-val { font-family:'JetBrains Mono',monospace; font-size:0.95rem;
    font-weight:700; line-height:1; }
  .st-card .st-unit { font-size:0.72rem; font-weight:400; color:var(--st-subtext); margin-left:2px; }
  .st-card.dl .st-val { color:var(--st-green); }
  .st-card.ul .st-val { color:var(--st-blue);  }
  .st-card.lat .st-val { color:var(--st-orange); }
  .st-card.jit .st-val { color:var(--st-purple); }
  .st-card.srv { grid-column:1/-1; display:flex; align-items:center;
    gap:1rem; padding:0.38rem 0.85rem; }
  .st-card.srv .st-val { font-size:0.9rem; color:var(--st-text);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* chart sections */
  .st-chart-sec { background:var(--st-surface); border:1px solid var(--st-border);
    border-radius:12px; padding:0.5rem 0.75rem; margin-bottom:0.5rem; }
  .st-chart-sec h3 { font-size:0.6rem; text-transform:uppercase; letter-spacing:2px;
    color:var(--st-subtext); margin:0 0 0.35rem; font-weight:600; }
  .st-chart-wrap { position:relative; height:115px; }
  .st-chart-row { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.5rem; }
  .st-chart-row .st-chart-sec { margin-bottom:0; }
  @media(max-width:640px){ .st-chart-row { grid-template-columns:1fr; } }

  /* results table */
  .st-results-sec { background:var(--st-surface); border:1px solid var(--st-border);
    border-radius:12px; margin-bottom:1.25rem; overflow:hidden; }
  .st-toggle { width:100%; background:none; border:none; color:var(--st-subtext);
    font-family:'JetBrains Mono',monospace; font-size:0.7rem; text-transform:uppercase;
    letter-spacing:2px; padding:1rem 1.4rem; text-align:left; cursor:pointer;
    display:flex; align-items:center; gap:0.5rem; transition:color 0.15s; }
  .st-toggle:hover { color:var(--st-text); }
  .st-toggle .st-arr { margin-left:auto; transition:transform 0.2s; font-size:0.62rem; }
  .st-toggle.open .st-arr { transform:rotate(180deg); }
  .st-results-body { display:none; overflow-x:auto; border-top:1px solid var(--st-border); }
  .st-scroll-hint { display:none; font-family:'JetBrains Mono',monospace;
    font-size:0.6rem; color:var(--st-muted); text-align:right;
    padding:0.3rem 0.75rem 0; letter-spacing:0.5px; }
  @media(max-width:600px){ .st-scroll-hint { display:block; } }
  .st-results-body.open { display:block; }
  table.st { width:100%; border-collapse:collapse;
    font-family:'JetBrains Mono',monospace; font-size:0.72rem; }
  table.st thead th { background:var(--st-thead); color:var(--st-subtext);
    text-transform:uppercase; letter-spacing:1px; font-size:0.62rem;
    padding:0.55rem 0.9rem; text-align:left; white-space:nowrap;
    border-bottom:1px solid var(--st-border); }
  .st-sort-btns { display:inline-flex; flex-direction:column; gap:0; margin-left:3px; vertical-align:middle; }
  .st-sort-btn { background:none; border:none; color:var(--st-muted); font-size:0.52rem;
    cursor:pointer; padding:0 1px; line-height:1.1; transition:color 0.1s; }
  .st-sort-btn:hover { color:var(--st-text); }
  .st-sort-btn.active { color:var(--st-green); }
  table.st tbody tr { border-bottom:1px solid var(--st-border); transition:background 0.1s; }
  table.st tbody tr:last-child { border-bottom:none; }
  table.st tbody tr:hover { background:var(--st-row-hover); }
  table.st tbody tr.st-row-err { opacity:0.4; }
  table.st tbody td { padding:0.5rem 0.9rem; white-space:nowrap; color:var(--st-text); }
  td.st-dl  { color:var(--st-green);  }
  td.st-ul  { color:var(--st-blue);   }
  td.st-lat { color:var(--st-orange); }
  td.st-jit { color:var(--st-purple); }
  td.st-lwarn { color:var(--st-orange); }
  td.st-lbad  { color:#f44336; }

  /* error banner */
  #st-error { display:none; background:var(--st-se-bg); border:1px solid var(--st-se-bd);
    color:var(--st-se-tx); border-radius:8px; padding:0.8rem 1.1rem;
    font-family:'JetBrains Mono',monospace; font-size:0.78rem; margin-bottom:1.25rem; }

  /* WG divider */
  .st-wg-hdr { border-top:1px solid var(--st-border); margin:2rem 0 1.25rem; padding-top:1.25rem; }
  .st-wg-hdr h3 { font-family:'JetBrains Mono',monospace; font-size:0.82rem;
    color:#a78bfa; letter-spacing:2px; text-transform:uppercase; margin:0; }

  /* clear modal */
  #st-modal { display:none; position:fixed; inset:0; background:var(--st-modal-bg);
    backdrop-filter:blur(4px); z-index:9999; align-items:center; justify-content:center; }
  #st-modal.visible { display:flex; }
  .st-modal-box { background-color: var(--st-modal-box-bg); border:1px solid var(--st-border);
    border-radius:12px; padding:1.6rem 1.85rem; text-align:center; width:300px; max-width:94vw; }
  .st-modal-box h4 { font-family:'JetBrains Mono',monospace; font-size:0.88rem;
    font-weight:700; margin:0 0 0.4rem; color:var(--st-text); }
  .st-modal-box p  { font-size:0.8rem; color:var(--st-subtext); margin-bottom:1.1rem; }
  .st-modal-opts { display:flex; flex-direction:column; gap:0.55rem; }
  .st-modal-opt { background:transparent; border:1px solid var(--st-border); color:var(--st-text);
    font-family:'JetBrains Mono',monospace; font-size:0.76rem;
    padding:0.55rem 0.9rem; border-radius:6px; cursor:pointer;
    transition:background 0.15s, border-color 0.15s; text-align:left; }
  .st-modal-opt:hover { background:var(--st-row-hover); border-color:var(--st-muted); }
  .st-modal-opt.danger { border-color:rgba(244,67,54,0.4); color:#f66; }
  .st-modal-opt.danger:hover { background:var(--st-se-bg); border-color:#f44336; }
  .st-modal-opt.cancel { color:var(--st-subtext); }

  /* ── Mobile optimisations ────────────────────────────────────── */
  @media (max-width: 600px) {

    /* Toolbar */
    .st-toolbar { gap: 0.35rem; }
    .st-btn {
      flex: 1 1 calc(50% - 0.35rem);
      justify-content: center;
      font-size: 0.7rem;
      padding: 0.48rem 0.4rem;
    }
    .st-btn-clr { flex: 0 0 auto; }
    .st-last { margin-left: 0; font-size: 0.65rem; width: 100%; text-align: right; }

    /* Stat cards: 2-column grid */
    .st-cards { grid-template-columns: repeat(2, 1fr); }
    .st-card.srv { grid-column: 1 / -1; }
    .st-card .st-val { font-size: 0.85rem; }
    .st-card .st-lbl { font-size: 0.57rem; }

    /* Charts */
    .st-chart-wrap { height: 120px; }

    /* Results table — force proper table display, override LuCI responsive CSS */
    .st-results-body { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
    table.st           { display: table !important; width: auto !important; min-width: 640px; font-size: 0.67rem; }
    table.st thead     { display: table-header-group !important; }
    table.st tbody     { display: table-row-group !important; }
    table.st tr        { display: table-row !important; }
    table.st th,
    table.st td        { display: table-cell !important; white-space: nowrap; }
    table.st thead th  { padding: 0.4rem 0.5rem; font-size: 0.57rem; }
    table.st tbody td  { padding: 0.4rem 0.5rem; }
    /* Sticky # column */
    table.st th:first-child,
    table.st td:first-child {
      position: sticky; left: 0; z-index: 1;
      background: var(--st-surface);
      border-right: 1px solid var(--st-border);
    }

    /* WG header */
    .st-wg-hdr { margin-top: 1.25rem; }

    /* Status bar */
    #st-status { font-size: 0.72rem; padding: 0.55rem 0.8rem; }
  }
` }));

// ── Helpers ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeHref(url) {
  // Only allow https:// speedtest.net result URLs
  return (url && /^https:\/\/www\.speedtest\.net\/result\//.test(url)) ? url : null;
}

// Server name cleanup — strip trailing " – City" duplicate appended by some Ookla servers
var SVR_NAME_RE = /^(.*)\s[-\u2013\u2014]\s(.*)\s[-\u2013\u2014]\s\2$/;

function parseCsvLine(line) {
  // Quoted-field CSV parser — handles commas inside quoted fields
  var fields = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur);
  return fields;
}
function parseCsv(text) {
  if (!text) return [];
  return text.trim().split('\n').slice(1)
    .map(function(l) { return parseCsvLine(l); })
    .filter(function(p) { return p.length >= 7; });
}

function isDark() {
  return document.documentElement.getAttribute('data-darkmode') === 'true';
}

function chartColors() {
  var dark = isDark();
  return {
    grid:   dark ? 'rgba(30,37,51,0.9)'  : 'rgba(220,226,240,0.9)',
    tick:   dark ? '#4a5568' : '#4b5573',
    legend: dark ? '#a0aec0' : '#4b5573',
    tip_bg: dark ? '#10141c' : '#ffffff',
    tip_bd: dark ? '#1e2533' : '#dde2ee',
  };
}

var CIRCUMFERENCE = 60;
var PHASES = [
  { label:'DOWNLOAD', color:'#00e676' },
  { label:'UPLOAD',   color:'#2979ff' }
];
var _progressIntervals = {};

function startProgress(totalSecs, btnId) {
  var isWg   = btnId === 'st-wg-btn';
  var fillId = isWg ? 'st-wg-ring-fill' : 'st-ring-fill';
  var ringId = isWg ? 'st-wg-ring'      : 'st-ring';
  var phId   = isWg ? 'st-wg-phase'     : 'st-phase';
  var tmId   = isWg ? 'st-wg-timer'     : 'st-timer';
  var lbId   = isWg ? 'st-wg-lbl'       : 'st-lbl';
  var fill   = document.getElementById(fillId);
  var ring   = document.getElementById(ringId);
  var phEl   = document.getElementById(phId);
  var tmEl   = document.getElementById(tmId);
  var lbEl   = document.getElementById(lbId);
  if (!fill) return;
  ring.style.display = 'inline-flex'; phEl.style.display = 'inline';
  tmEl.style.display = 'inline'; lbEl.style.display = 'none';
  fill.style.strokeDashoffset = CIRCUMFERENCE;
  var phDur = totalSecs / 2, phIdx = 0, elapsed = 0;
  function setPhase(i) { phIdx=i; elapsed=0; phEl.textContent=PHASES[i].label; fill.style.stroke=PHASES[i].color; }
  setPhase(0); clearInterval(_progressIntervals[btnId]);
  _progressIntervals[btnId] = setInterval(function() {
    elapsed++;
    var tot = phIdx * phDur + elapsed;
    fill.style.strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(tot/totalSecs, 0.98));
    var m = Math.floor(tot/60), s = Math.floor(tot%60);
    tmEl.textContent = m + ':' + String(s).padStart(2,'0');
    if (elapsed >= phDur && phIdx < 1) setPhase(1);
  }, 1000);
}

function stopProgress(btnId) {
  clearInterval(_progressIntervals[btnId]); delete _progressIntervals[btnId];
  var isWg   = btnId === 'st-wg-btn';
  var fillId = isWg ? 'st-wg-ring-fill' : 'st-ring-fill';
  var ringId = isWg ? 'st-wg-ring'      : 'st-ring';
  var phId   = isWg ? 'st-wg-phase'     : 'st-phase';
  var tmId   = isWg ? 'st-wg-timer'     : 'st-timer';
  var lbId   = isWg ? 'st-wg-lbl'       : 'st-lbl';
  var fill = document.getElementById(fillId);
  var ring = document.getElementById(ringId);
  var phEl = document.getElementById(phId);
  var tmEl = document.getElementById(tmId);
  var lbEl = document.getElementById(lbId);
  if (!fill) return;
  phEl.textContent = 'DONE'; fill.style.stroke = '#00e676'; fill.style.strokeDashoffset = 0;
  setTimeout(function() {
    ring.style.display = 'none'; phEl.style.display = 'none';
    tmEl.style.display = 'none'; lbEl.style.display = 'inline';
  }, 1500);
}

function setStatus(msg, type) {
  var bar = document.getElementById('st-status');
  if (!bar) return;
  bar.textContent = msg; bar.className = type;
  bar.style.display = msg ? 'block' : 'none';
}

function set(id, html){ var el=document.getElementById(id); if(el) el.innerHTML=html; }

// ── Chart factory ─────────────────────────────────────────────────────────
function makeChart(canvasId, datasets, serverArr, suggestedMax) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;
  var c = chartColors();
  var opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode:'index', intersect:false },
    animation: { duration: 350 },
    plugins: {
      legend: { labels: { color:c.legend, font:{family:'JetBrains Mono',size:11}, boxWidth:22, padding:14 } },
      tooltip: {
        backgroundColor:c.tip_bg, borderColor:c.tip_bd, borderWidth:1,
        titleColor:'#e2e8f0', bodyColor:'#a0aec0',
        titleFont:{family:'JetBrains Mono'}, bodyFont:{family:'JetBrains Mono'},
        callbacks: { footer: function(items) {
          if (!items.length || !serverArr) return '';
          var s = serverArr[items[0].dataIndex]; return s ? '⚡ ' + s : '';
        }}
      }
    },
    scales: {
      x: { ticks:{ color:c.tick, font:{family:'JetBrains Mono',size:10}, maxRotation:45 }, grid:{ color:c.grid } },
      y: { ticks:{ color:c.tick, font:{family:'JetBrains Mono',size:10} }, grid:{ color:c.grid }, beginAtZero:true, suggestedMax: suggestedMax || undefined }
    }
  };
  return new Chart(canvas, { type:'line', data:{ labels:[], datasets:datasets }, options:opts });
}

// ── Row renderer ──────────────────────────────────────────────────────────
var COL_INDEX = { time:0, dl:5, ul:6, lat:2, jit:3 };

function renderRows(allRows, tbodyId, countId, sortCol, sortDir) {
  var rows = allRows.slice();
  var idx  = COL_INDEX[sortCol] || 0;
  if (sortCol === 'time') {
    rows.sort(function(a,b){ return sortDir==='desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]); });
  } else {
    rows.sort(function(a,b){ var av=parseFloat(a[idx])||0, bv=parseFloat(b[idx])||0; return sortDir==='desc' ? bv-av : av-bv; });
  }
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  var frag = document.createDocumentFragment();
  rows.forEach(function(p, i) {
    var isErr  = /^(ERROR|TIMEOUT)/.test(p[1]);
    var lossN  = parseFloat(p[4]);
    var lossC  = isNaN(lossN) ? '' : lossN>5 ? 'st-lbad' : lossN>0 ? 'st-lwarn' : '';
    var tr = document.createElement('tr');
    if (isErr) tr.className = 'st-row-err';
    var srvDisplay = (p[1]||'').replace(SVR_NAME_RE, '$1 - $2');
    var safeUrl = safeHref(p[7]);
    tr.innerHTML =
      '<td>'+(i+1)+'</td><td>'+escHtml(p[0])+'</td><td>'+escHtml(srvDisplay)+'</td>'+
      '<td class="st-dl">'+(isErr?'—':parseFloat(p[5]).toFixed(1)+' Mbps')+'</td>'+
      '<td class="st-ul">'+(isErr?'—':parseFloat(p[6]).toFixed(1)+' Mbps')+'</td>'+
      '<td class="st-lat">'+(isErr?'—':parseFloat(p[2]).toFixed(2)+' ms')+'</td>'+
      '<td class="st-jit">'+(isErr?'—':parseFloat(p[3]).toFixed(2)+' ms')+'</td>'+
      '<td class="'+(isErr?'':lossC)+'">'+(isErr?'—':(p[4]==='N/A'?'N/A':lossN.toFixed(2)+'%'))+'</td>'+
      '<td style="text-align:center">'+(!isErr && safeUrl
        ? '<a href="'+safeUrl+'" target="_blank" rel="noopener noreferrer" title="View on speedtest.net" style="color:var(--st-blue);text-decoration:none;font-size:1rem">📊</a>'
        : '<span style="color:var(--st-muted)">—</span>')+'</td>';
    frag.appendChild(tr);
  });
  tbody.innerHTML = '';
  tbody.appendChild(frag);
  var cnt = document.getElementById(countId);
  if (cnt) cnt.textContent = '('+allRows.length+')';
}

// ── HTML template ─────────────────────────────────────────────────────────
function buildHtml() {
  function ring(id) {
    return '<svg class="st-ring" id="'+id+'" viewBox="0 0 24 24" style="display:none" xmlns="http://www.w3.org/2000/svg">'
      + '<circle class="st-ring-track" cx="12" cy="12" r="9.5"/>'
      + '<circle class="st-ring-fill" id="'+id+'-fill" cx="12" cy="12" r="9.5"/>'
      + '</svg>';
  }
  function sortBtns(prefix, col) {
    var d = col==='lat'||col==='jit' ? ['asc','desc'] : ['desc','asc'];
    return '<span class="st-sort-btns">'
      +'<button class="st-sort-btn '+prefix+'" data-col="'+col+'" data-dir="'+d[0]+'">'+(d[0]==='desc'?'↓':'↑')+'</button>'
      +'<button class="st-sort-btn '+prefix+'" data-col="'+col+'" data-dir="'+d[1]+'">'+(d[1]==='desc'?'↓':'↑')+'</button>'
      +'</span>';
  }
  function resultsTable(prefix) {
    return '<div class="st-results-sec">'
      +'<button class="st-toggle" id="'+prefix+'-toggle">'
      +'<span>📋 Results</span> <span id="'+prefix+'-count" style="color:var(--st-subtext)"></span>'
      +'<span class="st-arr">▲</span></button>'
      +'<div class="st-scroll-hint">swipe to scroll →</div>'
      +'<div class="st-results-body" id="'+prefix+'-body">'
      +'<table class="st"><thead><tr>'
      +'<th>#</th>'
      +'<th>Timestamp'+sortBtns(prefix+'-sb','time')+'</th>'
      +'<th>Server</th>'
      +'<th>Download'+sortBtns(prefix+'-sb','dl')+'</th>'
      +'<th>Upload'+sortBtns(prefix+'-sb','ul')+'</th>'
      +'<th>Latency'+sortBtns(prefix+'-sb','lat')+'</th>'
      +'<th>Jitter'+sortBtns(prefix+'-sb','jit')+'</th>'
      +'<th>Packet Loss</th>'
      +'<th>Result</th>'
      +'</tr></thead><tbody id="'+prefix+'-tbody"></tbody></table>'
      +'</div></div>';
  }
  function statsCards(prefix) {
    return '<div class="st-cards">'
      +'<div class="st-card dl"><div class="st-lbl">Download</div><div class="st-val" id="'+prefix+'-dl">—<span class="st-unit">Mbps</span></div></div>'
      +'<div class="st-card ul"><div class="st-lbl">Upload</div><div class="st-val" id="'+prefix+'-ul">—<span class="st-unit">Mbps</span></div></div>'
      +'<div class="st-card lat"><div class="st-lbl">Latency</div><div class="st-val" id="'+prefix+'-lat">—<span class="st-unit">ms</span></div></div>'
      +'<div class="st-card jit"><div class="st-lbl">Jitter</div><div class="st-val" id="'+prefix+'-jit">—<span class="st-unit">ms</span></div></div>'
      +'<div class="st-card"><div class="st-lbl">Peak DL</div><div class="st-val" id="'+prefix+'-pk-dl" style="color:var(--st-green)">—<span class="st-unit">Mbps</span></div>'
      +'<div class="st-lbl" style="margin-top:0.4rem">Lowest DL</div><div class="st-val" id="'+prefix+'-lo-dl" style="color:var(--st-muted)">—<span class="st-unit">Mbps</span></div></div>'
      +'<div class="st-card"><div class="st-lbl">Peak UL</div><div class="st-val" id="'+prefix+'-pk-ul" style="color:var(--st-blue)">—<span class="st-unit">Mbps</span></div>'
      +'<div class="st-lbl" style="margin-top:0.4rem">Lowest UL</div><div class="st-val" id="'+prefix+'-lo-ul" style="color:var(--st-muted)">—<span class="st-unit">Mbps</span></div></div>'
      +'<div class="st-card"><div class="st-lbl">Best Loss</div><div class="st-val" id="'+prefix+'-bl" style="color:var(--st-green)">—<span class="st-unit">%</span></div>'
      +'<div class="st-lbl" style="margin-top:0.4rem">Worst Loss</div><div class="st-val" id="'+prefix+'-wl" style="color:#f44336">—<span class="st-unit">%</span></div></div>'
      +'<div class="st-card srv"><div class="st-lbl">Server</div><div class="st-val" id="'+prefix+'-srv">—</div></div>'
      +'</div>';
  }
  return ''
    // Clear modal
    +'<div id="st-modal">'
    +'<div class="st-modal-box">'
    +'<h4>🗑 Clear Results</h4><p>Which results would you like to clear?</p>'
    +'<div class="st-modal-opts">'
    +'<button class="st-modal-opt" id="st-clr-bb">📡 Broadband results only</button>'
    +'<button class="st-modal-opt" id="st-clr-vpn">🔒 VPN results only</button>'
    +'<button class="st-modal-opt danger" id="st-clr-both">⚠ Clear both</button>'
    +'<button class="st-modal-opt cancel" id="st-clr-cancel">✕ Cancel</button>'
    +'</div></div></div>'
    // Toolbar
    +'<div class="st-toolbar">'
    +ring('st-ring')
    +'<button class="st-btn st-btn-run" id="st-run-btn">'
    +'<span id="st-lbl">▶ RUN TEST</span>'
    +'<span id="st-phase" style="display:none;font-size:0.68rem;opacity:0.7"></span>'
    +'<span id="st-timer" style="display:none;font-size:0.68rem;opacity:0.5"></span>'
    +'</button>'
    +ring('st-wg-ring')
    +'<button class="st-btn st-btn-wg" id="st-wg-btn">'
    +'<span id="st-wg-lbl">▶ RUN VPN TEST</span>'
    +'<span id="st-wg-phase" style="display:none;font-size:0.68rem;opacity:0.7"></span>'
    +'<span id="st-wg-timer" style="display:none;font-size:0.68rem;opacity:0.5"></span>'
    +'</button>'
    +'<button class="st-btn st-btn-clr" id="st-clr-btn">🗑 CLEAR</button>'
    +'<span class="st-last" id="st-last" title="Last broadband test"></span>'
    +'<span class="st-last" id="wg-last" style="margin-left:0.5rem;color:#a78bfa" title="Last VPN test"></span>'
    +'</div>'
    // Status & error
    +'<div id="st-status"></div>'
    +'<div id="st-error">⚠ Could not read results — your LuCI session may have expired. Reload the page.</div>'
    // Broadband section
    + statsCards('s')
    +'<div class="st-chart-sec"><h3>Speed</h3><div class="st-chart-wrap"><canvas id="st-speed-chart"></canvas></div></div>'
    +'<div class="st-chart-row">'
    +'<div class="st-chart-sec"><h3>Latency / Jitter</h3><div class="st-chart-wrap"><canvas id="st-lat-chart"></canvas></div></div>'
    +'<div class="st-chart-sec"><h3>Packet Loss</h3><div class="st-chart-wrap"><canvas id="st-loss-chart"></canvas></div></div>'
    +'</div>'
    + resultsTable('bb')
    // WireGuard section
    +'<div class="st-wg-hdr"><h3>🔒 WireGuard VPN Test</h3></div>'
    + statsCards('wg')
    +'<div class="st-chart-sec"><h3>VPN Speed</h3><div class="st-chart-wrap"><canvas id="wg-speed-chart"></canvas></div></div>'
    +'<div class="st-chart-row">'
    +'<div class="st-chart-sec"><h3>VPN Latency / Jitter</h3><div class="st-chart-wrap"><canvas id="wg-lat-chart"></canvas></div></div>'
    +'<div class="st-chart-sec"><h3>VPN Packet Loss</h3><div class="st-chart-wrap"><canvas id="wg-loss-chart"></canvas></div></div>'
    +'</div>'
    + resultsTable('wg');
}

// ── View ──────────────────────────────────────────────────────────────────
return view.extend({
  _charts: {},
  _servers:   [],
  _wgServers: [],
  _bbRows: [], _wgRows: [],
  _bbSortCol:'time', _bbSortDir:'desc',
  _wgSortCol:'time', _wgSortDir:'desc',
  _pollTimer: null,


  // Both CSVs come from one authenticated endpoint. They used to be symlinked
  // into /www, which made the whole history readable without a LuCI session;
  // fetching them together also halves the forks per refresh.
  // cache:'no-store' matters - LuCI's request module returns stale CSV.
  _fetchResults: function() {
    return fetch('/cgi-bin/get-results.cgi?_=' + Date.now(), stFetchOpts('GET'))
      .then(function(r) { return r.ok ? r.text() : null; })
      .then(function(text) {
        // null distinguishes "could not read" from "file exists but empty".
        if (text === null) return { bb: null, wg: null };
        var BB = '#ST#BB#\n', WG = '\n#ST#WG#\n';
        if (text.indexOf(BB) !== 0) return { bb: null, wg: null };
        var split = text.indexOf(WG, BB.length - 1);
        if (split < 0) return { bb: null, wg: null };
        return {
          bb: text.slice(BB.length, split),
          wg: text.slice(split + WG.length)
        };
      })
      .catch(function() { return { bb: null, wg: null }; });
  },

  load: function() {
    var self = this;
    // Chart.js failing is not fatal - the results tables should still render.
    return loadChartJs()
      .catch(function() { return null; })
      .then(function() { return self._fetchResults(); })
      .catch(function(e) { return { bb: null, wg: null, error: String(e) }; });
  },


  // Unified chart + stat-card update — used for both broadband and WireGuard sections.
  // cfg: { pfx, speedChart, latChart, lossChart, serverArr, lastElId, lastLabel }
  _updateCharts: function(rows, cfg) {
    var labels=[], dl=[], ul=[], ping=[], jitter=[], loss=[];
    cfg.serverArr.length = 0;
    var sorted = rows.slice().sort(function(a,b){ return a[0].localeCompare(b[0]); });
    sorted.forEach(function(p) {
      if (/^(ERROR|TIMEOUT)/.test(p[1])) return;
      labels.push(p[0].slice(5,16));
      cfg.serverArr.push((p[1]||'').replace(SVR_NAME_RE, '$1 - $2'));
      ping.push(parseFloat(p[2])||0);   jitter.push(parseFloat(p[3])||0);
      loss.push(p[4]==='N/A' ? null : (parseFloat(p[4])||0));
      dl.push(parseFloat(p[5])||0);     ul.push(parseFloat(p[6])||0);
    });
    var c = this._charts;
    function upd(ch, lbl) {
      if (!ch) return;
      ch.data.labels = lbl;
      for (var i = 2; i < arguments.length; i++) ch.data.datasets[i-2].data = arguments[i];
      ch.update();
    }
    upd(c[cfg.speedChart], labels, dl, ul);
    upd(c[cfg.latChart],   labels, ping, jitter);
    upd(c[cfg.lossChart],  labels, loss);
    if (!dl.length) return;
    var i = dl.length - 1, px = cfg.pfx;
    set(px+'-dl',    dl[i].toFixed(1)    +'<span class="st-unit">Mbps</span>');
    set(px+'-ul',    ul[i].toFixed(1)    +'<span class="st-unit">Mbps</span>');
    set(px+'-lat',   ping[i].toFixed(1)  +'<span class="st-unit">ms</span>');
    set(px+'-jit',   jitter[i].toFixed(1)+'<span class="st-unit">ms</span>');
    set(px+'-pk-dl', Math.max.apply(null,dl).toFixed(1)+'<span class="st-unit">Mbps</span>');
    set(px+'-lo-dl', Math.min.apply(null,dl).toFixed(1)+'<span class="st-unit">Mbps</span>');
    set(px+'-pk-ul', Math.max.apply(null,ul).toFixed(1)+'<span class="st-unit">Mbps</span>');
    set(px+'-lo-ul', Math.min.apply(null,ul).toFixed(1)+'<span class="st-unit">Mbps</span>');
    var srvEl = document.getElementById(px+'-srv');
    if (srvEl) srvEl.textContent = cfg.serverArr[i] || '—';
    var lastEl = document.getElementById(cfg.lastElId);
    if (lastEl) lastEl.textContent = cfg.lastLabel + labels[i];
    var vl = loss.filter(function(v){ return v !== null; });
    if (vl.length) {
      set(px+'-bl', Math.min.apply(null,vl).toFixed(2)+'<span class="st-unit">%</span>');
      set(px+'-wl', Math.max.apply(null,vl).toFixed(2)+'<span class="st-unit">%</span>');
    }
  },

  _updateBbCharts: function(rows) {
    this._updateCharts(rows, {
      pfx: 's', speedChart: 'speed', latChart: 'lat', lossChart: 'loss',
      serverArr: this._servers, lastElId: 'st-last', lastLabel: 'last run: '
    });
  },

  _updateWgCharts: function(rows) {
    this._updateCharts(rows, {
      pfx: 'wg', speedChart: 'wgSpeed', latChart: 'wgLat', lossChart: 'wgLoss',
      serverArr: this._wgServers, lastElId: 'wg-last', lastLabel: 'vpn: '
    });
  },

  _loadAndRefresh: function() {
    var self = this;
    return self._fetchResults().then(function(res) {
      self._bbRows = parseCsv(res.bb || '');
      self._wgRows = parseCsv(res.wg || '');
      self._updateBbCharts(self._bbRows);
      self._updateWgCharts(self._wgRows);
      renderRows(self._bbRows, 'bb-tbody', 'bb-count', self._bbSortCol, self._bbSortDir);
      renderRows(self._wgRows, 'wg-tbody', 'wg-count', self._wgSortCol, self._wgSortDir);
      var errEl = document.getElementById('st-error');
      if (errEl) {
        // null = endpoint unreachable or session rejected;
        // '' or rows = the file was read successfully.
        if (res.bb === null || res.wg === null) {
          errEl.textContent = '⚠ Could not read results — your LuCI session may have expired. Reload the page.';
          errEl.style.display = 'block';
        } else {
          errEl.style.display = 'none';
        }
      }
      return { bb: self._bbRows.length, wg: self._wgRows.length };
    });
  },


  render: function(data) {
    var self = this;

    var root = E('div', { class:'st-root' });
    root.innerHTML = buildHtml();

    // ── Init charts once the canvases are actually in the document ────────
    // LuCI inserts the node returned by render() asynchronously; polling for
    // the canvas is more reliable than guessing a fixed delay.
    var initTries = 0;
    function initCharts() {
      if (!document.getElementById('st-speed-chart')) {
        if (++initTries > 60) return;
        setTimeout(initCharts, 50);
        return;
      }
      var ds = {
        speed: [
          { label:'Download Mbps', data:[], borderColor:'#00e676', backgroundColor:'#00e67614', fill:true, tension:0.35, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:'#00e676' },
          { label:'Upload Mbps',   data:[], borderColor:'#2979ff', backgroundColor:'#2979ff14', fill:true, tension:0.35, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:'#2979ff' }
        ],
        lat: [
          { label:'Latency ms', data:[], borderColor:'#ff9100', backgroundColor:'#ff910014', fill:true, tension:0.35, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:'#ff9100' },
          { label:'Jitter ms',  data:[], borderColor:'#d500f9', backgroundColor:'#d500f914', fill:true, tension:0.35, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:'#d500f9' }
        ],
        loss: [
          { label:'Packet Loss %', data:[], borderColor:'#f44336', backgroundColor:'#f4433614', fill:true, tension:0.35, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:'#f44336', spanGaps:true }
        ]
      };
      // Destroy existing Chart instances to free canvas contexts + RAF loops
      Object.keys(self._charts).forEach(function(k) {
        if (self._charts[k] && typeof self._charts[k].destroy === 'function') {
          self._charts[k].destroy();
        }
      });
      self._charts = {};
      self._charts.speed   = makeChart('st-speed-chart', ds.speed, self._servers, 2000);
      self._charts.lat     = makeChart('st-lat-chart', ds.lat, self._servers);
      self._charts.loss    = makeChart('st-loss-chart', ds.loss, self._servers, 100);
      self._charts.wgSpeed = makeChart('wg-speed-chart', JSON.parse(JSON.stringify(ds.speed)), self._wgServers, 500);
      self._charts.wgLat   = makeChart('wg-lat-chart', JSON.parse(JSON.stringify(ds.lat)), self._wgServers);
      self._charts.wgLoss  = makeChart('wg-loss-chart', JSON.parse(JSON.stringify(ds.loss)), self._wgServers, 100);

      // Populate with loaded data
      if (data && !data.error) {
        self._bbRows = parseCsv(data.bb);
        self._wgRows = parseCsv(data.wg);
        self._updateBbCharts(self._bbRows);
        self._updateWgCharts(self._wgRows);
        renderRows(self._bbRows, 'bb-tbody', 'bb-count', self._bbSortCol, self._bbSortDir);
        renderRows(self._wgRows, 'wg-tbody', 'wg-count', self._wgSortCol, self._wgSortDir);
        var errEl = root.querySelector('#st-error');
        if (errEl) errEl.style.display = (data.bb===null || data.wg===null) ? 'block' : 'none';
      }
    }
    initCharts();

    // ── Sort buttons ──────────────────────────────────────────────────────
    root.querySelectorAll('.bb-sb').forEach(function(btn) {
      btn.addEventListener('click', function() {
        root.querySelectorAll('.bb-sb').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        self._bbSortCol = btn.dataset.col;
        self._bbSortDir = btn.dataset.dir;
        renderRows(self._bbRows, 'bb-tbody', 'bb-count', self._bbSortCol, self._bbSortDir);
      });
    });
    root.querySelectorAll('.wg-sb').forEach(function(btn) {
      btn.addEventListener('click', function() {
        root.querySelectorAll('.wg-sb').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        self._wgSortCol = btn.dataset.col;
        self._wgSortDir = btn.dataset.dir;
        renderRows(self._wgRows, 'wg-tbody', 'wg-count', self._wgSortCol, self._wgSortDir);
      });
    });
    // Activate default (time desc) sort buttons
    var defBb = root.querySelector('.bb-sb[data-col="time"][data-dir="desc"]');
    if (defBb) defBb.classList.add('active');
    var defWg = root.querySelector('.wg-sb[data-col="time"][data-dir="desc"]');
    if (defWg) defWg.classList.add('active');

    // ── Results toggles ───────────────────────────────────────────────────
    ['bb','wg'].forEach(function(pfx) {
      var btn = root.querySelector('#'+pfx+'-toggle');
      if (btn) btn.addEventListener('click', function() {
        btn.classList.toggle('open');
        var body = root.querySelector('#'+pfx+'-body');
        if (body) body.classList.toggle('open');
      });
    });

    // ── Clear modal ───────────────────────────────────────────────────────
    function openModal()  { var m=root.querySelector('#st-modal'); if(m) m.classList.add('visible'); }
    function closeModal() { var m=root.querySelector('#st-modal'); if(m) m.classList.remove('visible'); }

    var clrBtn = root.querySelector('#st-clr-btn');
    if (clrBtn) clrBtn.addEventListener('click', openModal);
    var cancelBtn = root.querySelector('#st-clr-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    function doClear(target) {
      closeModal();
      var btn = root.querySelector('#st-clr-btn');
      if (btn) btn.disabled = true;
      fetch('/cgi-bin/clear-results.cgi?target='+target+'&_='+Date.now(), stFetchOpts('POST'))
        .then(function(r){ return r.json(); })
        .then(function(json) {
          if (json.status==='ok') {
            var msg = target==='both' ? 'Both results cleared.' : (target==='broadband'?'Broadband':'VPN')+' results cleared.';
            setStatus('✓ '+msg, 'success');
            self._loadAndRefresh().then(function(){ setTimeout(function(){ setStatus('',''); }, 3000); });
          } else { setStatus('⚠ Could not clear: '+(json.message||''), 'error'); }
        })
        .catch(function(){ setStatus('⚠ Could not contact clear-results endpoint.','error'); })
        .finally(function(){ var b=root.querySelector('#st-clr-btn'); if(b) b.disabled=false; });
    }

    var bbBtn = root.querySelector('#st-clr-bb');
    if (bbBtn) bbBtn.addEventListener('click', function(){ doClear('broadband'); });
    var vpnBtn = root.querySelector('#st-clr-vpn');
    if (vpnBtn) vpnBtn.addEventListener('click', function(){ doClear('vpn'); });
    var bothBtn = root.querySelector('#st-clr-both');
    if (bothBtn) bothBtn.addEventListener('click', function(){ doClear('both'); });

    // ── Run test ──────────────────────────────────────────────────────────
    function runTest(isWg) {
      var btnId  = isWg ? 'st-wg-btn'  : 'st-run-btn';
      var othId  = isWg ? 'st-run-btn' : 'st-wg-btn';
      var lblId  = isWg ? 'st-wg-lbl'  : 'st-lbl';
      var btn    = document.getElementById(btnId);
      var other  = document.getElementById(othId);
      var lbl    = document.getElementById(lblId);
      var url    = '/cgi-bin/run-speedtest.cgi' + (isWg ? '?type=wg' : '');
      var dur    = isWg ? 45 : 30;
      var msg    = isWg ? '⏳ WireGuard speedtest started — ~45 seconds…' : '⏳ Speedtest started — ~30 seconds…';

      function resetBtn() {
        if (btn)   btn.disabled   = false;
        if (other) other.disabled = false;
        if (lbl)   lbl.textContent = isWg ? '▶ RUN VPN TEST' : '▶ RUN TEST';
      }

      if (btn)   btn.disabled   = true;
      if (other) other.disabled = true;
      if (lbl)   lbl.textContent = 'RUNNING…';
      setStatus(msg, 'info');
      var rowsBefore = isWg ? self._wgRows.length : self._bbRows.length;
      startProgress(dur, btnId);
      fetch(url + (url.indexOf('?')>=0 ? '&' : '?') + '_='+Date.now(), stFetchOpts('POST'))
        .then(function(r){ return r.json(); })
        .then(function(json) {
          if (json.status==='already_running') {
            setStatus('⚠ A test is already running, please wait.','error');
            stopProgress(btnId);
            resetBtn();
            return;
          }
          if (json.status!=='started') {
            setStatus('⚠ '+(json.message||'Speedtest could not be started.'),'error');
            stopProgress(btnId);
            resetBtn();
            return;
          }
          // Poll every 5s. The window must outlast the server-side watchdog
          // (90s broadband / 120s VPN) or the UI reports its own timeout
          // instead of the real reason written to the CSV.
          var maxAttempts = isWg ? 32 : 26;
          var attempts = 0;
          var timerKey = isWg ? '_wgPollTimer' : '_bbPollTimer';
          clearInterval(self[timerKey]);
          self[timerKey] = setInterval(function() {
            attempts++;
            self._loadAndRefresh().then(function(counts) {
              var rowsNow = isWg ? counts.wg : counts.bb;
              if (rowsNow > rowsBefore) {
                clearInterval(self[timerKey]);
                stopProgress(btnId);
                var rows = isWg ? self._wgRows : self._bbRows;
                // Find the actual newest row by timestamp regardless of sort order
                var newest = rows.reduce(function(a, b) {
                  return (!a || b[0] > a[0]) ? b : a;
                }, null);
                var isErr = newest && /^(ERROR|TIMEOUT)/.test(newest[1]);
                if (isErr) {
                  var svrInfo = newest[1].replace(/^(?:ERROR|TIMEOUT)\s*/, '');
                  var errMsg;
                  if (/\[no-wg-ip\]/.test(newest[1])) {
                    // Not a network failure - the test never ran.
                    errMsg = '⚠ No WireGuard interface has an IP address. '
                           + 'Is the tunnel connected? If it is, set WG_IFACE in '
                           + '/etc/speedtest.conf to the right interface name.';
                  } else if (/^TIMEOUT/.test(newest[1])) {
                    errMsg = '⚠ Speedtest timed out' + (svrInfo ? ' (' + svrInfo + ')' : '')
                           + ' — the server may be unreachable on this connection.';
                  } else {
                    errMsg = '⚠ Speedtest failed' + (svrInfo ? ' (' + svrInfo + ')' : '')
                           + ' — see /tmp/speedtest-wg-cgi.log for the reason.';
                  }
                  setStatus(errMsg, 'error');
                } else {
                  setStatus('✓ Test complete — charts updated!', 'success');
                  setTimeout(function(){ setStatus('',''); }, 5000);
                }
                resetBtn();
              } else if (attempts >= maxAttempts) {
                clearInterval(self[timerKey]);
                stopProgress(btnId);
                setStatus('⚠ Timed out waiting for result.','error');
                resetBtn();
              }
            });
          }, 5000);
        })
        .catch(function() {
          setStatus('⚠ Could not contact speedtest CGI endpoint.','error');
          stopProgress(btnId);
          resetBtn();
        });
    }

    var runBtn = root.querySelector('#st-run-btn');
    if (runBtn) runBtn.addEventListener('click', function(){ runTest(false); });
    var wgBtn = root.querySelector('#st-wg-btn');
    if (wgBtn)  wgBtn.addEventListener('click',  function(){ runTest(true); });

    // ── Background poll (auto-refresh every 5 min) ────────────────────────
    // Remove previous handler if render() is called again (navigate away + back)
    clearInterval(self._bbPollTimer);
    clearInterval(self._wgPollTimer);
    if (self._bgPollFn) { try { poll.remove(self._bgPollFn); } catch(e){} }
    self._bgPollFn = function() { return self._loadAndRefresh().catch(function(){}); };
    poll.add(self._bgPollFn, 300);

    // Clean up progress ring intervals if user navigates away mid-test.
    // Registered once - render() runs again on every navigate-back.
    if (!window._stUnloadHooked) {
      window._stUnloadHooked = true;
      window.addEventListener('beforeunload', function() {
        Object.keys(_progressIntervals).forEach(function(k) {
          clearInterval(_progressIntervals[k]);
        });
      });
    }

    return root;
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null,
});
