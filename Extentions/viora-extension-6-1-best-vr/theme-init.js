// Apply saved theme before paint to avoid a flash of the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('viora-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
