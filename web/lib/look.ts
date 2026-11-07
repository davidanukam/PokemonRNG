const TIER_COLOR = ["#8b909a", "#3d9a5f", "#6eb6e8", "#e2b340", "#a56bdb", "#e06aa8", "#ff5a36"];
const COND_COLOR = ["#3ecf8e", "#b6d94c", "#e2b340", "#e07a2f", "#e04b4b"];

export function tierColor(tier: number): string {
  return TIER_COLOR[tier] ?? TIER_COLOR[0];
}

export function condColor(cond: number): string {
  return COND_COLOR[cond] ?? COND_COLOR[0];
}

export function xpColor(pct: number): string {
  if (pct < 30) return "#d64545";
  if (pct < 60) return "#e07a2f";
  if (pct < 75) return "#d6b23a";
  if (pct < 85) return "#3aaa6a";
  if (pct < 95) return "#4c93d6";
  return "#8d5ad4";
}
