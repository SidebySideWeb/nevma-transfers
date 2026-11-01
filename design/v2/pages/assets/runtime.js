/* Minimal offline runtime for the exported design pages: fills {{holes}}, repeats <sc-for>, shows <sc-if>, wires on* handlers and re-renders on setState. Preview only. */
(function () {
  class DCLogic {
    constructor() { this.state = {}; this.props = {}; }
    setState(patch) { this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch); schedule(); }
  }
  window.DCLogic = DCLogic;
  let comp, tpl, root, pending = false;
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } }
  function look(path, scopes) {
    const parts = path.split('.');
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) {
        let v = scopes[i][parts[0]];
        for (let k = 1; k < parts.length; k++) v = v == null ? undefined : v[parts[k]];
        return v;
      }
    }
    if (path === 'true') return true; if (path === 'false') return false;
    return undefined;
  }
  const HOLE = /\{\{\s*([\w.]+)\s*\}\}/g;
  function fill(str, scopes) { return str.replace(HOLE, (_, p) => { const v = look(p, scopes); return v == null ? '' : String(v); }); }
  function build(node, scopes, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(fill(node.nodeValue, scopes))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const kind = tag === 'template' ? node.getAttribute('data-sc') : null;
    const kids = kind ? node.content.childNodes : node.childNodes;
    if (kind === 'for') {
      const m = (node.getAttribute('list') || '').match(/\{\{\s*([\w.]+)\s*\}\}/);
      const list = m ? look(m[1], scopes) : null; const as = node.getAttribute('as') || 'item';
      (Array.isArray(list) ? list : []).forEach((item, i) => { const s = {}; s[as] = item; s[as + 'Index'] = i; kids.forEach(c => build(c, scopes.concat([s]), out)); });
      return;
    }
    if (kind === 'if') {
      const m = (node.getAttribute('value') || '').match(/\{\{\s*([\w.]+)\s*\}\}/);
      if (m && look(m[1], scopes)) kids.forEach(c => build(c, scopes, out));
      return;
    }
    const el = document.createElement(tag);
    for (const a of Array.from(node.attributes)) {
      if (a.name.startsWith('hint-')) continue;
      if (/^on[a-z]+$/i.test(a.name)) {
        const m = a.value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
        const fn = m ? look(m[1], scopes) : null;
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2).toLowerCase(), e => { fn(e); });
        continue;
      }
      el.setAttribute(a.name, fill(a.value, scopes));
    }
    const src = tag === 'template' ? node.content : node;
    src.childNodes.forEach(c => build(c, scopes, el));
    out.appendChild(el);
  }
  function render() {
    const vals = comp.renderVals ? comp.renderVals() : {};
    const frag = document.createDocumentFragment();
    tpl.content.childNodes.forEach(c => build(c, [vals], frag));
    const y = window.scrollY;
    root.replaceChildren(frag);
    window.scrollTo(0, y);
  }
  window.addEventListener('DOMContentLoaded', () => {
    tpl = document.getElementById('dc-template'); root = document.getElementById('dc-root');
    const code = document.getElementById('dc-logic').textContent;
    const Component = new Function('DCLogic', code + '\n;return Component;')(DCLogic);
    comp = new Component(); comp.state = comp.state || {};
    render();
  });
})();
