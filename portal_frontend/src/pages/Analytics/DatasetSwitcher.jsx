/**
 * FILE: src/pages/Analytics/DatasetSwitcher.jsx
 * Compact switcher between the published datasets of one organisation (Dataset analytics page).
 * Every organisation (2+ datasets) gets the same switcher: previous / next arrows plus a searchable drop-down
 * list (8 Nov 2026 — before, up to 5 datasets showed as tabs).
 */
import {useEffect, useMemo, useRef, useState} from 'react';
import {Check, ChevronDown, ChevronLeft, ChevronRight, Database, Search} from 'lucide-react';

export default function DatasetSwitcher({datasets = [], currentId, titleOf, onOpen}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef(null);
  const input = useRef(null);
  const list = useMemo(() => [...datasets].sort((a, b) => titleOf(a).localeCompare(titleOf(b))), [datasets, titleOf]);
  const index = list.findIndex(ds => String(ds.id) === String(currentId));
  const current = list[index];
  const shown = list.filter(ds => !query || titleOf(ds).toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    const esc = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    setTimeout(() => input.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (list.length < 2) return null;
  const go = (step) => { const next = list[(index + step + list.length) % list.length]; if (next) onOpen(next); };
  const choose = (ds) => { setOpen(false); setQuery(''); onOpen(ds); };
  return <div className="ia-dsw" ref={box}>
    <button type="button" className="ia-dsw-arrow" onClick={() => go(-1)} aria-label="Previous dataset" title="Previous dataset"><ChevronLeft size={18}/></button>
    <button type="button" className={`ia-dsw-current${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Database size={16}/>
      <span className="ia-dsw-label"><small>Dataset {index + 1} of {list.length}</small><b>{current ? titleOf(current) : 'Choose a dataset'}</b></span>
      <ChevronDown size={18} className="ia-dsw-chevron"/>
    </button>
    <button type="button" className="ia-dsw-arrow" onClick={() => go(1)} aria-label="Next dataset" title="Next dataset"><ChevronRight size={18}/></button>
    {open && <div className="ia-dsw-pop">
      <label className="ia-dsw-search"><Search size={15}/><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${list.length} datasets…`} aria-label="Search datasets"/></label>
      <ul role="listbox" aria-label="Datasets">
        {shown.map(ds => { const on = String(ds.id) === String(currentId);
          return <li key={ds.id} role="option" aria-selected={on}><button type="button" className={on ? 'on' : ''} onClick={() => choose(ds)}>
            <span>{titleOf(ds)}</span>{on && <Check size={15}/>}</button></li>; })}
        {!shown.length && <li className="ia-dsw-none">No dataset matches “{query}”.</li>}
      </ul>
    </div>}
  </div>;
}
