/**
 * FILE: src/utils/authErrorMessages.js
 * FLOW: Login/Forgot/Reset -> API/login or passwordReset -> Laravel response
 *      -> describeAuthError -> SweetAlert2 toast on the login page (showToast -> showPortalToast).
 * Account lockout after 3 failed logins MUST be enforced by Laravel. The
 * frontend displays its response, including locked_until when provided.
 * IMPORTANT: Login lock HTTP status/JSON schema was not supplied with the
 * uploaded endpoints, so accept server message across 401/403/422/423/429.
 */
const safeMessage = (text) => typeof text === "string"
  ? text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 800)
  : "";

export function describeAuthError(error, language = "EN", context = "login") {
  const sw = language === "SW";
  const status = error?.response?.status ?? error?.status ?? null;
  const body = error?.response?.data ?? {};
  const rawMessage = safeMessage(body.message);
  const fieldErrors = body.errors && typeof body.errors === "object"
    ? Object.values(body.errors).flatMap((item) => Array.isArray(item) ? item : [item])
      .map(safeMessage).filter(Boolean)
    : [];
  const validation = fieldErrors.join(" ").slice(0, 800);
  const locked = /lock(ed|out)?|block(ed)?|imefungwa|imefungiwa|imezuiwa/i.test(`${rawMessage} ${validation}`)
    || status === 423 || Boolean(body.locked_until || body.data?.locked_until || body.is_locked || body.data?.is_locked);

  if (status && status < 500 && locked) {
    const until = safeMessage(body.locked_until || body.data?.locked_until);
    return {
      status,
      kind: "locked",
      title: sw ? "Akaunti imefungwa" : "Account locked",
      // Server response is authoritative; do not invent retry times/attempts.
      message: rawMessage || validation || (until
        ? `Account locked until ${until}.`
        : (sw ? "Akaunti imefungwa. Wasiliana na msimamizi." : "Your account is locked. Contact your administrator.")),
    };
  }

  if (status && status < 500) {
    const title = status === 429 ? (sw ? "Majaribio mengi" : "Too many attempts")
      : status === 422 ? (sw ? "Taarifa si sahihi" : "Check your details")
        : status === 403 ? (sw ? "Ufikiaji umekataliwa" : "Access denied")
          : status === 401 ? (sw ? "Kuingia kumeshindikana" : "Sign-in failed")
            : sw ? "Ombi halijakamilika" : "Request failed";
    return {
      status,
      title,
      message: rawMessage || validation || {
        401: "Invalid credentials or session expired.",
        403: "This account cannot access the requested service.",
        404: "The requested service was not found.",
        422: "Please correct the submitted information.",
        429: "Too many attempts. Please try again later.",
      }[status] || "Please contact the system administrator.",
    };
  }
  if (status >= 500) return {
    status,
    title: sw ? "Tatizo la seva" : "Server error",
    message: sw ? "Huduma haipatikani kwa sasa." : "The service is temporarily unavailable.",
  };
  return {
    status,
    title: sw ? "Tatizo la mawasiliano" : "Connection failed",
    message: sw ? "Haiwezekani kuwasiliana na seva." : "Could not reach the server. Check your connection.",
  };
}
