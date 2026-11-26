import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the generated dark stylesheet is loaded after the app styles and only applies in dark mode', () => {
  const main = read('src/main.jsx');
  assert.ok(main.indexOf("import App from './App.jsx'") < main.indexOf("import './styles/dark-mode.generated.css'"));
  const css = read('src/styles/dark-mode.generated.css');
  const rules = css.split('\n').filter((line) => line.includes('{') && !line.startsWith('/*'));
  assert.ok(rules.length > 1000);
  assert.ok(rules.every((line) => line.includes('body[data-vw-theme="dark"]')));
  assert.doesNotMatch(css, /\.dashboard-sidebar\{/);
});

test('the profile menu switches light, dark and same-as-computer through the saved appearance', () => {
  const top = read('src/components/Topbar.jsx');
  assert.match(top, /function ThemeSwitch/);
  assert.match(top, /saveAppearance\(\{ \.\.\.preferences, theme: value \}\)/);
  for (const value of ['light', 'dark', 'auto']) assert.match(top, new RegExp(`value: "${value}"`));
  assert.ok(top.indexOf('<ThemeSwitch') < top.indexOf('portal-profile-signout'));
});
