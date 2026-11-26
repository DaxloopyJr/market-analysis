
import "./SystemLoader.css";

export default function SystemLoader({
  message = "Loading...",
  colSpan,
  compact = false,
}) {
  const loader = (
    <div
      className={`vim-system-loader ${compact ? "vim-system-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="spinner-border text-primary"
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );

  if (Number.isInteger(colSpan) && colSpan > 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="vim-system-loader-cell">
          {loader}
        </td>
      </tr>
    );
  }

  return loader;
}
