(() => {
  'use strict';

  // Longest the splash can stay up if its CSS animation never reports an end (ms)
  const SPLASH_FALLBACK_MS = 4500;

  /* ------------------------------------------------------------------ */
  /* Splash: plays once on load, then hands over to the onboarding page   */
  /* ------------------------------------------------------------------ */

  function initSplash() {
    const splash = document.getElementById('splash');
    const root = document.documentElement;
    if (!splash) {
      root.classList.remove('is_splash_active');
      return;
    }

    let isDone = false;
    const finish = () => {
      if (isDone) return;
      isDone = true;
      splash.hidden = true;
      root.classList.remove('is_splash_active');
      document.removeEventListener('keydown', skip);
    };

    // A click or key press cuts the intro short
    function skip() {
      splash.classList.add('is_leaving');
    }

    splash.addEventListener('animationend', (event) => {
      if (event.target === splash) finish();
    });
    splash.addEventListener('click', skip);
    document.addEventListener('keydown', skip);
    setTimeout(finish, SPLASH_FALLBACK_MS);
  }

  initSplash();
})();
