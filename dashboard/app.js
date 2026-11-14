// Token Radar's dashboard (radar-4). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, a live-token view, a model section with the fitted curve's
// scatter chart, and a model sandbox that re-ranks the board — and the farm slice and the category
// table with it — from the same arithmetic. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var rows = DATA.rows, live = DATA.live;
  var M0 = DATA.model, FIT = DATA.fit;
  var state = { q: '', category: 'all', chain: 'all', tvlIdx: 0, wl: false, tab: 'board', sort: 'implied', dir: -1, selected: null };
  var M = { growth_weight: M0.growth_weight, tenure_peak: M0.tenure_peak, shrink_k: M0.shrink_k, chain_weight: M0.chain_weight };
  var TVL_STEPS = [0, 5e6, 1e7, 2.5e7, 5e7, 1e8, 2.5e8, 5e8, 1e9, 2.5e9];
  var WL = {};
  DATA.watchlist.forEach(function (s) { WL[s] = true; });
  var CATMAP = {};
  DATA.categories.forEach(function (c) { CATMAP[c.category] = c; });
  var GMAP = DATA.growth_medians.by, GLOB_G = DATA.growth_medians.global;
  var app = document.getElementById('board');
  var detailEl = document.getElementById('detail');

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtMoney2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + n.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model in one function, mirroring lib/model.ts: the page recomputes a row from the snapshot
  // figures and the sandbox constants, so the page's code and the board's data are the same model.
  function curveOf(tvl) {
    if (!tvl || tvl <= 0 || !isFinite(tvl)) return 1;
    return Math.pow(10, FIT.intercept + FIT.elasticity * Math.log10(tvl));
  }
  function factorOf(cat, k) {
    var c = CATMAP[cat || 'Uncategorized'];
    if (!c) return 1;
    var w = c.peers / (c.peers + k);
    var f = w * c.resid_median + (1 - w) * FIT.median_residual;
    return Math.min(M0.factor_cap, Math.max(M0.factor_floor, f));
  }
  function breakdown(row, S) {
    var curve = curveOf(row.tvl_usd);
    var cf = factorOf(row.category, S.shrink_k);
    var cg = GMAP[row.category || 'Uncategorized'];
    if (cg === undefined) cg = GLOB_G;
    var g = row.change_7d === null || row.change_7d === undefined ? cg : Math.min(M0.growth_cap, Math.max(M0.growth_floor, row.change_7d));
    var gm = Math.min(M0.growth_mult_cap, Math.max(M0.growth_mult_floor, 1 + (g - cg) / 100 * S.growth_weight));
    var age = row.age_days === null || row.age_days === undefined ? M0.unknown_age_days : row.age_days;
    var rise = Math.min(age, M0.tenure_peak_days) / M0.tenure_peak_days;
    var fall = Math.max(0, age - M0.tenure_peak_days) / M0.tenure_decline_days;
    var sm = Math.max(M0.tenure_floor, M0.tenure_floor + (S.tenure_peak - M0.tenure_floor) * rise - M0.tenure_decline * Math.min(fall, 1));
    var nch = Math.max(1, row.chains.length);
    var ch = 1 + S.chain_weight * (Math.min(Math.log(nch), M0.chain_cap_ln) / M0.chain_cap_ln);
    var implied = Math.max(1, Math.round(curve * cf * gm * sm * ch));
    var slice = row.tvl_usd > 0 ? Math.round(1000 * (implied / row.tvl_usd) * 0.1 * 100) / 100 : 0;
    return { curve: curve, cf: cf, cg: cg, growthPct: g, gm: gm, sm: sm, ch: ch, age: age, implied: implied, slice: slice };
  }
  function sandboxActive() {
    return M.growth_weight !== M0.growth_weight || M.tenure_peak !== M0.tenure_peak || M.shrink_k !== M0.shrink_k || M.chain_weight !== M0.chain_weight;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase(), minTvl = TVL_STEPS[state.tvlIdx];
    var list = rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (state.wl && !WL[r.slug]) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (sandboxActive()) {
      list = list.map(function (r) { var b = breakdown(r, M); return { r: r, implied: b.implied, slice: b.slice, cf: b.cf }; });
      list.sort(function (a, b) { return b.implied - a.implied || (a.r.slug < b.r.slug ? -1 : 1); });
      return list.map(function (x, i) { return { row: x.r, implied: x.implied, slice: x.slice, cf: x.cf, rank: i + 1 }; });
    }
    var key = state.sort, dir = state.dir;
    list.sort(function (a, b) {
      var va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return list.map(function (r) { return { row: r, implied: r.implied_value_usd, slice: r.slice_per_1k, cf: r.category_factor, rank: r.rank }; });
  }
  function sortVal(r, key) {
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d === null ? -1e9 : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'chains') return r.chains.length;
    if (key === 'factor') return r.category_factor;
    if (key === 'slice') return r.slice_per_1k;
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'category') return (r.category || '').toLowerCase();
    return r.rank;
  }

  function render() {
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === state.tab); });
    document.getElementById('controls').style.display = state.tab === 'board' ? '' : 'none';
    document.getElementById('sandbox').style.display = (state.tab === 'board' || state.tab === 'model') ? '' : 'none';
    document.getElementById('modelSec').hidden = state.tab !== 'model';
    if (state.tab === 'live') { renderLive(); return; }
    if (state.tab === 'model') { renderModel(); app.innerHTML = ''; return; }
    var list = filtered();
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols' + (sandboxActive() ? ' · sandbox re-rank' : '');
    if (list.length === 0) { app.innerHTML = '<div class="empty">No protocol matches this filter.</div>'; return; }
    var cols = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['change', '7d'], ['age', 'No token for'], ['factor', 'Factor'], ['implied', 'Implied value'], ['farm', 'Farm'], ['slice', 'Slice / $1K']];
    var h = '<table class="board"><thead><tr>' + cols.map(function (c) {
      return '<th data-k="' + c[0] + '" class="' + (state.sort === c[0] ? 'sorted' : '') + '">' + c[1] + (state.sort === c[0] ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';
    var maxImp = 0;
    list.forEach(function (x) { if (x.implied > maxImp) maxImp = x.implied; });
    h += list.map(function (x) {
      var r = x.row;
      var chg = r.change_7d === null ? 'n/a' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
      var wl = WL[r.slug] ? ' <span class="pill wl">watchlist</span>' : ' <span class="pill">early</span>';
      var pct = maxImp > 0 ? Math.max(2, Math.round(x.implied / maxImp * 100)) : 0;
      var farm = esc(r.farm_action) + ' · ' + esc(r.chains[0] || '—') + '<small style="display:block;color:var(--muted);font-size:11px">' + esc(r.farm_fee) + ' fee · ' + esc(r.farm_setup) + '</small>';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + x.rank + '</td><td class="name">' + esc(r.name) + wl + '<small>' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</small></td><td>' + fmtUsd(r.tvl_usd) + '</td><td>' + chg + '</td><td>' + fmtAge(r.age_days) + '</td><td>' + x.cf.toFixed(2) + '×<small style="display:block;color:var(--muted);font-size:11px">' + r.category_peers + (r.category_peers === 1 ? ' peer' : ' peers') + '</small></td><td><b>' + fmtUsd(x.implied) + '</b><span class="bar"><i style="width:' + pct + '%"></i></span></td><td>' + farm + '</td><td><b>' + fmtMoney2(x.slice) + '</b></td></tr>';
    }).join('');
    app.innerHTML = h + '</tbody></table>';
    app.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        if (k === 'farm') return;
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
        render();
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function renderLive() {
    var h = '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th>TVL</th><th>Market cap</th><th>mcap ÷ TVL</th><th>7d</th></tr></thead><tbody>';
    h += live.map(function (r) {
      var mult = r.tvl_usd > 0 && r.mcap_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : 'n/a';
      var chg = r.change_7d === null ? 'n/a' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
      return '<tr><td class="name">' + esc(r.name) + '<small>' + esc(r.slug) + '</small></td><td><span class="pill">' + esc(r.category || 'Uncategorized') + '</span></td><td>' + r.chains.length + '</td><td>' + fmtUsd(r.tvl_usd) + '</td><td><b>' + fmtUsd(r.mcap_usd) + '</b></td><td>' + mult + '</td><td>' + chg + '</td></tr>';
    }).join('');
    app.innerHTML = h + '</tbody></table><p class="note" style="color:var(--muted);font-size:13px">Live tokens already trade, so the board shows the market\u2019s own value — never a model\u2019s. These are the comparables the curve is fitted on (exchanges excluded here too).</p>';
    document.getElementById('count').textContent = live.length + ' live tokens by market cap';
  }

  function renderChart() {
    var el = document.getElementById('fitChart');
    if (!el || !FIT.points || !FIT.points.length) return;
    var W = 640, H = 340, PL = 52, PR = 14, PT = 12, PB = 36;
    var lxs = FIT.points.map(function (p) { return Math.log10(p[0]); });
    var lys = FIT.points.map(function (p) { return Math.log10(p[1]); });
    var x0 = Math.min.apply(null, lxs), x1 = Math.max.apply(null, lxs);
    var y0 = Math.min.apply(null, lys), y1 = Math.max.apply(null, lys);
    x0 = Math.floor(x0) - 0.3; x1 = Math.ceil(x1) + 0.3;
    y0 = Math.floor(y0) - 0.3; y1 = Math.ceil(y1) + 0.3;
    var X = function (v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); };
    var Y = function (v) { return PT + (y1 - v) / (y1 - y0) * (H - PT - PB); };
    var line = function (off) {
      var a = X(x0), b = Y(FIT.intercept + FIT.elasticity * x0 + off);
      var c = X(x1), d = Y(FIT.intercept + FIT.elasticity * x1 + off);
      return a.toFixed(1) + ',' + b.toFixed(1) + ' ' + c.toFixed(1) + ',' + d.toFixed(1);
    };
    var dots = FIT.points.map(function (p) {
      return '<circle cx="' + X(Math.log10(p[0])).toFixed(1) + '" cy="' + Y(Math.log10(p[1])).toFixed(1) + '" r="2.6" fill="#34d399" opacity="0.75"/>';
    }).join('');
    var xticks = [];
    for (var tx = Math.ceil(x0); tx <= x1; tx++) {
      xticks.push('<line x1="' + X(tx).toFixed(1) + '" y1="' + (H - PB) + '" x2="' + X(tx).toFixed(1) + '" y2="' + PT + '" stroke="#223129" stroke-width="1"/><text x="' + X(tx).toFixed(1) + '" y="' + (H - 12) + '" fill="#93a89a" font-size="11" text-anchor="middle">$10^' + tx + '</text>');
    }
    var yticks = [];
    for (var ty = Math.ceil(y0); ty <= y1; ty++) {
      yticks.push('<line x1="' + PL + '" y1="' + Y(ty).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + Y(ty).toFixed(1) + '" stroke="#223129" stroke-width="1"/><text x="' + (PL - 6) + '" y="' + (Y(ty) + 4).toFixed(1) + '" fill="#93a89a" font-size="11" text-anchor="end">$10^' + ty + '</text>');
    }
    var l3 = Math.log10(3);
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter chart of live tokens: market cap against TVL, with the fitted curve">'
      + xticks.join('') + yticks.join('')
      + '<polyline points="' + line(l3) + '" fill="none" stroke="#93a89a" stroke-width="1" stroke-dasharray="4 4"/>'
      + '<polyline points="' + line(-l3) + '" fill="none" stroke="#93a89a" stroke-width="1" stroke-dasharray="4 4"/>'
      + '<polyline points="' + line(0) + '" fill="none" stroke="#eef2ea" stroke-width="2"/>'
      + dots
      + '<text x="' + (W - PR) + '" y="' + (PT + 12) + '" fill="#93a89a" font-size="11" text-anchor="end">TVL (log) →</text>'
      + '</svg>';
    document.getElementById('fitNote').textContent = 'log10(mcap) = ' + FIT.intercept + ' + ' + FIT.elasticity + ' × log10(tvl) · R² ' + FIT.r2 + ' · ' + FIT.n + ' live tokens (exchanges and bridges excluded) · ' + FIT.within_3x + ' within 3× of the curve · median residual ' + FIT.median_residual + '×. Each dot is one live token; the solid line is the fitted curve, the dashed lines are 3× above and below it.';
  }

  function renderModel() {
    renderChart();
    var tb = document.querySelector('#catTable tbody');
    tb.innerHTML = DATA.categories.map(function (c) {
      var f = factorOf(c.category, M.shrink_k);
      return '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + c.median.toFixed(3) + '×</td><td>' + c.resid_median.toFixed(2) + '×</td><td>' + c.range_low.toFixed(2) + '× – ' + c.range_high.toFixed(2) + '×</td><td><b>' + f.toFixed(2) + '×</b>' + (c.capped ? ' (capped)' : '') + '</td></tr>';
    }).join('');
    document.getElementById('srcNote').textContent = 'Snapshot as of ' + DATA.as_of + ' · ' + DATA.source + ' · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' · ' + DATA.watchlist_size + ' watchlist protocols, ' + DATA.board_size + ' board rows' + (sandboxActive() ? ' · sandbox re-rank: factors below use shrinkage k=' + M.shrink_k + '.' : '');
  }

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.selected = slug;
    var b = breakdown(r, M);
    var peers = DATA.peers[r.category || 'Uncategorized'] || [];
    var h = '<button class="close" id="dClose">Close ×</button><h2>' + esc(r.name) + '</h2><div class="meta">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + ' · listed ' + (r.listed_at || 'unknown') + '</div>';
    h += '<h3>Implied value — ' + fmtUsd(b.implied) + '</h3><table><tr><th>Input</th><th>Value</th></tr>'
      + '<tr><td>TVL</td><td>' + fmtUsd(r.tvl_usd) + '</td></tr>'
      + '<tr><td>Curve value (fitted, β ' + FIT.elasticity + ')</td><td>' + fmtUsd(b.curve) + '</td></tr>'
      + '<tr><td>Category factor (' + esc(r.category || 'Uncategorized') + ', ' + r.category_peers + (r.category_peers === 1 ? ' live peer' : ' live peers') + ', residual ' + r.category_resid_median.toFixed(2) + '×, range ' + r.category_resid_low.toFixed(2) + '×–' + r.category_resid_high.toFixed(2) + '×)</td><td>' + b.cf.toFixed(2) + '×</td></tr>'
      + '<tr><td>7d change vs category median (' + fmtPct(b.cg) + ')</td><td>' + fmtPct(b.growthPct) + ' → ' + b.gm.toFixed(2) + '×</td></tr>'
      + '<tr><td>Seasoning (' + fmtAge(b.age) + ')</td><td>' + b.sm.toFixed(2) + '×</td></tr>'
      + '<tr><td>Chains (' + r.chains.length + ')</td><td>' + b.ch.toFixed(2) + '×</td></tr>'
      + '<tr><td>Slice per $1K staked (10% to depositors)</td><td><b>' + fmtMoney2(b.slice) + '</b></td></tr>'
      + '<tr><td><b>Implied value</b></td><td><b>' + fmtUsd(b.implied) + '</b></td></tr></table>';
    if (peers.length) {
      h += '<h3>Live comparables — the peers behind the factor</h3><table><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>mcap ÷ TVL</th><th>Residual</th></tr>';
      peers.forEach(function (p) { h += '<tr><td>' + esc(p.name) + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + fmtUsd(p.mcap_usd) + '</td><td>' + p.multiple.toFixed(2) + '×</td><td>' + p.residual.toFixed(2) + '×</td></tr>'; });
      h += '</table>';
    }
    h += '<h3>Farm plan — 7 steps</h3><ol>';
    r.farm_steps.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
    h += '</ol><p class="note" style="color:var(--muted);font-size:13px">This protocol records no token in the snapshot. A token may or may not launch; the implied value is this radar\u2019s own claim, never a prediction. Gas figures are typical estimates, not quotes.</p>';
    detailEl.innerHTML = h;
    detailEl.hidden = false;
    document.getElementById('dClose').addEventListener('click', closeDetail);
    writeHash();
  }
  function closeDetail() { state.selected = null; detailEl.hidden = true; detailEl.innerHTML = ''; writeHash(); }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('category')) { state.category = p.get('category'); var sel = document.getElementById('cat'); if (sel) sel.value = state.category; }
    if (p.get('chain')) { state.chain = p.get('chain'); var cs = document.getElementById('chain'); if (cs) cs.value = state.chain; }
    if (p.get('q')) { state.q = p.get('q'); document.getElementById('q').value = state.q; }
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  // Controls
  var cats = [];
  rows.forEach(function (r) { var c = r.category || 'Uncategorized'; if (cats.indexOf(c) < 0) cats.push(c); });
  cats.sort();
  var sel = document.getElementById('cat');
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  var chains = [];
  rows.forEach(function (r) { r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); }); });
  chains.sort();
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); writeHash(); });
  sel.addEventListener('change', function (e) { state.category = e.target.value; render(); writeHash(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); writeHash(); });
  document.getElementById('clear').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvlIdx = 0; state.wl = false;
    document.getElementById('q').value = ''; sel.value = 'all'; chainSel.value = 'all';
    document.getElementById('tvl').value = '0'; document.getElementById('tvlOut').textContent = '$0';
    document.getElementById('wl').checked = false;
    render(); writeHash();
  });
  document.getElementById('tvl').addEventListener('input', function (e) {
    state.tvlIdx = +e.target.value;
    document.getElementById('tvlOut').textContent = state.tvlIdx === 0 ? '$0' : fmtUsd(TVL_STEPS[state.tvlIdx]);
    render();
  });
  document.getElementById('wl').addEventListener('change', function (e) { state.wl = e.target.checked; render(); });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); closeDetail(); render(); writeHash(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // Sandbox
  function bindSlider(id, out, key, fmt) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () {
      M[key] = +el.value;
      document.getElementById(out).textContent = fmt(M[key]);
      document.getElementById('sandboxNote').textContent = sandboxActive()
        ? 'Sandbox changed — the board above is re-ranked live from your constants, not the submitted radar-4 model. The farm slice and the category table move with it.'
        : 'Sandbox at the submitted radar-4 constants.';
      render();
    });
  }
  bindSlider('gw', 'oGw', 'growth_weight', function (v) { return v.toFixed(2); });
  bindSlider('tp', 'oTp', 'tenure_peak', function (v) { return v.toFixed(2); });
  bindSlider('sk', 'oSk', 'shrink_k', function (v) { return String(v); });
  bindSlider('cw', 'oCw', 'chain_weight', function (v) { return v.toFixed(2); });
  document.getElementById('reset').addEventListener('click', function () {
    M = { growth_weight: M0.growth_weight, tenure_peak: M0.tenure_peak, shrink_k: M0.shrink_k, chain_weight: M0.chain_weight };
    document.getElementById('gw').value = M.growth_weight; document.getElementById('oGw').textContent = M.growth_weight.toFixed(2);
    document.getElementById('tp').value = M.tenure_peak; document.getElementById('oTp').textContent = M.tenure_peak.toFixed(2);
    document.getElementById('sk').value = M.shrink_k; document.getElementById('oSk').textContent = String(M.shrink_k);
    document.getElementById('cw').value = M.chain_weight; document.getElementById('oCw').textContent = M.chain_weight.toFixed(2);
    document.getElementById('sandboxNote').textContent = 'Sandbox at the submitted radar-4 constants.';
    render();
  });

  document.getElementById('meta').textContent = 'Snapshot ' + DATA.as_of + ' · ' + DATA.board_size + ' protocols ranked · ' + DATA.watchlist_size + ' on the watchlist · model radar-4';
  (function fillStats() {
    var total = 0;
    rows.forEach(function (r) { total += r.implied_value_usd; });
    var stats = [
      [DATA.watchlist_size + '/' + DATA.watchlist_size, 'watchlist covered'],
      [String(DATA.board_size), 'pre-token rows'],
      [String(DATA.early_size), 'early rows'],
      [String(DATA.live_size), 'live tokens set aside'],
      [fmtUsd(total), 'total implied value'],
      ['β ' + FIT.elasticity + ' · R² ' + FIT.r2, FIT.n + ' comparables set the curve'],
    ];
    document.getElementById('stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  })();
  readHash();
  render();
  if (state.selected) openDetail(state.selected);
})();
