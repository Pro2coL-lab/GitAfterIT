// Light/dark theme toggle. Loaded without `defer` so the saved theme applies before first paint (no flash).
// With no saved choice the page follows the device setting (prefers-color-scheme).
(function () {
  const KEY = "repfolio-theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const current = () => root.dataset.theme || (media.matches ? "dark" : "light");

  function apply(theme) {
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
    const btn = document.getElementById("theme-btn");
    if (btn) {
      const dark = current() === "dark";
      btn.textContent = dark ? "☀" : "☾";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      btn.title = btn.getAttribute("aria-label");
    }
  }

  apply(saved());

  document.addEventListener("DOMContentLoaded", () => {
    apply(saved());
    document.getElementById("theme-btn")?.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch { /* private mode: still toggles for this visit */ }
      apply(next);
    });
  });

  // Keep the button icon right if the device theme changes while no explicit choice is saved.
  media.addEventListener("change", () => apply(saved()));
})();
