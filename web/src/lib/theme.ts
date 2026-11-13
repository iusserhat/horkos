import { h } from "./dom";

type Theme = "light" | "dark";
const KEY = "horkos-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  return (document.documentElement.dataset.theme as Theme | undefined) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** Applies a remembered choice before first paint (called from each page entry). */
export function initTheme() {
  const t = stored();
  if (t) document.documentElement.dataset.theme = t;
}

export function themeToggle() {
  const btn = h("button", { class: "btn btn-icon theme-toggle", type: "button" });
  const render = () => {
    const t = current();
    btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    btn.textContent = t === "dark" ? "☀" : "☾";
  };
  btn.addEventListener("click", () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page view */
    }
    render();
  });
  render();
  return btn;
}
