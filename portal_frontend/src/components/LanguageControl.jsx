import Icon from './Icon';

export default function LanguageControl({ language, onChange }) {
  return (
    <div className="language-control">
      <Icon name="globe" size={19} />
      <select
        aria-label="Language"
        value={language}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="EN">English</option>
        <option value="SW">Kiswahili</option>
      </select>
      <Icon name="chevron" size={14} />
    </div>
  );
}
