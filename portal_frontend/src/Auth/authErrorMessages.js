/** User-safe error copy. Never render Laravel stack traces or raw 500 messages. */
export function describeAuthError(error, language = "EN", context = "login") {
  const sw = language === "SW";
  const status = error?.response?.status ?? error?.status;
  const backendErrors = error?.response?.data?.errors;
  const validationText = backendErrors && Object.values(backendErrors)
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .filter((item) => typeof item === "string")
    .join(" ");
  const invalidCredentials = context === "login" && /invalid credentials|incorrect credentials|wrong password|credentials.*match/i
    .test(`${validationText} ${error?.response?.data?.message || ""}`);

  if (status === 422 && invalidCredentials) return {
    status, title: sw ? "Taarifa si sahihi" : "Invalid credentials",
    message: sw ? "Barua pepe/jina la mtumiaji au nenosiri si sahihi." : "Email/username or password is incorrect.",
  };
  if (status === 422) return {
    status, title: sw ? "Taarifa hazijakubalika" : "Invalid request",
    message: context === "reset"
      ? (sw ? "Kiungo cha kurejesha nenosiri si halali au muda wake umeisha." : "Reset link is invalid or has expired.")
      : (sw ? "Kagua taarifa ulizoweka kisha ujaribu tena." : "Check the information provided and try again."),
  };
  if (status === 401) return {
    status, title: sw ? "Muda wa kuingia umeisha" : "Session expired",
    message: sw ? "Ingia tena kuendelea." : "Please sign in again to continue.",
  };
  if (status === 403) return {
    status, title: sw ? "Ufikiaji umekataliwa" : "Access denied",
    message: sw ? "Akaunti imezuiwa au huna ruhusa. Wasiliana na msimamizi." : "Your account is inactive or access is not permitted. Contact your administrator.",
  };
  if (status === 404) return {
    status, title: sw ? "Huduma haijapatikana" : "Service not available",
    message: context === "forgot" || context === "reset"
      ? (sw ? "API ya kurejesha nenosiri haijawezeshwa kwenye Laravel." : "Password recovery is not yet enabled on the Laravel API.")
      : (sw ? "API ya kuingia haijapatikana. Kagua URL ya /api/v1." : "Authentication API route was not found. Check the /api/v1 routes."),
  };
  if (status === 422) return {
    status, title: sw ? "Majaribio mengi" : "Too many attempts",
    message: sw ? "Subiri kidogo kabla ya kujaribu tena." : "Please wait a minute before trying again.",
  };
  if (status >= 500) return {
    status, title: sw ? "Tatizo la seva" : "Server error",
    message: sw ? "Huduma haipatikani kwa sasa. Jaribu tena baadaye." : "The service is temporarily unavailable. Try again shortly.",
  };
  if (!error?.response && (error?.isAxiosError || error?.code === "ECONNABORTED")) return {
    status: null, title: sw ? "Hakuna mawasiliano" : "Connection failed",
    message: sw ? "Haiwezekani kuwasiliana na seva. Kagua mtandao na IP ya API." : "Cannot reach the server. Check your network and backend IP.",
  };
  return {
    status: status ?? null,
    title: sw ? "Ombi halijakamilika" : "Request failed",
    message: sw ? "Jaribu tena au wasiliana na msimamizi." : "Please try again or contact your administrator.",
  };
}
