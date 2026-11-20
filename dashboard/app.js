// Token Launch Radar (model radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// arithmetic and the protocol's farm plan, and the live-token set the multiples were calibrated from.
// No network: every byte it shows is in data.js. The view can be named in the URL for a reproducible
// screenshot: ?view=detail&slug=<slug>, ?view=live, ?cat=<category>, ?tier=watchlist|early, ?q=<text>.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  function params() {
    var out = {};
    function eat(str) {
      if (!str) return;
      new URLSearchParams(str).forEach(function (v, k) { out[k] = v; });
    }
    eat(window.location.search.replace(/^\?/, ''));
    if (!out.view) eat(window.location.hash.replace(/^#/, ''));
    return out;
  }
  var P = params();
  var state = {
    view: P.view === 'detail' || P.view === 'live' ? P.view : 'board',
    slug: P.slug || null,
    q: P.q || '',
    category: P.cat || 'all',
    chain: P.chain || 'all',
    tier: P.tier || 'all',
    mintvl: P.mintvl ? Number(P.mintvl) : 0,
    sort: P.sort || 'rank',
  };

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
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.max(0, Math.round(days)) + ' days';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : 'x' + Number(n).toFixed(2); }
  function fmtDate(s) { return s || 'not reported'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function bySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function catRow(name) {
    for (var i = 0; i < DATA.calibration.categories.length; i++) if (DATA.calibration.categories[i].category === name) return DATA.calibration.categories[i];
    return null;
  }

  function header(title, sub) {
    var totalImplied = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    return el('header', { class: 'top' },
      el('div', { class: 'kicker', text: 'Token Launch Radar - model ' + DATA.model_version }),
      el('h1', { text: title }),
      el('p', { class: 'sub', text: sub }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: String(DATA.universe_size) }), el('span', { text: 'protocols in the snapshot' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.pre_token_size) }), el('span', { text: 'record no token' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'ranked on this board' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.watchlist_size) + ' + ' + String(DATA.early_size) }), el('span', { text: 'watchlist + early radar' })),
        el('div', { class: 'stat' }, el('b', { text: fmtUsd(totalImplied) }), el('span', { text: 'total implied launch value' }))));
  }

  function modelStrip() {
    var cal = DATA.calibration;
    var lend = catRow('Lending');
    var dexs = catRow('Dexs');
    var contrast = '';
    if (lend && dexs) {
      contrast = ' On this snapshot the live lending median is ' + fmtMult(lend.median_multiple) +
        ' and the live decentralised-exchange median is ' + fmtMult(dexs.median_multiple) +
        ', so one flat multiple misprices both.';
    }
    var rows = cal.categories.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple) }),
        el('td', { class: 'num', text: fmtMult(c.used_multiple) }));
    });
    var table = el('table', null,
      el('thead', null, el('tr', null,
        el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live peers' }),
        el('th', { class: 'num', text: 'Median mcap / TVL' }), el('th', { class: 'num', text: 'Multiple used' }))),
      el('tbody', null, rows));
    return el('section', { class: 'panel model-strip' },
      el('h2', { text: 'How this board values a launch' }),
      el('p', null,
        'Implied launch value = TVL x category multiple x growth x maturity. The category multiple is the market\u2019s own price: ' +
        'the median market-cap/TVL of the live-token protocols in the same category in this same snapshot (' +
        cal.live_peers + ' live peers, global median ' + fmtMult(cal.global_multiple) + '), shrunk toward that global median by peer count ' +
        'and clamped to [x0.04, x2.50]; a category with fewer than ' + DATA.model.min_peers + ' peers takes the global median. ' +
        'Growth = 1 + clamp(7-day TVL change, -60%, +120%) x ' + DATA.model.growth_weight + '. ' +
        'Maturity = ' + DATA.model.maturity_floor + ' + ' + DATA.model.maturity_range + ' x min(age, 3 years) / 3 years. ' +
        'The house model used one flat multiple for every category.' + contrast),
      el('details', { class: 'cal' },
        el('summary', { text: 'The calibration table (' + cal.categories.length + ' categories priced by their own live peers)' }),
        el('div', { class: 'scroll' }, table)));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.mintvl > 0 && r.tvl_usd < state.mintvl) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = {
      rank: function (r) { return r.rank; },
      implied: function (r) { return -r.implied_value_usd; },
      tvl: function (r) { return -r.tvl_usd; },
      growth: function (r) { return -(r.change_7d === null ? -999 : r.change_7d); },
      age: function (r) { return r.age_days === null ? 1e12 : -r.age_days; },
      name: function (r) { return r.name; },
    }[state.sort] || function (r) { return r.rank; };
    rows.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : a.rank - b.rank; });
    return rows;
  }

  function boardTable() {
    var rows = filteredRows();
    var body = rows.map(function (r) {
      var tr = el('tr', { class: 'row', tabindex: '0', 'data-slug': r.slug },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null,
          el('span', { class: 'pname', text: r.name }),
          el('br'),
          el('span', { class: 'slug', text: r.slug })),
        el('td', null, el('span', { class: 'badge ' + r.tier, text: r.tier })),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { class: 'hide-s', text: r.chains.length ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : 'n/a' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num hide-s', text: fmtMult(r.multiple) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tr.addEventListener('click', function () { openDetail(r.slug); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openDetail(r.slug); });
      return tr;
    });
    return {
      count: rows.length,
      node: el('div', { class: 'scroll' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Set' }),
            el('th', { text: 'Category' }), el('th', { class: 'hide-s', text: 'Chains' }),
            el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }),
            el('th', { class: 'num hide-s', text: 'Multiple' }), el('th', { class: 'num', text: 'Implied value' }))),
          el('tbody', null, body))),
    };
  }

  function controls() {
    var cats = [];
    var chains = [];
    DATA.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
    });
    cats.sort(); chains.sort();
    function select(id, value, options) {
      var s = el('select', { id: id });
      options.forEach(function (o) {
        var opt = el('option', { value: o[0], text: o[1] });
        if (o[0] === value) opt.setAttribute('selected', 'selected');
        s.appendChild(opt);
      });
      return s;
    }
    var search = el('input', { type: 'search', id: 'f-q', placeholder: 'Name or slug', value: state.q });
    var wrap = el('div', { class: 'controls' },
      el('label', null, 'Search', search),
      el('label', null, 'Category', select('f-cat', state.category, [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })))),
      el('label', null, 'Chain', select('f-chain', state.chain, [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })))),
      el('label', null, 'Set', select('f-tier', state.tier, [['all', 'Watchlist + early'], ['watchlist', 'Watchlist only'], ['early', 'Early radar only']])),
      el('label', null, 'Min TVL', select('f-tvl', String(state.mintvl), [['0', 'Any'], ['10000000', '$10M'], ['50000000', '$50M'], ['100000000', '$100M'], ['500000000', '$500M']])),
      el('label', null, 'Sort', select('f-sort', state.sort, [['rank', 'Rank'], ['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d growth'], ['age', 'Age'], ['name', 'Name']])));
    function changed() {
      state.q = search.value;
      state.category = document.getElementById('f-cat').value;
      state.chain = document.getElementById('f-chain').value;
      state.tier = document.getElementById('f-tier').value;
      state.mintvl = Number(document.getElementById('f-tvl').value);
      state.sort = document.getElementById('f-sort').value;
      refreshBoard();
    }
    search.addEventListener('input', changed);
    wrap.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', changed); });
    return wrap;
  }

  var boardMount = null;
  var countMount = null;
  function refreshBoard() {
    if (!boardMount) return;
    var t = boardTable();
    boardMount.textContent = '';
    boardMount.appendChild(t.node);
    countMount.textContent = 'Showing ' + t.count + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its detail: model arithmetic, live peers and farm plan.';
  }

  function tabs(active) {
    function btn(view, label) {
      var b = el('button', { text: label, 'aria-selected': active === view ? 'true' : 'false' });
      b.addEventListener('click', function () { state.view = view; render(); });
      return b;
    }
    return el('div', { class: 'tabs', role: 'tablist' }, btn('board', 'Pre-token board'), btn('live', 'Live tokens (calibration set)'));
  }

  function renderBoard() {
    app.textContent = '';
    boardMount = el('div');
    countMount = el('p', { class: 'count' });
    app.appendChild(header('Which pre-token protocol is worth farming next?',
      'Every protocol in the sealed DefiLlama snapshot of ' + DATA.as_of + ' that records no token, ranked by what its launch would plausibly be worth - with a farm plan for each. ' + DATA.source + '.'));
    app.appendChild(modelStrip());
    app.appendChild(tabs('board'));
    var page = el('div', { class: 'tabpage' });
    page.appendChild(controls());
    page.appendChild(countMount);
    page.appendChild(boardMount);
    app.appendChild(page);
    app.appendChild(footer());
    refreshBoard();
    app.removeAttribute('aria-busy');
  }

  function renderLive() {
    app.textContent = '';
    app.appendChild(header('The calibration set: protocols that already trade',
      'These protocols have a token, so the market - not a model - prices them. Their market-cap/TVL ratios are what the board\u2019s category multiples are calibrated from.'));
    app.appendChild(tabs('live'));
    var body = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', null, el('span', { class: 'pname', text: r.name }), el('br'), el('span', { class: 'slug', text: r.slug })),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
    });
    var page = el('div', { class: 'tabpage' },
      el('p', { class: 'count', text: 'Top ' + DATA.live.length + ' live-token protocols by market cap (exchanges aside). Global median mcap/TVL across ' + DATA.calibration.live_peers + ' live peers: ' + fmtMult(DATA.calibration.global_multiple) + '.' }),
      el('div', { class: 'scroll' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
            el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }),
            el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }))),
          el('tbody', null, body))));
    app.appendChild(page);
    app.appendChild(footer());
    app.removeAttribute('aria-busy');
  }

  function openDetail(slug) {
    state.view = 'detail';
    state.slug = slug;
    try { window.history.replaceState(null, '', '?view=detail&slug=' + encodeURIComponent(slug)); } catch (e) { /* file:// */ }
    render();
    window.scrollTo(0, 0);
  }

  function renderDetail() {
    var r = bySlug(state.slug) || DATA.rows[0];
    app.textContent = '';
    var back = el('a', { class: 'back', href: '#', text: '<- Back to the board' });
    back.addEventListener('click', function (e) { e.preventDefault(); state.view = 'board'; render(); });
    app.appendChild(back);
    app.appendChild(el('div', { class: 'kicker', text: 'Rank #' + r.rank + ' of ' + DATA.board_size + ' - ' + r.tier + ' set' }));
    app.appendChild(el('h1', { text: r.name }));
    app.appendChild(el('p', { class: 'sub', text: r.slug + ' - ' + (r.category || 'Uncategorised') + ' - records no token in the snapshot of ' + DATA.as_of + '.' }));
    app.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('b', { text: fmtUsd(r.implied_value_usd) }), el('span', { text: 'implied launch value (model ' + DATA.model_version + ')' })),
      el('div', { class: 'cell' }, el('b', { text: fmtUsd(r.tvl_usd) }), el('span', { text: 'TVL' })),
      el('div', { class: 'cell' }, el('b', { text: fmtPct(r.change_7d) }), el('span', { text: 'TVL change, 7 days' })),
      el('div', { class: 'cell' }, el('b', { text: fmtAge(r.age_days) }), el('span', { text: 'tracked since ' + fmtDate(r.listed_at) })),
      el('div', { class: 'cell' }, el('b', { text: String(r.chains.length) }), el('span', { text: 'chains: ' + (r.chains.join(', ') || 'none named') }))));

    var cal = r.category ? catRow(r.category) : null;
    var multLabel = r.peers > 0 && cal
      ? 'x category multiple - ' + r.category + ' median ' + fmtMult(cal.median_multiple) + ' across ' + cal.peers + ' live peers, shrunk toward the global ' + fmtMult(DATA.calibration.global_multiple)
      : 'x base multiple - the global median ' + fmtMult(DATA.calibration.global_multiple) + '; its category has too few live peers to price separately';
    var mults = el('table', null,
      el('tbody', null,
        el('tr', null, el('td', { text: 'TVL' }), el('td', { class: 'num', text: fmtUsd(r.tvl_usd) })),
        el('tr', null, el('td', { text: multLabel }), el('td', { class: 'num', text: fmtMult(r.multiple) })),
        el('tr', null, el('td', { text: '= base value' }), el('td', { class: 'num', text: fmtUsd(r.base_usd) })),
        el('tr', null, el('td', { text: 'x growth (7d change ' + fmtPct(r.change_7d) + ', clamped)' }), el('td', { class: 'num', text: fmtMult(r.growth_multiplier) })),
        el('tr', null, el('td', { text: 'x maturity (age ' + fmtAge(r.age_days) + ')' }), el('td', { class: 'num', text: fmtMult(r.maturity_multiplier) })),
        el('tr', null, el('td', null, el('b', { text: '= implied launch value' })), el('td', { class: 'num' }, el('b', { text: fmtUsd(r.implied_value_usd) })))));
    app.appendChild(el('section', { class: 'panel' }, el('h2', { text: 'Why this value' }), mults));

    if (r.peers_list && r.peers_list.length) {
      var peers = r.peers_list.map(function (p) {
        return el('tr', null,
          el('td', { text: p.name }),
          el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
          el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
          el('td', { class: 'num', text: fmtMult(p.multiple) }));
      });
      app.appendChild(el('section', { class: 'panel' },
        el('h2', { text: 'Live peers in ' + (r.category || 'its category') }),
        el('p', { class: 'sub', text: 'The largest tokenised protocols in the same category in this snapshot - the market evidence behind the multiple above.' }),
        el('div', { class: 'scroll' }, el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Mcap / TVL' }))),
          el('tbody', null, peers)))));
    }

    var steps = r.farm_steps.map(function (s) { return el('li', { text: s }); });
    app.appendChild(el('section', { class: 'panel' },
      el('h2', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'Derived from this protocol\u2019s category, chains, TVL and age - the same plan board.json carries.' }),
      el('ol', { class: 'steps' }, steps)));

    app.appendChild(el('p', { class: 'caveat',
      text: 'Read this honestly: DefiLlama records no token for ' + r.name + ' as of ' + DATA.as_of + ' - a record, not a promise. ' +
        'The protocol may never launch a token, a launch may be worth far less or far more than the model\u2019s figure, and farming costs real gas and carries smart-contract risk. ' +
        'The implied value is this entry\u2019s own model claim, stated so it can be checked, not a valuation by anyone else.' }));
    app.appendChild(footer());
    app.removeAttribute('aria-busy');
  }

  function footer() {
    return el('footer', null,
      el('p', { text: 'Data: ' + DATA.source + '. The board is a program\u2019s output, regenerated from the sealed snapshot on every run; two runs write the same bytes. ' +
        'A protocol here \u201crecords no token\u201d in that snapshot - the radar never claims it has none, and never that a token is coming.' }));
  }

  function render() {
    if (state.view === 'detail') renderDetail();
    else if (state.view === 'live') renderLive();
    else renderBoard();
  }
  render();
})();
