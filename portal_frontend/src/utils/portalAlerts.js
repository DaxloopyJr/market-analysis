/**
 * VIWANDA global notifications – one SweetAlert2 toast presentation.
 *
 *  - Information: success / warning (Attention) / error / info (Details)
 *    use the same top-right toast style through showPortalToast().
 *  - INTERACTIVE confirmation dialogs retain real SweetAlert2 Swal.fire(),
 *    so Delete, Submit, Activate, Reopen, etc. still require Yes/Cancel.
 *  - Legacy Swal.fire informational calls are routed via this compatibility
 *    facade; new pages should call showPortalToast or useToast().showToast.
 *
 * No global monkeypatch of SweetAlert2. No message is interpreted as HTML.
 */
import Swal from 'sweetalert2';

const COLORS = new Set(['success', 'error', 'warning', 'info']);
export const normalizeNotificationType = type => {
  const value = String(type ?? 'info').toLowerCase();
  if (value === 'attention' || value === 'caution') return 'warning';
  if (value === 'details' || value === 'detail' || value === 'information') return 'info';
  return COLORS.has(value) ? value : 'info';
};

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timerProgressBar: true, // thin time bar (8 Nov 2026)
  allowEscapeKey: true,
  allowOutsideClick: true,
  customClass: {
    container: 'viwanda-swal-toast-container',
    popup: 'viwanda-swal-toast',
    title: 'viwanda-swal-toast-title',
    htmlContainer: 'viwanda-swal-toast-message',
  },
});

/**
 * One-way notification: the icon maps to the message severity, never the API
 * HTTP status alone. Success must be called only after confirmed persistence.
 * Errors stay visible longer so Laravel validation information is readable.
 */
export function showPortalToast({type, icon, title='', message, text, duration, timer}={}) {
  const level = normalizeNotificationType(type ?? icon);
  const content = String(message ?? text ?? '');
  const fullTitle = String(title ?? '');
  // Do not expand an API-validation error into a full-height right-side panel.
  // The complete error remains accessible on demand via the Details control.
  const hasDetails = content.length > 86 || /[\r\n]/.test(content);
  const preview = hasDetails ? `${content.slice(0, 80).trimEnd()}…` : content;
  const fallbackMs = level === 'error' ? 7200 : level === 'warning' ? 5200 :
    level === 'info' ? 4300 : 3400;
  const supplied = Number(duration ?? timer);
  const timeout = Number.isFinite(supplied) && supplied > 0 ? Math.max(1600, supplied) : fallbackMs;

  return toast.fire({
    icon: level,
    title: fullTitle,
    text: preview, // SweetAlert2 escapes text; user-controlled messages are not HTML.
    timer: timeout,
    didOpen: popup => {
      if (!hasDetails) return;
      const details = document.createElement('button');
      details.type = 'button';
      details.className = 'viwanda-swal-toast-details';
      details.textContent = 'View details';
      details.setAttribute('aria-label', `View full details: ${fullTitle || 'Notification'}`);
      details.addEventListener('click', event => {
        event.stopPropagation();
        Swal.close();
        // Only a deliberate click opens the full details dialog.
        void Swal.fire({
          icon: level,
          title: fullTitle || 'Notification details',
          text: content,
          confirmButtonText: 'Close',
          showConfirmButton: true,
        });
      });
      popup.appendChild(details);
    },
  });
}

/** True only for actions that actually need user interaction/confirmation. */
export function isInteractiveAlert(options={}) {
  if (!options || typeof options !== 'object') return true;
  return Boolean(options.showCancelButton || options.showDenyButton || options.input ||
    options.preConfirm || options.preDeny || options.didOpen || options.willOpen ||
    options.allowOutsideClick === false ||
    (options.icon === 'question' && !options.toast));
}

/** Back-compatible Swal.fire for existing pages: toasts for information. */
const PortalSwal = {
  fire(options, ...rest) {
    if (isInteractiveAlert(options)) return Swal.fire(options, ...rest);
    const {icon,type,title,text,message,timer,duration} = options;
    return showPortalToast({icon,type,title,text,message,timer,duration});
  },
};

export function dismissPortalToast() {
  const popup = Swal.getPopup();
  if (popup?.classList?.contains('viwanda-swal-toast')) Swal.close();
}

export default PortalSwal;
