/**
 * FILE: src/components/PrivacyNotice.jsx
 * FR-058 Personal Data Handling (9 Nov 2026). The text comes from Laravel (GET /privacy-notice), managed by MOA
 * in Portal Settings -> Privacy Notice; the draft below is shown only when the server has no notice endpoint.
 * Read mode: from the sign-in page and the footer. Accept mode (PrivacyGate): once after sign-in, and again
 * only when MOA publishes a version that requires it.
 */
import {useEffect, useState} from 'react';
import {X} from 'lucide-react';
import {getPrivacyNotice} from '../API/privacyNotice.js';
import './PrivacyNotice.css';

const TEXT = {
  EN: {
    tag: 'Privacy Notice · version 9 Nov 2026 · draft for legal review',
    title: 'How the Viwanda Portal handles your personal data',
    intro: 'The Ministry of Industry and Trade (MIT) runs this portal to collect, approve and publish industry and trade statistics. This notice explains how personal data of portal users is handled, in line with the Personal Data Protection Act, 2022.',
    sections: [
      ['What we collect', ['Account details: name, official email, phone number, institution, department and role.',
        'Sign-in records: time, IP address, browser, failed attempts and two-step verification (MFA) status.',
        'Your actions: submissions, reviews, approvals, corrections and report views or exports, with date and time (audit trail).']],
      ['Why we use it', ['To give you access according to your role and institution.',
        'To show who submitted, approved or changed each figure (accountability and audit).',
        'To send you notifications about your work and to protect the portal against misuse.']],
      ['Who can see it', ['Only authorised MIT staff, institution administrators and auditors, each within their role.',
        'Published statistics never show personal data.',
        'Personal data is not sold or shared outside Government, except where the law requires it.']],
      ['How long we keep it', ['Account data is kept while your account is active.',
        'Audit records are kept as required by Government records rules. Retention period: to be confirmed.']],
      ['Your rights', ['You may ask to see or correct your personal data, or raise a concern about how it is used.',
        'Contact your institution administrator or MIT. Contact office for personal data: to be confirmed.']],
    ],
    close: 'Close',
  },
  SW: {
    tag: 'Taarifa ya Faragha · toleo la 9 Nov 2026 · rasimu ya kupitiwa kisheria',
    title: 'Jinsi Viwanda Portal inavyoshughulikia taarifa zako binafsi',
    intro: 'Wizara ya Viwanda na Biashara (MIT) inaendesha portal hii kukusanya, kuidhinisha na kuchapisha takwimu za viwanda na biashara. Taarifa hii inaeleza jinsi taarifa binafsi za watumiaji zinavyoshughulikiwa, kwa mujibu wa Sheria ya Ulinzi wa Taarifa Binafsi, 2022.',
    sections: [
      ['Tunachokusanya', ['Taarifa za akaunti: jina, barua pepe rasmi, namba ya simu, taasisi, idara na jukumu (role).',
        'Kumbukumbu za kuingia: muda, anwani ya IP, kivinjari, majaribio yaliyoshindwa na hali ya uthibitisho wa hatua mbili (MFA).',
        'Shughuli zako: kuwasilisha, kupitia, kuidhinisha, kurekebisha na kuangalia au kutoa ripoti, pamoja na tarehe na saa (kumbukumbu za ukaguzi).']],
      ['Kwa nini tunazitumia', ['Kukupa ufikiaji kulingana na jukumu na taasisi yako.',
        'Kuonyesha nani aliwasilisha, aliidhinisha au alibadilisha kila takwimu (uwajibikaji na ukaguzi).',
        'Kukutumia taarifa (notifications) za kazi zako na kulinda portal dhidi ya matumizi mabaya.']],
      ['Nani anaziona', ['Watumishi wa MIT, wasimamizi wa taasisi na wakaguzi walioidhinishwa tu, kila mmoja kwa mipaka ya jukumu lake.',
        'Takwimu zinazochapishwa haziwahi kuonyesha taarifa binafsi.',
        'Taarifa binafsi haziuzwi wala kutolewa nje ya Serikali, isipokuwa sheria inapotaka hivyo.']],
      ['Muda wa kuzihifadhi', ['Taarifa za akaunti zinahifadhiwa wakati akaunti yako ipo hai.',
        'Kumbukumbu za ukaguzi zinahifadhiwa kwa mujibu wa taratibu za kumbukumbu za Serikali. Muda wa kuhifadhi: utathibitishwa.']],
      ['Haki zako', ['Unaweza kuomba kuona au kurekebisha taarifa zako binafsi, au kuwasilisha malalamiko kuhusu matumizi yake.',
        'Wasiliana na msimamizi wa taasisi yako au MIT. Ofisi ya mawasiliano kuhusu taarifa binafsi: itathibitishwa.']],
    ],
    close: 'Funga',
  },
};

/** Built-in draft (version 1) in the same "## heading / - bullet" format MOA edits. */
function fallbackNotice() {
  const toBody = ({intro, sections}) => [intro, ...sections.map(([heading, items]) => `\n## ${heading}\n${items.map(item => `- ${item}`).join('\n')}`)].join('\n');
  return {version: 1, acceptanceVersion: 1, isDefault: true, title: {en: TEXT.EN.title, sw: TEXT.SW.title}, body: {en: toBody(TEXT.EN), sw: toBody(TEXT.SW)}};
}

let noticeRequest = null;
/** The current notice, read once per page load (the sign-in page, footer and gate share it). */
export function loadPrivacyNotice(force = false) {
  if (force || !noticeRequest) noticeRequest = getPrivacyNotice().then(data => (data?.body ? data : fallbackNotice())).catch(() => { noticeRequest = null; return fallbackNotice(); });
  return noticeRequest;
}

/** "## heading", "- bullet" and plain paragraphs -> elements (no HTML from the server is ever injected). */
export function NoticeBody({text}) {
  const blocks = [];
  let list = null;
  String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    if (line.startsWith('- ')) {
      if (!list) { list = []; blocks.push(<ul key={`u${index}`}>{list}</ul>); }
      list.push(<li key={index}>{line.slice(2)}</li>);
      return;
    }
    list = null;
    blocks.push(line.startsWith('## ') ? <h3 key={index}>{line.slice(3)}</h3> : <p key={index}>{line}</p>);
  });
  return <>{blocks}</>;
}

const WORDS = {
  en: {tag: v => `Privacy Notice · version ${v}`, close: 'Close', confirm: 'I have read the Privacy Notice and understand how my personal data is used in the Viwanda Portal.',
    cont: 'Continue', out: 'Sign out', loading: 'Loading…', draft: 'Draft for legal review'},
  sw: {tag: v => `Taarifa ya Faragha · toleo la ${v}`, close: 'Funga', confirm: 'Nimesoma Taarifa ya Faragha na ninaelewa jinsi taarifa zangu binafsi zinavyotumika kwenye Viwanda Portal.',
    cont: 'Endelea', out: 'Toka', loading: 'Inapakia…', draft: 'Rasimu ya kupitiwa kisheria'},
};

/**
 * lang: 'EN' | 'SW' | 'en' | 'sw'. Read mode: onClose. Accept mode: onAccept + onSignOut (cannot be dismissed).
 */
export default function PrivacyNotice({open, onClose, lang = 'EN', onAccept, onSignOut, busy = false}) {
  const code = String(lang).toLowerCase() === 'sw' ? 'sw' : 'en';
  const w = WORDS[code];
  const accepting = typeof onAccept === 'function';
  const [notice, setNotice] = useState(null);
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadPrivacyNotice().then(data => { if (alive) setNotice(data); });
    const onKey = event => { if (event.key === 'Escape' && !accepting) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { alive = false; document.removeEventListener('keydown', onKey); };
  }, [open, onClose, accepting]);
  if (!open) return null;
  return <div className="vw-privacy-overlay" role="presentation" onMouseDown={event => { if (!accepting && event.target === event.currentTarget) onClose?.(); }}>
    <section className="vw-privacy" role="dialog" aria-modal="true" aria-labelledby="vw-privacy-title">
      {!accepting && <button type="button" className="vw-privacy-x" aria-label={w.close} onClick={onClose}><X size={18}/></button>}
      {notice ? <>
        <span className="vw-privacy-tag">{w.tag(notice.version)}{notice.isDefault ? ` · ${w.draft}` : ''}</span>
        <h2 id="vw-privacy-title">{notice.title?.[code] || notice.title?.en}</h2>
        <NoticeBody text={notice.body?.[code] || notice.body?.en}/>
      </> : <p id="vw-privacy-title">{w.loading}</p>}
      {accepting ? <>
        <label className="vw-privacy-confirm"><input type="checkbox" checked={ticked} onChange={event => setTicked(event.target.checked)} disabled={busy}/> <span>{w.confirm}</span></label>
        <div className="vw-privacy-foot">
          <button type="button" className="vw-idle-out" onClick={onSignOut} disabled={busy}>{w.out}</button>
          <button type="button" className="vw-privacy-close" onClick={() => onAccept(notice)} disabled={!ticked || !notice || busy}>{w.cont}</button>
        </div>
      </> : <div className="vw-privacy-foot"><button type="button" className="vw-privacy-close" onClick={onClose}>{w.close}</button></div>}
    </section>
  </div>;
}
