const STYLE_ID = "localix-grammar-theme";

const CSS = `
  @keyframes localix-spin {
    to { transform: rotate(360deg); }
  }

  .localix-grammar {
    --lx-bg: #18181b;
    --lx-bg-hover: #27272a;
    --lx-border: rgba(255,255,255,0.12);
    --lx-text: rgba(255,255,255,0.88);
    --lx-text-soft: rgba(255,255,255,0.55);
    --lx-text-faint: rgba(255,255,255,0.30);
    --lx-surface: rgba(14,14,16,0.97);
    --lx-surface-hover: rgba(255,255,255,0.06);
    --lx-shadow: 0 6px 24px rgba(0,0,0,0.5);
    --lx-accent: #ffffff;
    --lx-accent-fg: #18181b;
    --lx-error: #ef4444;
    --lx-warning: #f97316;
    --lx-info: #3b82f6;
    --lx-purple: #a78bfa;
    --lx-green: #4ade80;
    --lx-radius: 10px;
    --lx-radius-sm: 6px;
  }

  @media (prefers-color-scheme: light) {
    .localix-grammar {
      --lx-bg: #ffffff;
      --lx-bg-hover: #f4f4f5;
      --lx-border: rgba(0,0,0,0.10);
      --lx-text: rgba(0,0,0,0.88);
      --lx-text-soft: rgba(0,0,0,0.55);
      --lx-text-faint: rgba(0,0,0,0.30);
      --lx-surface: rgba(255,255,255,0.98);
      --lx-surface-hover: rgba(0,0,0,0.04);
      --lx-shadow: 0 6px 24px rgba(0,0,0,0.10);
      --lx-accent: #18181b;
      --lx-accent-fg: #ffffff;
    }
  }
`;

export function injectThemeStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
