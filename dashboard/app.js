// Token Radar's dashboard (radar-3). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, a live-token view, and a model sandbox that re-ranks the board
// from the same arithmetic. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var rows = DATA.rows, live = DATA.live;
  var M0 = DATA.model;
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
  function multOf(cat, k) {
    var c = CATMAP[cat || 'Uncategorized'];
    if (!c) return DATA.global_multiple;
    var w = c.peers / (c.peers + k);
    return Math.min(M0.multiple_cap, w * c.trimmed_median + (1 - w) * DATA.global_multiple);
  }
  function breakdown(row, S) {
    var cm = multOf(row.category, S.shrink_k);
    var cg = GMAP[row.category || 'Uncategorized'];
    if (cg === undefined) cg = GLOB_G;
    var g = row.change_7d === null || row.change_7d === undefined ? cg : Math.min(M0.growth_cap, Math.max(M0.growth_floor, row.change_7d));
    var gm = Math.min(M0.growth_mult_cap, Math.max(M0.growth_mult_floor, 1 + (g - cg) / 100 * S.growth_weight));
    var age = row.age_days === null || row.age_days === undefined ? M0.unknown_age_days : row.age_days;
    var rise = Math.min(age, M0.tenure_peak_days) / M0.tenure_peak_days;
    var fall = Math.max(0, age - M0.tenure_peak_days) / M0.tenure_decline_days;
    var tm = Math.max(M0.tenure_floor, M0.tenure_floor + (S.tenure_peak - M0.tenure_floor) * rise - M0.tenure_decline * Math.min(fall, 1));
    var nch = Math.max(1, row.chains.length);
    var ch = 1 + S.chain_weight * (Math.min(Math.log(nch), M0.chain_cap_ln) / M0.chain_cap_ln);
    var implied = Math.max(1, Math.round(row.tvl_usd * cm * gm * tm * ch));
    return { cm: cm, cg: cg, growthPct: g, gm: gm, tm: tm, ch: ch, age: age, implied: implied };
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
      list = list.map(function (r) { var b = breakdown(r, M); return { r: r, implied: b.implied }; });
      list.sort(function (a, b) { return b.implied - a.implied || (a.r.slug < b.r.slug ? -1 : 1); });
      return list.map(function (x, i) { return { row: x.r, implied: x.implied, rank: i + 1 }; });
    }
    var key = state.sort, dir = state.dir;
    list.sort(function (a, b) {
      var va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return list.map(function (r) { return { row: r, implied: r.implied_value_usd, rank: r.rank }; });
  }
  function sortVal(r, key) {
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d === null ? -1e9 : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'chains') return r.chains.length;
    if (key === 'multiple') return r.category_multiple;
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'category') return (r.category || '').toLowerCase();
    return r.rank;
  }

  function render() {
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === state.tab); });
    document.getElementById('controls').style.display = state.tab === 'board' ? '' : 'none';
    document.getElementById('sandbox').style.display = state.tab === 'board' ? '' : 'none';
    document.getElementById('modelSec').hidden = state.tab !== 'model';
    if (state.tab === 'live') { renderLive(); return; }
    if (state.tab === 'model') { renderModel(); app.innerHTML = ''; return; }
    var list = filtered();
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols' + (sandboxActive() ? ' · sandbox re-rank' : '');
    if (list.length === 0) { app.innerHTML = '<div class="empty">No protocol matches this filter.</div>'; return; }
    var cols = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['change', '7d'], ['age', 'No token for'], ['multiple', 'Multiple'], ['implied', 'Implied value'], ['token', 'Token']];
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
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + x.rank + '</td><td class="name">' + esc(r.name) + wl + '<small>' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</small></td><td>' + fmtUsd(r.tvl_usd) + '</td><td>' + chg + '</td><td>' + fmtAge(r.age_days) + '</td><td>' + r.category_multiple.toFixed(2) + '×<small style="display:block;color:var(--muted);font-size:11px">' + r.category_peers + (r.category_peers === 1 ? ' peer' : ' peers') + '</small></td><td><b>' + fmtUsd(x.implied) + '</b><span class="bar"><i style="width:' + pct + '%"></i></span></td><td>no token</td></tr>';
    }).join('');
    app.innerHTML = h + '</tbody></table>';
    app.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
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
    app.innerHTML = h + '</tbody></table><p class="note" style="color:var(--muted);font-size:13px">Live tokens already trade, so the board shows the market\u2019s own value — never a model\u2019s. These are the comparables the category multiples are built from.</p>';
    document.getElementById('count').textContent = live.length + ' live tokens by market cap';
  }

  function renderModel() {
    var tb = document.querySelector('#catTable tbody');
    tb.innerHTML = DATA.categories.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + c.median.toFixed(3) + '×</td><td>' + c.trimmed_median.toFixed(3) + '×</td><td>' + c.range_low.toFixed(3) + '× – ' + c.range_high.toFixed(3) + '×</td><td><b>' + c.multiple.toFixed(3) + '×</b>' + (c.capped ? ' (capped)' : '') + '</td></tr>';
    }).join('');
    document.getElementById('srcNote').textContent = 'Snapshot as of ' + DATA.as_of + ' · ' + DATA.source + ' · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' · global median multiple ' + DATA.global_multiple.toFixed(3) + '× · ' + DATA.watchlist_size + ' watchlist protocols, ' + DATA.board_size + ' board rows.';
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
      + '<tr><td>Category multiple (' + esc(r.category || 'Uncategorized') + ', ' + r.category_peers + (r.category_peers === 1 ? ' live peer' : ' live peers') + ', range ' + r.category_range_low.toFixed(3) + '×–' + r.category_range_high.toFixed(3) + '×)</td><td>' + b.cm.toFixed(3) + '×</td></tr>'
      + '<tr><td>7d change vs category median (' + fmtPct(b.cg) + ')</td><td>' + fmtPct(b.growthPct) + ' → ' + b.gm.toFixed(3) + '×</td></tr>'
      + '<tr><td>Tenure (' + fmtAge(b.age) + ')</td><td>' + b.tm.toFixed(3) + '×</td></tr>'
      + '<tr><td>Chains (' + r.chains.length + ')</td><td>' + b.ch.toFixed(3) + '×</td></tr>'
      + '<tr><td><b>Implied value</b></td><td><b>' + fmtUsd(b.implied) + '</b></td></tr></table>';
    if (peers.length) {
      h += '<h3>Live comparables — the peers behind the multiple</h3><table><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>mcap ÷ TVL</th></tr>';
      peers.forEach(function (p) { h += '<tr><td>' + esc(p.name) + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + fmtUsd(p.mcap_usd) + '</td><td>' + p.multiple.toFixed(2) + '×</td></tr>'; });
      h += '</table>';
    }
    h += '<h3>Farm plan — 7 steps</h3><ol>';
    r.farm_steps.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
    h += '</ol><p class="note" style="color:var(--muted);font-size:13px">This protocol records no token in the snapshot. A token may or may not launch; the implied value is this radar\u2019s own claim, never a prediction.</p>';
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
        ? 'Sandbox changed — the board above is re-ranked live from your constants, not the submitted radar-3 model.'
        : 'Sandbox at the submitted radar-3 constants.';
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
    document.getElementById('sandboxNote').textContent = 'Sandbox at the submitted radar-3 constants.';
    render();
  });

  document.getElementById('meta').textContent = 'Snapshot ' + DATA.as_of + ' · ' + DATA.board_size + ' protocols ranked · ' + DATA.watchlist_size + ' on the watchlist · model radar-3';
  (function fillStats() {
    var total = 0;
    rows.forEach(function (r) { total += r.implied_value_usd; });
    var stats = [
      [DATA.watchlist_size + '/' + DATA.watchlist_size, 'watchlist covered'],
      [String(DATA.board_size), 'pre-token rows'],
      [String(DATA.early_size), 'early rows'],
      [String(DATA.live_size), 'live tokens set aside'],
      [fmtUsd(total), 'total implied value'],
      [DATA.global_multiple.toFixed(3) + '×', 'median benchmark multiple'],
    ];
    document.getElementById('stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  })();
  readHash();
  render();
  if (state.selected) openDetail(state.selected);
})();
