/**
 * FILE: src/i18n/autoTranslate.js
 * Kiswahili for the pages that do not call useLanguage() themselves (phase 2, 9 Nov 2026).
 * While the portal language is Kiswahili, on-screen text that exactly matches a known English label
 * (dictionary.js, then pages.sw.js) is shown in Kiswahili; switching back to English restores the
 * original text. Only whole labels are replaced, so backend data and user-entered values stay as they are.
 * Not touched: report documents (.rv-doc), the Privacy Notice, inputs, textareas and [data-no-translate].
 */
import {SW} from './dictionary.js';

const SKIP = '.rv-doc,.vw-privacy,[data-no-translate],script,style,textarea,code,pre,[contenteditable="true"]';
const ATTRS = ['placeholder', 'title', 'aria-label'];

let pages = null;
let lang = 'en';
let observer = null;
const original = new WeakMap();   // text node -> English text
const applied = new WeakMap();    // text node -> text we wrote
const attrOriginal = new WeakMap(); // element -> {attr: English}
const attrApplied = new WeakMap();  // element -> {attr: written}

const NOUNS = {
  submission: 'uwasilishaji', submissions: 'uwasilishaji', 'pending submissions': 'uwasilishaji unaosubiri',
  user: 'mtumiaji', users: 'watumiaji', record: 'rekodi', records: 'rekodi', entries: 'rekodi',
  dataset: 'seti ya data', datasets: 'seti za data', institution: 'taasisi', institutions: 'taasisi',
  indicator: 'kiashiria', indicators: 'viashiria', item: 'kipengele', items: 'vipengele', result: 'tokeo',
  results: 'matokeo', event: 'tukio', events: 'matukio', role: 'jukumu', roles: 'majukumu', plan: 'mpango',
  plans: 'mipango', department: 'idara', departments: 'idara', notification: 'taarifa', notifications: 'taarifa',
  period: 'kipindi', periods: 'vipindi', objective: 'lengo', objectives: 'malengo', admins: 'wasimamizi',
  permissions: 'ruhusa', workflows: 'mitiririko', delegations: 'ukaimishaji', values: 'thamani', days: 'siku',
  minutes: 'dakika', rows: 'mistari', sources: 'vyanzo', pending: 'zinasubiri', hours: 'saa', steps: 'hatua', levels: 'ngazi', versions: 'matoleo', version: 'toleo', workflow: 'mtiririko', drafts: 'rasimu', draft: 'rasimu', types: 'aina', type: 'aina', years: 'miaka', year: 'mwaka',
};
const NUM = String.raw`[\d][\d,.]*`;

function word(text) {
  return SW[text] ?? pages?.[text];
}

/** One whole label -> Kiswahili, or undefined when it is not a known label. */
function swahili(text) {
  const direct = word(text);
  if (direct !== undefined) return direct;
  const tail = rest => {
    if (!rest) return '';
    const noun = NOUNS[rest.toLowerCase()];
    if (noun) return ` ${noun}`;
    const bracket = rest.match(/^(.*?)\s*\((.+)\)$/);
    if (bracket) return `${tail(bracket[1])} (${word(bracket[2]) ?? bracket[2]})`;
    return ` ${word(rest) ?? rest}`;
  };
  let m = text.match(new RegExp(`^Showing (${NUM})\\s*(?:–|-|to)\\s*(${NUM}) of (${NUM})(?: (.+))?$`));
  if (m) return `Inaonyesha ${m[1]}–${m[2]} kati ya ${m[3]}${tail(m[4])}`;
  m = text.match(new RegExp(`^Showing (?:the first )?(${NUM}) of (${NUM})(?: ([^·]*?))?(?: · page (${NUM})(?: of (${NUM}))?)?$`));
  if (m) return `Inaonyesha ${m[1]} kati ya ${m[2]}${tail(m[3])}${m[4] ? ` · ukurasa ${m[4]}${m[5] ? ` kati ya ${m[5]}` : ''}` : ''}`;
  m = text.match(new RegExp(`^Page (${NUM}) of (${NUM})$`, 'i'));
  if (m) return `Ukurasa ${m[1]} kati ya ${m[2]}`;
  m = text.match(new RegExp(`^(${NUM}) (.+)$`));
  if (m && NOUNS[m[2].toLowerCase()]) return `${m[1]} ${NOUNS[m[2].toLowerCase()]}`;
  m = text.match(/^Welcome, (.+)$/);
  if (m) return `Karibu, ${m[1]}`;
  m = text.match(/^FY (\d{4}\/\d{2,4})$/);
  if (m) return `Mwaka wa Fedha ${m[1]}`;
  m = text.match(/^Locked for (\d{4}\/\d{2,4})$/);
  if (m) return `Imefungwa kwa ${m[1]}`;
  m = text.match(/^To date: (.+?) · Sum (.+?) \((\d+) of (\d+) periods\)$/);
  if (m) return `Hadi sasa: ${m[1]} · Jumla ${m[2]} (vipindi ${m[3]} kati ya ${m[4]})`;
  m = text.match(/^(.+) spent without any funds received\.$/);
  if (m) return `${m[1]} zimetumika bila fedha yoyote kupokelewa.`;
  m = text.match(/^(.+?) · (.+)$/);
  if (m) {
    // "Label · more": translate each side when at least the first one is a known label.
    const head = swahili(m[1]);
    if (head !== undefined) return `${head} · ${swahili(m[2]) ?? m[2]}`;
  }
  m = text.match(/^(.+?)(\s*[:*])$/);
  if (m) { const base = word(m[1]); if (base !== undefined) return base + m[2]; }
  return undefined;
}

/** Keeps leading/trailing spaces of the original text. */
function convert(text) {
  if (lang !== 'sw' || !text) return text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 400 || !/[A-Za-z]/.test(trimmed)) return text;
  const result = swahili(trimmed.replace(/\s+/g, ' '));
  if (result === undefined) return text;
  const start = text.indexOf(trimmed);
  return text.slice(0, start) + result + text.slice(start + trimmed.length);
}

/** The English text React last wrote into this node. */
function sourceOf(node) {
  if (applied.has(node) && node.data === applied.get(node)) return original.get(node);
  original.set(node, node.data);
  applied.delete(node);
  return node.data;
}

function write(node, value, source) {
  if (node.data === value) { if (value !== source) applied.set(node, value); return; }
  node.data = value;
  if (value === source) applied.delete(node); else applied.set(node, value);
}

const skipped = element => !element || element.closest(SKIP);

function processText(node) {
  const parent = node.parentElement;
  if (skipped(parent)) return;
  const kids = parent.childNodes;
  // "Showing {a} of {b} users" renders as several text nodes: read and replace them as one label.
  if (kids.length > 1 && Array.from(kids).every(kid => kid.nodeType === 3)) {
    const sources = Array.from(kids, sourceOf);
    const whole = sources.join('');
    const result = convert(whole);
    if (result !== whole) Array.from(kids).forEach((kid, index) => write(kid, index === 0 ? result : '', sources[index]));
    else Array.from(kids).forEach((kid, index) => write(kid, convert(sources[index]), sources[index]));
    return;
  }
  const source = sourceOf(node);
  write(node, convert(source), source);
}

function processAttrs(element) {
  if (skipped(element)) return;
  for (const name of ATTRS) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const done = attrApplied.get(element) ?? {};
    const keep = attrOriginal.get(element) ?? {};
    const source = done[name] !== undefined && current === done[name] ? keep[name] : current;
    keep[name] = source;
    attrOriginal.set(element, keep);
    const value = convert(source);
    if (value === source) delete done[name]; else done[name] = value;
    attrApplied.set(element, done);
    if (current !== value) element.setAttribute(name, value);
  }
  if (element.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(element.type)) {
    // button-like inputs show their value; handled as an attribute
    const done = attrApplied.get(element) ?? {};
    const keep = attrOriginal.get(element) ?? {};
    const source = done.value !== undefined && element.value === done.value ? keep.value : element.value;
    keep.value = source; attrOriginal.set(element, keep);
    const value = convert(source);
    if (value === source) delete done.value; else done.value = value;
    attrApplied.set(element, done);
    if (element.value !== value) element.value = value;
  }
}

function processTree(root) {
  if (root.nodeType === 3) { processText(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  processAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.nodeType === 1 && node.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) processText(node); else processAttrs(node);
  }
}

function onMutations(records) {
  for (const record of records) {
    if (record.type === 'characterData') {
      if (applied.get(record.target) !== record.target.data) processText(record.target);
    } else if (record.type === 'attributes') {
      const done = attrApplied.get(record.target);
      if (!done || done[record.attributeName] !== record.target.getAttribute(record.attributeName)) processAttrs(record.target);
    } else {
      record.addedNodes.forEach(processTree);
    }
  }
}

/** Called by the dashboard layout whenever the language changes. */
export async function setPageLanguage(next) {
  lang = next === 'sw' ? 'sw' : 'en';
  if (typeof document === 'undefined' || !document.body) return;
  if (lang === 'sw' && !pages) {
    pages = (await import('./pages.sw.js')).PAGE_SW;
    if (lang !== 'sw') return;
  }
  observer?.disconnect();
  observer = null;
  processTree(document.body); // translate, or restore English
  if (lang === 'sw') {
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
  }
}

/** For tests: the label rules without the DOM. */
export function translateLabel(text, dictionary = {}) {
  const saved = [pages, lang];
  pages = dictionary; lang = 'sw';
  try { return convert(text); } finally { [pages, lang] = saved; }
}
