import type { Profile } from "./types";

const KEY = "pokerng-v1";
const OLD_KEY = "rolldex-v1";

export function blankProfile(): Profile {
  return { name: "Trainer", owned: {}, opened: 0, xp: 0, avatar: "", recent: [] };
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

export function keepAvatar(avatar: string): string {
  if (avatar.startsWith("data:image/") && avatar.length < 120_000) return avatar;
  if (avatar.startsWith("pixel:https://") && avatar.length < 400) return avatar;
  if (/^card:\d+$/.test(avatar)) return avatar;
  return "";
}

function readKey(key: string): Profile | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    if (!parsed || typeof parsed !== "object") return null;
    const avatar = typeof parsed.avatar === "string" ? parsed.avatar : "";
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.map(Number).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 8)
      : [];
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Trainer",
      owned: parsed.owned && typeof parsed.owned === "object" ? parsed.owned : {},
      opened: Number(parsed.opened) || 0,
      xp: Number(parsed.xp) || 0,
      avatar: keepAvatar(avatar),
      recent,
    };
  } catch {
    return null;
  }
}
