/** Labelled input with consistent errors across create/edit forms. */
export default function FormField({
  title, name, value, error, onChange, required = false,
  type = "text", disabled = false, autoComplete,
}) {
  return (
    <label className="vim-field">
      <span>{title}{required && <b> *</b>}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        className={`form-control ${error ? "is-invalid" : ""}`}
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error && <small className="invalid-feedback d-block">{error}</small>}
    </label>
  );
}
