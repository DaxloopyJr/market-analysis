/**
 * Institution picture — ONE resolver used everywhere in the portal (cards, tables,
 * review headings, analytics, sidebar workspace).
 * API reference 27 Oct 2026: institution records, login and /me institution expose
 *   profile_image_path  e.g. "institutions/4/<file>.png"  (Laravel public disk)
 *   profile_image_url   e.g. "<public-storage-url>/institutions/4/<file>.png"
 * Upload / replace / remove: POST /institutions/{id}/profile-image (src/API/institution.jsx).
 */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

/** "institutions/4/a.png" -> "/storage/institutions/4/a.png" (served through the Vite /storage proxy). */
export function storagePathUrl(path) {
  if (typeof path !== 'string') return '';
  const clean = path.trim().replace(/^\/+/, '').replace(/^storage\//, '');
  if (!clean || clean.includes('..') || /^[a-z]+:/i.test(clean)) return '';
  return `/storage/${clean}`;
}

function safeUrl(source) {
  if (typeof source !== 'string') return '';
  const url = source.trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      // Laravel APP_URL left as localhost: the browser cannot reach it, so use the proxied path.
      if (LOCAL_HOSTS.test(parsed.hostname) && parsed.pathname.startsWith('/storage/')) return parsed.pathname;
      return url;
    } catch { return ''; }
  }
  // Refuse data:, javascript:, protocol-relative and other schemes.
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '';
}

/* Shared logo directory (29 Oct 2026). Many Laravel payloads embed a SHORT institution object
 * ({id,name,code}) without the picture fields (submissions, analytics organisations, reports).
 * The directory is filled from every full institution record the portal reads (GET /institutions,
 * /me, any record that carries the picture) and is used when a record has no picture of its own. */
/** Official logo / icon of the system (national emblem): Ministry and its departments. */
export const NATIONAL_EMBLEM = '/reference/national-emblem.png';

const directory = new Map();
const keysOf = (org) => [org.id !== undefined && org.id !== null ? `id:${org.id}` : '',
  org.code ? `code:${String(org.code).trim().toUpperCase()}` : '', org.short_name ? `code:${String(org.short_name).trim().toUpperCase()}` : '',
  org.name ? `name:${String(org.name).trim().toLowerCase()}` : ''].filter(Boolean);
function ownLogo(institution) {
  const direct = safeUrl(institution.profile_image_url ?? institution.profileImageUrl ?? institution.logo_url ??
    institution.logoUrl ?? institution.logo?.url ?? institution.image_url ?? institution.imageUrl ?? '');
  return direct || storagePathUrl(institution.profile_image_path ?? institution.profileImagePath ?? '');
}
/** Store the pictures of full institution records (returns how many were new). */
export function rememberInstitutionLogos(list = []) {
  let added = 0;
  for (const org of Array.isArray(list) ? list : [list]) {
    if (!org || typeof org !== 'object') continue;
    const url = ownLogo(org);
    if (!url) continue;
    for (const key of keysOf(org)) { if (directory.get(key) !== url) { directory.set(key, url); added += 1; } }
  }
  return added;
}
export const institutionLogoDirectorySize = () => directory.size;

/** Picture URL for an institution record, or '' when none has been uploaded. */
export function institutionLogoUrl(institution) {
  if (!institution || typeof institution !== 'object') return '';
  const own = ownLogo(institution);
  if (own) { if (!directory.has(`id:${institution.id}`)) rememberInstitutionLogos(institution); return own; }
  for (const key of keysOf(institution)) { const hit = directory.get(key); if (hit) return hit; }
  // The Ministry itself (MIT) uses the national emblem until it uploads its own picture.
  const code = String(institution.code ?? institution.short_name ?? '').trim().toUpperCase();
  return code === 'MIT' ? NATIONAL_EMBLEM : '';
}

// Laravel rule: JPEG/JPG, PNG or WebP; max 2048 KB; max 2000 x 2000 px; SVG not allowed.
export const INSTITUTION_LOGO_MAX_BYTES = 2048 * 1024;
export const INSTITUTION_LOGO_MAX_PX = 2000;
export function institutionLogoValidation(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Choose a JPG, PNG or WebP image.';
  }
  if (file.size > INSTITUTION_LOGO_MAX_BYTES) return 'Picture must be 2 MB (2048 KB) or smaller.';
  return '';
}
export function institutionLogoDimensionError(width, height) {
  return width > INSTITUTION_LOGO_MAX_PX || height > INSTITUTION_LOGO_MAX_PX
    ? `Picture must be at most ${INSTITUTION_LOGO_MAX_PX} x ${INSTITUTION_LOGO_MAX_PX} pixels (this one is ${width} x ${height}).`
    : '';
}
