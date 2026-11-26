/** User-friendly messages only. Technical endpoint/status diagnostics remain in dev console. */
import Swal from 'sweetalert2';
import {useCallback,useState} from 'react';
import {apiError, validationErrors} from '../API/resourceHelpers.js';

const fallbackMessage = 'Unable to complete this request. Please try again.';
const technicalOnly = /^(?:\[.*?\]\s*)?(?:GET|POST|PUT|PATCH|DELETE)\s+\/|^HTTP\s+\d+|^\/api\//i;
export function userFacingErrorMessage(error) {
  if (!error) return fallbackMessage;
  const response = error?.response ?? error?.cause?.response;
  if (response) {
    const message = apiError({response,code:error.code});
    const fields = Object.values(validationErrors({response})).filter(Boolean);
    const generic = /^(?:the given data was invalid|validation failed|unprocessable content|validation error)[.!]?$/i;
    const chosen = generic.test(message) && fields.length ? fields.join(' ') : message;
    return chosen || fallbackMessage;
  }
  const raw = typeof error === 'string' ? error : String(error?.message || '');
  // Backwards compatibility for service errors that originally prefixed HTTP routes.
  const stripped = raw
    .replace(/^\[[^\]]+\]\s*\/\S+\s*\|\s*HTTP\s*\d+\s*\|\s*/i, '')
    .replace(/^\[[^\]]+\]\s*(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?\/[^:|]*\s*[:|]\s*/i, '')
    .replace(/^(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?\/[^|]*\|\s*HTTP\s*(?:\d+|NO RESPONSE)\s*\|\s*/i, '')
    .split(/\s+[—–]\s+(?=Check |Verify |Laravel |Network error:)/)[0]
    .trim();
  if (!stripped || technicalOnly.test(stripped) || /^\[[^\]]+\]/.test(stripped)) return fallbackMessage;
  if (/^Could not reach Laravel/i.test(stripped)) return 'Unable to connect to the server. Check your connection and try again.';
  if (/^Laravel endpoint was not found/i.test(stripped)) return 'The requested service is currently unavailable. Please contact your administrator.';
  if (/^Laravel (?:has not provided|did not provide)/i.test(stripped)) return 'This feature is not available yet. Please contact your administrator.';
  if (/^(?:GET|POST|PUT|PATCH) \/submissions.*(?:revision|ID)/i.test(stripped)) return 'We could not verify this submission. Check My Submissions before trying again.';
  if (/expectedRevision|numeric revision|GET \/submissions.*revision/i.test(stripped)) return 'The latest version of this submission could not be verified. Refresh and try again.';
  if (/Laravel accepted the PUT|saved values could not be verified/i.test(stripped)) return 'Saved values could not be verified. Please contact support before submitting.';
  if (/may have created the submission or context|POST \/submissions returned no submission ID/i.test(stripped)) return 'We could not confirm whether your submission was saved. Check My Submissions before trying again.';
  return stripped.slice(0, 800);
}

/** Dismissible modal, not an in-page error banner or auto-disappearing toast. */
export function showUserFacingError(error, title = 'Unable to complete request') {
  if (Swal.isVisible() && Swal.getPopup()?.classList.contains('viwanda-api-error-dialog')) return Promise.resolve();
  return Swal.fire({
    customClass: {popup: 'viwanda-api-error-dialog'},
    icon: 'error',
    title,
    text: userFacingErrorMessage(error),
    confirmButtonText: 'Close',
    showConfirmButton: true,
    showCloseButton: true,
    allowOutsideClick: true,
    allowEscapeKey: true,
  });
}

/**
 * Shared error-state hook for API-backed pages and action-blocking validation.
 * Errors are shown once as a dismissible SweetAlert2 dialog, never inserted
 * into the page as a large alert banner. State remains available for retry UI.
 * Client-side field validation remains next to its input as appropriate.
 */
export function useErrorDialogState(initial = '') {
  const [message, setMessage] = useState(initial);
  const update = useCallback((next) => {
    // All error messages in this hook are strings or Error objects.
    setMessage(next);
    if (next && typeof next !== 'function') {
      void showUserFacingError(next, 'Please check your request');
    }
  }, []);
  return [message, update];
}
