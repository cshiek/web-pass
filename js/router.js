/* router.js - minimal hash-based router. Attaches to window.WP.router */
(function () {
  'use strict';

  const WP = window.WP;

  const routes = [];

  /**
   * Register a route. `pattern` supports `:param` segments, e.g. "/vault/:id".
   * `render(params)` must return a DOM node to mount into #app.
   */
  function add(pattern, render) {
    const keys = [];
    const source = pattern
      .replace(/^\//, '')                                   // drop leading slash
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')               // escape regex specials
      .replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });  // params last
    const rx = new RegExp('^' + source + '(?:/)?$');
    routes.push({ rx, keys, render });
  }

  function mount() {
    const app = document.getElementById('app');
    const clean = location.hash.replace(/^#?\/?/, '');

    for (const r of routes) {
      const m = clean.match(r.rx);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        WP.ui.clear(app);
        let node;
        try {
          node = r.render(params);
        } catch (err) {
          console.error('Route render failed:', err);
          node = WP.ui.el('div', { class: 'unlock-screen' },
            WP.ui.el('div', { class: 'card' },
              WP.ui.el('h2', {}, 'Something went wrong'),
              WP.ui.el('p', { class: 'status error' }, err.message || String(err))));
        }
        app.append(node || WP.ui.el('div', {}));
        return;
      }
    }

    WP.ui.clear(app);
    app.append(WP.ui.el('div', { class: 'unlock-screen' },
      WP.ui.el('div', { class: 'card' }, WP.ui.el('h2', {}, 'Page not found'))));
  }

  WP.router = {
    add,
    start() {
      window.addEventListener('hashchange', mount);
      mount();
    },
  };
})();
