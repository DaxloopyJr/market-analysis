/**
 * FILE: src/API/privacyNotice.js
 * FR-058 Privacy Notice (backend patch v14, 9 Nov 2026):
 *   GET  /privacy-notice                 (public)  -> {data:{version,acceptanceVersion,title:{en,sw},body:{en,sw},publishedAt,publishedBy,changeNote,isDefault}}
 *   POST /privacy-notice/accept          (signed in) -> {data:{acceptedVersion,acceptedAt}}
 *   GET  /privacy-notices                (portal_settings.manage) -> {data:{current,history[],accepted,activeUsers}}
 *   POST /privacy-notices {title_en,title_sw,body_en,body_sw,change_note?,requires_reacceptance} (portal_settings.manage) -> 201 {data: notice}
 * /me carries privacy_notice:{acceptance_version,accepted_version,accepted_at,needs_acceptance}.
 */
import api from './axios';

const body = response => response?.data?.data ?? null;

export const getPrivacyNotice = async () => body(await api.get('/privacy-notice'));
export const acceptPrivacyNotice = async () => body(await api.post('/privacy-notice/accept'));
export const getPrivacyNoticeAdmin = async () => body(await api.get('/privacy-notices'));
export const publishPrivacyNotice = async values => body(await api.post('/privacy-notices', values));
