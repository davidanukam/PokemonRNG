import type { Profile } from "./types";

const KEY = "pokerng-v1";
const OLD_KEY = "rolldex-v1";

export function blankProfile(): Profile {
  return { name: "Trainer", owned: {}, opened: 0, xp: 0 };
}

export function readProfile(): Profile {
  const current = readKey(KEY);
  if (current) return current;
  const older = readKey(OLD_KEY);
  if (older) {
    writeProfile(older);
    return older;
  }
  return blankProfile();
}

export function writeProfile(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

function readKey(key: string): Profile | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Trainer",
      owned: parsed.owned && typeof parsed.owned === "object" ? parsed.owned : {},
      opened: Number(parsed.opened) || 0,
      xp: Number(parsed.xp) || 0,
    };
  } catch {
    return null;
  }
}
