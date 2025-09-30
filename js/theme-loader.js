(function() {
  try {
    // 1. Check for a saved theme in localStorage
    var savedTheme = localStorage.getItem('theme');
    
    // 2. Check for the user's OS-level preference
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    // 3. Apply the theme
    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
      // If saved theme is light, or no theme is saved but OS is light...
      document.documentElement.setAttribute('data-theme', 'light');
    }
    // No 'else' is needed because the default is dark.
  } catch (e) {
    // Silently fail if localStorage or matchMedia is not available.
  }
})();