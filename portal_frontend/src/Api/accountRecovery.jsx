/** Login recovery contracts confirmed by backend (public, /api/v1 prefix in axios). */
import api from './axios';

const normalizeError = (error) => ({ ok: false, message: error?.response?.data?.message || error?.message || 'Request failed.', error });
const success = (response) => ({ ok: response?.data?.status === 'success', ...response?.data });

export async function lookupRecoveryDestination({ login, method }) {
  try { return success(await api.post('/forgot-password/lookup', { login: login.trim(), method })); }
  catch (error) { return normalizeError(error); }
}

export async function requestRecoveryOtp({ login, method }) {
  try { return success(await api.post('/forgot-password', { login: login.trim(), method })); }
  catch (error) { return normalizeError(error); }
}

/** OTP verification and password creation are ONE backend operation. */
export async function resetPasswordWithOtp({ login, method, code, password, password_confirmation }) {
  try { return success(await api.post('/reset-password', { login: login.trim(), method, code, password, password_confirmation })); }
  catch (error) { return normalizeError(error); }
}

/** Used by both new-user activation and admin password-reset links. */
export async function activateUserAccount({ login, token, password, password_confirmation }) {
  try { return success(await api.post('/activate', { login: login.trim(), token, password, password_confirmation })); }
  catch (error) { return normalizeError(error); }
}
