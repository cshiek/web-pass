/* ui.js - tiny DOM helpers (no framework). Attaches to window.WP.ui */
(function () {
  'use strict';

  const WP = window.WP;

  /**
   * Create an element.
   * @param {string} tag
   * @param {object} [props] class, id, text, html, dataset, attr, onclick/on<event>, etc.
   * @param {...(string|number|Node|Array)} children
   */
  function el(tag, props, ...children) {
    if (Array.isArray(props)) { children = [props, ...children]; props = {}; }
    const node = document.createElement(tag);

    if (props) {
      for (const key in props) {
        const value = props[key];
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') { for (const dk in value) node.dataset[dk] = value[dk]; }
        else if (key === 'attr') { for (const ak in value) node.setAttribute(ak, value[ak]); }
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          node.setAttribute(key, value);
        }
      }
    }

    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function clear(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  WP.ui = { el, clear };
})();
