import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import PrivacyNotice from "./PrivacyNotice.jsx";

export default function Footer({ variant = "public" }) {
  const { t, lang, pick } = useLanguage();
  // FR-058: the Privacy Notice stays readable after sign-in (9 Nov 2026).
  const [privacyOpen, setPrivacyOpen] = useState(false);
  if (variant === "dashboard") {
    return (
      <footer className="dashboard-footer d-flex flex-wrap justify-content-between gap-2">
        <span>© 2026 {t("Ministry of Industry and Trade")}</span>
        <span>
          <button type="button" className="dashboard-footer-link" onClick={() => setPrivacyOpen(true)}>{pick("Privacy Notice", "Taarifa ya Faragha")}</button>
          {" · "}VIWANDA PORTAL
        </span>
        <PrivacyNotice open={privacyOpen} lang={lang} onClose={() => setPrivacyOpen(false)} />
      </footer>
    );
  }

  return (
    <footer className="bottom-credit">
      Developed and owned by MIT | 2026
    </footer>
  );
}
