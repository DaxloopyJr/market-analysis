/**
 * FILE: src/components/PrivacyGate.jsx
 * FR-058 (9 Nov 2026, approved: accept once, after sign-in). Shown when /me says privacy_notice.needs_acceptance
 * (first sign-in, or MOA published a version that must be accepted again). Continue -> POST /privacy-notice/accept.
 * A server without the notice endpoints (original backend) remembers the acceptance in this browser instead.
 * 10 Nov 2026: the dashboard layout keeps the page closed until the notice is accepted, so no page asks Laravel for
 * data first (with PRIVACY_NOTICE_REQUIRED those requests were refused and the page showed their errors).
 */
import {useState} from 'react';
import {acceptPrivacyNotice} from '../API/privacyNotice.js';
import {useLanguage} from '../i18n/LanguageContext.jsx';
import {showUserFacingError} from '../utils/userFacingErrors.js';
import PrivacyNotice from './PrivacyNotice.jsx';
import {localKey} from '../utils/privacyGate.js';


export default function PrivacyGate({user, needed, onAccepted, onSignOut}) {
  const {lang, pick} = useLanguage();
  const server = user?.privacy_notice;
  const fallbackKey = localKey(user, 1);
  const [busy, setBusy] = useState(false);
  if (!user || !needed) return null;

  const accept = async () => {
    setBusy(true);
    try {
      if (server) await acceptPrivacyNotice();
      else { try { localStorage.setItem(fallbackKey, '1'); } catch { /* private mode: asked again next time */ } }
      onAccepted?.();
    } catch (error) {
      await showUserFacingError(error, pick('The Privacy Notice could not be accepted', 'Taarifa ya Faragha haikuweza kukubaliwa'));
    } finally { setBusy(false); }
  };
  return <PrivacyNotice open lang={lang} onAccept={accept} onSignOut={onSignOut} busy={busy}/>;
}
