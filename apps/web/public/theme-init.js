// Applies the saved theme before first paint (avoids a light flash in dark mode).
// External file because the production CSP forbids inline scripts.
try {
  var t = localStorage.getItem('ajh-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch {
  /* storage unavailable: follow the system theme */
}
