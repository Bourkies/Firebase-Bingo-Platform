(function() {
  try {
    // 1. Check for a saved theme in localStorage
    var savedTheme = localStorage.getItem('theme');

    if (savedTheme && savedTheme !== 'dark') {
        // If a theme is saved and it's not the default dark theme, apply it.
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (!savedTheme) {
        // If no theme is saved, check for the user's OS-level preference for light mode.
        var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (prefersLight) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }
    // If savedTheme is 'dark' or no preference is found, do nothing and let the default dark theme apply.
  } catch (e) {
    // Silently fail if localStorage or matchMedia is not available.
  }
})();