// Panel renk paletleri: koyu ve açık mod.
// Seçim tarayıcıda saklanır; değiştirince sayfa yenilenir (renkler modül yüklenirken okunur).
const KEY = "panormos_theme";

// Renkler panormosmedya.com ile aynı aileden: mürekkep siyahı, krem, turuncu, pembe, elektrik mavisi, sarı, mor.
const DARK = {
  bg: "#0E0E14", bgCard: "#17171F", bgCardHover: "#1D1D27", bgSurface: "#22222D", bgInput: "#121219",
  border: "#2A2A37", borderLight: "#3A3A4A", cardBorder: "#34343F",
  indigo: "#2D5BFF", indigoDim: "rgba(45,91,255,0.16)", indigoGlow: "rgba(45,91,255,0.35)", indigoText: "#93A9FF",
  amber: "#F25124", amberDim: "rgba(242,81,36,0.16)", amberText: "#FF9B78",
  green: "#22C55E", greenDim: "rgba(34,197,94,0.15)", greenText: "#7EE2A2",
  red: "#EF4444", redDim: "rgba(239,68,68,0.13)", redText: "#FCA5A5",
  violet: "#FF2E88", violetDim: "rgba(255,46,136,0.14)", violetText: "#FF8CC0",
  pinkText: "#FF8CC0", purpleText: "#B79CFF",
  textPrimary: "#F7F4EE", textSecondary: "#B9B6C6", textMuted: "#7D7A8C", white: "#FFFFFF",
  shadow: "4px 4px 0 rgba(0,0,0,0.55)",
  sidebarBg: "#0B0B10", headerBg: "rgba(14,14,20,0.86)", hover: "rgba(255,255,255,0.05)",
  placeholder: "#5F5C6E", scrollThumb: "#2E2E3B", scrollThumbHover: "#45455A",
};

const LIGHT = {
  bg: "#FFF6EA", bgCard: "#FFFFFF", bgCardHover: "#FFFCF7", bgSurface: "#FBEEDD", bgInput: "#FFFDF9",
  border: "#EADDCB", borderLight: "#D8C7B0", cardBorder: "#0E0E14",
  indigo: "#2D5BFF", indigoDim: "#E3E9FF", indigoGlow: "rgba(45,91,255,0.14)", indigoText: "#1F45D6",
  amber: "#F25124", amberDim: "rgba(242,81,36,0.12)", amberText: "#C2410C",
  green: "#16A34A", greenDim: "rgba(22,163,74,0.13)", greenText: "#15803D",
  red: "#DC2626", redDim: "rgba(239,68,68,0.10)", redText: "#B91C1C",
  violet: "#FF2E88", violetDim: "rgba(255,46,136,0.12)", violetText: "#C2185B",
  pinkText: "#C2185B", purpleText: "#6D28D9",
  textPrimary: "#0E0E14", textSecondary: "#4A4756", textMuted: "#857F8F", white: "#FFFFFF",
  shadow: "4px 4px 0 #0E0E14",
  sidebarBg: "#FFFFFF", headerBg: "rgba(255,246,234,0.9)", hover: "rgba(14,14,20,0.05)",
  placeholder: "#A69E93", scrollThumb: "#E2D3BF", scrollThumbHover: "#CDB99F",
};

export const THEME = (() => {
  try { return window.localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch (e) { return "dark"; }
})();

export const T = THEME === "light" ? LIGHT : DARK;

export function toggleTheme() {
  try { window.localStorage.setItem(KEY, THEME === "light" ? "dark" : "light"); } catch (e) {}
  window.location.reload();
}
