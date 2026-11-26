export function validateLogin(values, lang = 'EN') {
  const errors = {};
  const identifier = values.email.trim();

  if (!identifier) {
    errors.email = lang === 'EN'
      ? 'Email or username is required.'
      : 'Barua pepe au jina la mtumiaji linahitajika.';
  } else if (identifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    errors.email = lang === 'EN'
      ? 'Enter a valid email address.'
      : 'Weka barua pepe sahihi.';
  } else if (!identifier.includes('@') && !/^[a-zA-Z0-9._-]+$/.test(identifier)) {
    errors.email = lang === 'EN'
      ? 'Enter a valid username (letters, numbers, . _ -).'
      : 'Weka jina sahihi la mtumiaji.';
  }

  if (!values.password) {
    errors.password = lang === 'EN'
      ? 'Password is required.'
      : 'Nenosiri linahitajika.';
  } else if (values.password.length < 10) {
    errors.password = lang === 'EN'
      ? 'Password must be at least 10 characters.'
      : 'Nenosiri lazima liwe na angalau herufi 10.';
  }

  return errors;
}
