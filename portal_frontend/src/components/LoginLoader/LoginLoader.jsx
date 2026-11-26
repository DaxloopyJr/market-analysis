import "./LoginLoader.css";

const EMBLEM = "/reference/national-emblem.png";

/** Render ONLY after Laravel /login + /me + dashboard.view have succeeded. */
export default function LoginLoader({ language = "EN" }) {
  return (
    <div className="viwanda-login-overlay" role="status" aria-live="polite">
      <div className="viwanda-login-loader text-center">
        <img
          className="viwanda-login-emblem"
          src={EMBLEM}
          alt="Coat of arms of the United Republic of Tanzania"
        />
        <div className="viwanda-login-spinner" aria-hidden="true">
          <span className="viwanda-login-spinner-center" />
        </div>
        <h2 className="viwanda-login-title">VIWANDA PORTAL</h2>
        <p className="viwanda-login-status">
          {language === "SW" ? "Tunafungua dashibodi yako..." : "Opening your dashboard..."}
        </p>
        <div className="viwanda-login-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
