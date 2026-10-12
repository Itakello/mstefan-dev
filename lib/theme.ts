export const INITIAL_THEME_SCRIPT = `
  (function () {
    try {
      var storedTheme;
      try {
        storedTheme = localStorage.getItem("theme");
      } catch (error) {}
      var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var shouldUseDark = storedTheme ? storedTheme === "dark" : systemDark;
      document.documentElement.classList.toggle("dark", shouldUseDark);
      var favicon = document.createElement("link");
      favicon.rel = "icon";
      favicon.href = shouldUseDark ? "/icon.png" : "/icon-light.png";
      document.head.appendChild(favicon);
    } catch (error) {}
  })();
`;
