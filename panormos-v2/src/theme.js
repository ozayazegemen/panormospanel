// Panel renk paletleri: koyu ve açık mod.
// Seçim tarayıcıda saklanır; değiştirince sayfa yenilenir (renkler modül yüklenirken okunur).
const KEY = "panormos_theme";

const DARK = {
  bg: "#0A111D", bgCard: "#101927", bgCardHover: "#152033", bgSurface: "#172337", bgInput: "#0B1321",
  border: "#1D2A3F", borderLight: "#2B3B55",
  indigo: "#24406A", indigoDim: "#182B47", indigoGlow: "rgba(36,64,106,0.35)", indigoText: "#8FB4DA",
  amber: "#F25124", amberDim: "rgba(242,81,36,0.15)", amberText: "#F8906E",
  green: "#10B981", greenDim: "rgba(16,185,129,0.15)", greenText: "#6EE7B7",
  red: "#EF4444", redDim: "rgba(239,68,68,0.12)", redText: "#FCA5A5",
  violet: "#F25124", violetDim: "rgba(242,81,36,0.12)", violetText: "#F8906E",
  pinkText: "#F9A8D4", purpleText: "#C4B5FD",
  textPrimary: "#F1F5FA", textSecondary: "#A2B4C9", textMuted: "#6C8098", white: "#FFFFFF",
  shadow: "0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.45)",
  sidebarBg: "#0D1522", headerBg: "rgba(13,21,34,0.85)", hover: "rgba(255,255,255,0.045)",
  placeholder: "#566A82", scrollThumb: "#24334B", scrollThumbHover: "#34486A",
};

const LIGHT = {
  bg: "#F3F5F9", bgCard: "#FFFFFF", bgCardHover: "#F8FAFC", bgSurface: "#EDF1F6", bgInput: "#F6F8FB",
  border: "#DFE5EE", borderLight: "#C5CFDD",
  indigo: "#2A4A75", indigoDim: "#E3EBF6", indigoGlow: "rgba(42,74,117,0.13)", indigoText: "#27507F",
  amber: "#F25124", amberDim: "rgba(242,81,36,0.10)", amberText: "#C2410C",
  green: "#059669", greenDim: "rgba(16,185,129,0.13)", greenText: "#047857",
  red: "#DC2626", redDim: "rgba(239,68,68,0.10)", redText: "#B91C1C",
  violet: "#F25124", violetDim: "rgba(242,81,36,0.10)", violetText: "#C2410C",
  pinkText: "#BE185D", purpleText: "#6D28D9",
  textPrimary: "#0F1B2D", textSecondary: "#44556B", textMuted: "#728196", white: "#FFFFFF",
  shadow: "0 1px 2px rgba(16,24,40,0.05), 0 10px 24px -16px rgba(16,24,40,0.22)",
  sidebarBg: "#FFFFFF", headerBg: "rgba(255,255,255,0.88)", hover: "rgba(15,27,45,0.05)",
  placeholder: "#9AA7B8", scrollThumb: "#CBD5E1", scrollThumbHover: "#A9B6C8",
};

export const THEME = (() => {
  try { return window.localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch (e) { return "dark"; }
})();

export const T = THEME === "light" ? LIGHT : DARK;

export function toggleTheme() {
  try { window.localStorage.setItem(KEY, THEME === "light" ? "dark" : "light"); } catch (e) {}
  window.location.reload();
}
