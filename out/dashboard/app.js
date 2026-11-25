// Token Radar's static dashboard: renders window.RADAR as the ranked board, the live set, and a detail drawer.
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State and small formatters
  // ---------------------------------------------------------------------------
  var FEED = window.RADAR;
  if (!FEED) return;
  var mount = document.getElementById('board');
  var view = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function asUsd(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
    if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
    return money.format(value);
  }
  function asPercent(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }
  function asAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function modelValue(row, model) {
    var change = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthPart = 1 + (change / 100) * model.growth_weight;
    var days = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturityPart = model.maturity_floor + (Math.min(Math.max(days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthPart * maturityPart));
  }

  // ---------------------------------------------------------------------------
  // Element construction
  // ---------------------------------------------------------------------------
  function make(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'class') node.className = attrs[key];
        else if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
        else if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, attrs[key]);
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

  // ---------------------------------------------------------------------------
  // Farm-plan derivation, mirroring the board's own rules
  // ---------------------------------------------------------------------------
  function primaryChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function budgetFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdWindow(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, budget, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + budget + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + budget + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + budget + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + budget + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + budget + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + budget + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + budget + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + budget + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + budget + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + budget + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + budget + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function finishStep(step) {
    var text = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (text.length > 600) text = text.slice(0, 596) + '...';
    if (text.length < 20) text = text + " Hold the position and check the protocol's own page.";
    return text;
  }
  function planFor(p) {
    var chain = primaryChain(p);
    var budget = budgetFor(p);
    var hold = holdWindow(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, budget, chain), cost: '$' + budget + ' of capital and about $' + (budget >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + budget + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(finishStep);
  }

  // ---------------------------------------------------------------------------
  // Filter, sort and URL hash
  // ---------------------------------------------------------------------------
  function matchingRows() {
    var q = view.q.trim().toLowerCase();
    return FEED.rows.filter(function (r) {
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function orderedRows(list) {
    var key = view.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('p')) view.selected = params.get('p');
    if (params.get('category')) view.category = params.get('category');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.selected) params.set('p', view.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------------------------------------------------------------------------
  // Page sections
  // ---------------------------------------------------------------------------
  function topBar() {
    return make('header', { class: 'top' },
      make('div', { class: 'brand' }, make('span', { class: 'mark' }), make('span', { class: 'brand-name', text: 'Token Radar' })),
      make('div', { class: 'top-meta' },
        make('span', { text: 'Snapshot ' + FEED.as_of }),
        make('span', { text: 'DefiLlama protocol index' }),
        make('span', { text: FEED.model_version + ' model' })
      )
    );
  }

  function intro() {
    return make('section', { class: 'lede' },
      make('div', null,
        make('h1', { text: FEED.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        make('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(FEED.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + FEED.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      make('div', { class: 'facts' },
        make('div', { class: 'fact' }, make('span', { text: 'Watchlist covered' }), make('b', { text: FEED.watchlist_size + ' / ' + FEED.watchlist_size })),
        make('div', { class: 'fact' }, make('span', { text: 'Pre-token rows scored' }), make('b', { text: String(FEED.board_size) })),
        make('div', { class: 'fact' }, make('span', { text: 'Early rows below the floor' }), make('b', { text: String(FEED.early_size) })),
        make('div', { class: 'fact' }, make('span', { text: 'Live-token protocols set aside' }), make('b', { text: String(FEED.live_size) }))
      )
    );
  }

  function filterBar() {
    var categories = Array.from(new Set(FEED.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = make('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { view.q = search.value; writeHash(); render(); });
    var select = make('select', { id: 'category', 'aria-label': 'Filter by category' },
      make('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return make('option', { value: c, text: c, selected: c === view.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { view.category = select.value; writeHash(); render(); });
    var pre = make('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { view.tab = 'pre-token'; render(); } });
    var live = make('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { view.tab = 'live'; render(); } });
    return make('div', { class: 'controls' },
      make('div', { class: 'field' }, make('label', { for: 'q', text: 'Search' }), search),
      make('div', { class: 'field' }, make('label', { for: 'category', text: 'Category' }), select),
      make('div', { class: 'field' }, make('span', { class: 'sub', text: 'Token status' }), make('div', { class: 'tabs' }, pre, live)),
      make('span', { class: 'count', text: view.tab === 'pre-token' ? matchingRows().length + ' rows shown' : FEED.live.length + ' live-token protocols' })
    );
  }

  function sortableHeading(key, label) {
    return make('th', { scope: 'col' },
      make('button', { type: 'button', onclick: function () { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } render(); } },
        label,
        view.sort === key ? make('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function rankedTable() {
    var list = orderedRows(matchingRows());
    if (list.length === 0) {
      return make('div', { class: 'panel' }, make('div', { class: 'empty' },
        make('h2', { text: 'No protocol matches that filter' }),
        make('p', { text: 'Clear the search or pick another category to see the board again.' }),
        make('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { view.q = ''; view.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var body = make('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : asPercent(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      body.appendChild(make('tr', {
        'data-selected': view.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        make('td', { class: 'num', text: String(r.rank) }),
        make('td', null, make('div', { class: 'name' },
          make('b', { text: r.name }),
          make('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        make('td', { class: 'num', text: asUsd(r.tvl_usd) }),
        make('td', { class: 'num ' + growthClass, text: growth }),
        make('td', { class: 'num', text: asAge(r.age_days) }),
        make('td', null, make('div', { class: 'implied' },
          make('div', { class: 'bar', 'aria-hidden': 'true' }, make('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          make('span', { class: 'num', text: asUsd(r.implied_value_usd) })
        )),
        make('td', null, make('span', { class: 'status', text: 'no token' }))
      ));
    });
    return make('div', { class: 'panel' },
      make('div', { class: 'table-wrap' },
        make('table', null,
          make('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          make('thead', null, make('tr', null,
            sortableHeading('implied', 'Rank'),
            sortableHeading('name', 'Protocol'),
            sortableHeading('tvl', 'TVL'),
            sortableHeading('growth', '7d'),
            sortableHeading('age', 'Age'),
            sortableHeading('implied', 'Implied value'),
            make('th', { scope: 'col', text: 'Token' })
          )),
          body
        )
      )
    );
  }

  function liveTable() {
    var body = make('tbody');
    FEED.live.forEach(function (r) {
      body.appendChild(make('tr', null,
        make('td', { class: 'num', text: 'live' }),
        make('td', null, make('div', { class: 'name' }, make('b', { text: r.name }), make('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        make('td', { class: 'num', text: asUsd(r.tvl_usd) }),
        make('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: asPercent(r.change_7d) }),
        make('td', { class: 'num', text: asUsd(r.mcap_usd) }),
        make('td', null, make('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return make('div', { class: 'panel' },
      make('div', { class: 'table-wrap' },
        make('table', null,
          make('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          make('thead', null, make('tr', null, make('th', { scope: 'col', text: 'Status' }), make('th', { scope: 'col', text: 'Protocol' }), make('th', { scope: 'col', text: 'TVL' }), make('th', { scope: 'col', text: '7d' }), make('th', { scope: 'col', text: 'Market cap' }), make('th', { scope: 'col', text: 'Token' }))),
          body
        )
      )
    );
  }

  function methodPanel() {
    var m = FEED.model;
    return make('section', { class: 'panel model' },
      make('h2', { text: 'How implied value is computed' }),
      make('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      make('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      make('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  // ---------------------------------------------------------------------------
  // Detail drawer
  // ---------------------------------------------------------------------------
  var detail = make('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  detail.addEventListener('close', function () { view.selected = null; writeHash(); });

  function showDetail(slug) {
    var row = FEED.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    view.selected = slug;
    writeHash();
    detail.textContent = '';
    var steps = planFor(row);
    detail.appendChild(make('div', { class: 'detail-head' },
      make('div', null,
        make('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + FEED.board_size }),
        make('h2', { id: 'detail-title', text: row.name }),
        make('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      make('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { detail.close(); } })
    ));
    detail.appendChild(make('section', { class: 'detail-section' },
      make('h3', { text: 'Implied value' }),
      make('div', { class: 'equation' },
        make('div', null, make('span', { text: 'TVL' }), make('b', { class: 'num', text: asUsd(row.tvl_usd) })),
        make('div', null, make('span', { text: 'Seven-day growth' }), make('b', { class: 'num', text: asPercent(row.change_7d) })),
        make('div', null, make('span', { text: 'Age with no token' }), make('b', { class: 'num', text: asAge(row.age_days) })),
        make('div', null, make('span', { text: 'Growth multiplier' }), make('b', { class: 'num', text: String(row.growth_multiplier) })),
        make('div', null, make('span', { text: 'Maturity multiplier' }), make('b', { class: 'num', text: String(row.maturity_multiplier) })),
        make('div', null, make('span', { text: 'Implied value' }), make('b', { class: 'num', text: asUsd(row.implied_value_usd) }))
      ),
      make('p', { class: 'sub', text: 'Model ' + FEED.model_version + ': the same function scores every protocol. The page recomputes this row as ' + asUsd(modelValue(row, FEED.model)) + (modelValue(row, FEED.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    detail.appendChild(make('section', { class: 'detail-section' },
      make('h3', { text: 'Farm plan' }),
      make('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return make('li', null, make('b', { text: action }), make('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof detail.showModal === 'function') {
      if (!detail.open) detail.showModal();
    } else {
      detail.setAttribute('open', '');
    }
  }

  // ---------------------------------------------------------------------------
  // Render loop and startup
  // ---------------------------------------------------------------------------
  function render() {
    mount.textContent = '';
    var shell = make('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    shell.appendChild(filterBar());
    shell.appendChild(view.tab === 'pre-token' ? rankedTable() : liveTable());
    if (view.tab === 'pre-token') shell.appendChild(methodPanel());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!detail.isConnected) mount.appendChild(detail);
    if (view.selected) showDetail(view.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detail.open) detail.close();
  });
})();
