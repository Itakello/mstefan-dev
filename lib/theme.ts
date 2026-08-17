export const INITIAL_THEME_SCRIPT = `
  (function () {
    try {
      var storedTheme = localStorage.getItem("theme");
      var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var shouldUseDark = storedTheme ? storedTheme === "dark" : systemDark;
      document.documentElement.classList.toggle("dark", shouldUseDark);
    } catch (error) {}
  })();
`;
