// 极简 DOM 工具：h() 建元素、弹窗、提示条。

/** h('div.card#id', {onclick, class, style:{}, dataset:{}}, ...children) */
export function h(spec, props, ...kids) {
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(spec);
  const el = document.createElement(m[1] || 'div');
  for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.classList.add(...String(v).split(' ').filter(Boolean));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** 把若干子节点追加到 el，null/false 会被跳过（DOM 原生 append 会把 null 写成文字）。 */
export const put = (el, ...kids) => { append(el, kids); return el; };

export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 把含 **粗体** 和 `代码` 的短文本转成节点（题库里用到的轻量标记）。 */
export function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const s = m[0];
    frag.append(s[0] === '`' ? h('code', s.slice(1, -1)) : h('strong', s.slice(2, -2)));
    last = m.index + s.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

// ---- 弹窗 ----
let openDialogs = 0;

/**
 * 弹出模态框。content 是节点；返回 { close, el }。
 * opts: { title, dismissable=true, wide, onClose, actions:[{label, primary, onClick}] }
 */
export function modal(content, opts = {}) {
  const host = document.getElementById('dialogs');
  const prevFocus = document.activeElement;
  const titleId = 'dlg-' + Math.random().toString(36).slice(2, 7);
  const close = result => {
    if (closed) return;
    closed = true;
    wrap.classList.add('out');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { wrap.remove(); openDialogs--; if (!openDialogs) document.body.classList.remove('has-modal'); }, 140);
    if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch { /* 元素已移除 */ }
    opts.onClose && opts.onClose(result);
  };
  let closed = false;
  const card = h('div.modal-card' + (opts.wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': opts.title ? titleId : null },
    opts.title && h('h2.modal-title', { id: titleId }, opts.title),
    h('div.modal-body', content),
    opts.actions && h('div.modal-actions', opts.actions.map(a => h('button.btn' + (a.primary ? '.primary' : a.danger ? '.danger' : ''), {
      onclick: () => { const r = a.onClick ? a.onClick() : undefined; if (r !== false) close(a.value); },
    }, a.label))));
  const wrap = h('div.modal', { onclick: e => { if (e.target === wrap && opts.dismissable !== false) close(); } }, card);
  const onKey = e => {
    if (e.key === 'Escape' && opts.dismissable !== false && wrap === host.lastElementChild) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...card.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  host.append(wrap);
  openDialogs++;
  document.body.classList.add('has-modal');
  const focusable = card.querySelector('.modal-actions .primary, .modal-actions .btn, button, a[href]');
  (focusable || card).setAttribute('tabindex', focusable ? focusable.getAttribute('tabindex') ?? '0' : '-1');
  (focusable || card).focus({ preventScroll: true });
  return { close, el: wrap, card };
}

export function confirmDialog({ title, body, ok, cancel, danger }) {
  return new Promise(res => {
    modal(h('p', body), {
      title, onClose: v => res(v === true),
      actions: [{ label: cancel, value: false }, { label: ok, primary: !danger, danger, value: true }],
    });
  });
}

// ---- 提示条（在页面上方排队显示）----
export function toast(text, { kind = '', ms = 2600 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, text);
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, ms);
}

export const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* 不支持 */ } };
