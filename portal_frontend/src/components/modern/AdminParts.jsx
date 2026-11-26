/** Small presentation pieces for the modern administration pages (approved 28 Oct 2026). */
import {MuBadge, MuLogo} from './ModernUI.jsx';
import {adminStatus, avatarTone, initialsOf, shortDateTime} from '../../utils/adminDisplay.js';

export function AdmPerson({name, sub, seed}) {
  return <span className="adm-person"><span className="adm-avatar" style={{background: avatarTone(seed ?? name)}} aria-hidden="true">{initialsOf(name)}</span>
    <span className="adm-person-text"><b>{name || '—'}</b>{sub && <small title={sub}>{sub}</small>}</span></span>;
}

export function AdmOrg({logo, code, name}) {
  const short = code || name || '—';
  return <span className="adm-person"><MuLogo src={logo} initials={String(short).slice(0, 4)} size={32}/>
    <span className="adm-person-text"><b>{short}</b>{name && name !== short && <small title={name}>{name}</small>}</span></span>;
}

export function AdmStatus({record, status}) {
  const s = adminStatus(record ?? {status});
  return <MuBadge tone={s.tone}>{s.label}</MuBadge>;
}

export function AdmWhen({value, empty = 'Never'}) {
  const parts = shortDateTime(value);
  if (!parts) return <span className="mu-muted">{value ? String(value) : empty}</span>;
  return <span className="mu-date">{parts.date}<small>{parts.time}</small></span>;
}

export function AdmBar({value, max, color = '#0b5bd3'}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return <span className="mu-muted">—</span>;
  return <span className="adm-bar"><span className="adm-bar-track"><i style={{width: `${Math.min(100, max > 0 ? n * 100 / max : 0)}%`, background: color}}/></span><b>{n}</b></span>;
}
