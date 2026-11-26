/**
 * FILE: src/utils/busyButtons.js
 * Loading state for every button that sends something to the server (approved 8 Nov 2026).
 *
 * How it works (no page has to change):
 *  1. A click on a button is remembered for a short moment.
 *  2. If that click starts a POST / PUT / PATCH / DELETE request (API/axios.jsx),
 *     the button gets a spinner, a "Saving..." style label and cannot be clicked again.
 *  3. When the request (and any request chained right after it) finishes, the button is restored.
 *
 *  - SweetAlert confirm buttons: the button that opened the dialog shows the spinner.
 *  - ⋮ row menus close on click: the ⋮ button of that row shows the spinner.
 *  - GET requests (opening pages, filters, tabs) never change a button.
 *  - Optional: data-busy-text="Inaingia..." on a button sets its exact loading text.
 */
const CLICK_WINDOW_MS = 1500;   // a write must start this soon after the click (or after the last request of the chain)
const RELEASE_DELAY_MS = 220;   // keeps the spinner between chained requests (save -> read back -> submit)

const VERBS = [
  [/^(sign in|log ?in|login)\b/i, 'Signing in...'], [/^ingia\b/i, 'Inaingia...'],
  [/^(save|create|add)\b/i, 'Saving...'], [/^hifadhi\b/i, 'Inahifadhi...'],
  [/^(submit|send)\b/i, 'Submitting...'], [/^(tuma|wasilisha)\b/i, 'Inatuma...'],
  [/^approve\b/i, 'Approving...'], [/^(endorse|forward)\b/i, 'Forwarding...'],
  [/^return\b/i, 'Returning...'], [/^reject\b/i, 'Rejecting...'],
  [/^publish\b/i, 'Publishing...'], [/^upload\b/i, 'Uploading...'], [/^import\b/i, 'Importing...'],
  [/^(delete|remove)\b/i, 'Deleting...'], [/^(update|edit|change)\b/i, 'Updating...'],
  [/^verify\b/i, 'Verifying...'], [/^thibitisha\b/i, 'Inathibitisha...'],
  [/^reset\b/i, 'Resetting...'], [/^(activate|enable)\b/i, 'Activating...'], [/^(deactivate|disable)\b/i, 'Deactivating...'],
  [/^(generate|export|download)\b/i, 'Preparing...'], [/^resend\b/i, 'Sending...'],
];
export function busyLabel(text = '') {
  const label = String(text).replace(/\s+/g, ' ').trim();
  if (!label) return '';
  const hit = VERBS.find(([re]) => re.test(label));
  return hit ? hit[1] : 'Please wait...';
}

const state = new WeakMap(); // element -> { count, timer, textNode, original, minWidth }
let lastAction = null;       // { el, time }
let lastMenuTrigger = null;

function targetOf(event) {
  const el = event.target instanceof Element ? event.target.closest('button, a.btn, [role="button"], [role="menuitem"]') : null;
  return el;
}

function onClickCapture(event) {
  const el = targetOf(event);
  if (!el) return;
  if (el.classList.contains('vw-busy')) { event.preventDefault(); event.stopPropagation(); return; } // no double submit
  const now = Date.now();
  if (el.closest('.swal2-container')) { if (lastAction) lastAction.time = now; return; } // keep the button that opened the dialog
  if (el.classList.contains('vw-actions-trigger')) { lastMenuTrigger = el; lastAction = { el, time: now }; return; }
  if (el.closest('.vw-actions-popup') && lastMenuTrigger) { lastAction = { el: lastMenuTrigger, time: now }; return; }
  lastAction = { el, time: now };
}

function firstTextNode(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  return walker.nextNode();
}

function mark(el) {
  let entry = state.get(el);
  if (entry) { entry.count += 1; clearTimeout(entry.timer); return; }
  entry = { count: 1, timer: null, textNode: null, original: '', minWidth: el.style.minWidth };
  const width = el.getBoundingClientRect().width;
  if (width) el.style.minWidth = `${Math.ceil(width)}px`; // the button keeps its size
  const textNode = firstTextNode(el);
  const text = el.getAttribute('data-busy-text') || busyLabel(textNode?.nodeValue || '');
  if (textNode && text) { entry.textNode = textNode; entry.original = textNode.nodeValue; textNode.nodeValue = text; }
  el.classList.add('vw-busy');
  el.setAttribute('aria-busy', 'true');
  state.set(el, entry);
}

function release(el) {
  const entry = state.get(el);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count > 0) return;
  if (lastAction?.el === el) lastAction.time = Date.now(); // a chained request may follow
  entry.timer = setTimeout(() => {
    const { textNode, original, minWidth } = entry;
    // React may already have re-rendered the label; only put back the text we changed.
    if (textNode && textNode.isConnected && textNode.nodeValue !== original && original) {
      const current = textNode.nodeValue;
      if (current === (el.getAttribute('data-busy-text') || busyLabel(original))) textNode.nodeValue = original;
    }
    el.style.minWidth = minWidth;
    el.classList.remove('vw-busy');
    el.removeAttribute('aria-busy');
    state.delete(el);
  }, RELEASE_DELAY_MS);
}

/** Request interceptor part: link a write request to the button that started it. */
export function busyOnRequest(config) {
  try {
    const method = String(config?.method || 'get').toLowerCase();
    if (method === 'get' || method === 'head' || method === 'options' || !lastAction) return config;
    const { el, time } = lastAction;
    if (Date.now() - time > CLICK_WINDOW_MS || !el?.isConnected) return config;
    mark(el);
    Object.defineProperty(config, '__busyEl', { value: el, enumerable: false, configurable: true });
  } catch { /* never block a request because of the spinner */ }
  return config;
}

/** Response interceptor part (success and error). */
export function busyOnResponse(config) {
  try { if (config?.__busyEl) release(config.__busyEl); } catch { /* ignore */ }
}

let installed = false;
export function installBusyButtons() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', onClickCapture, true);
}
