import type { Profile } from "@/lib/types";

const TOKEN_KEY = "pokerng-player";

function playerToken(): string {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

function headers(): HeadersInit {
  return { Authorization: `Bearer ${playerToken()}`, "Content-Type": "application/json" };
}

function hasProgress(profile: Profile): boolean {
  if (profile.opened > 0 || profile.xp > 0 || profile.avatar || profile.recent.length > 0) return true;
  return Object.values(profile.owned).some((counts) => Array.isArray(counts) && counts.some((count) => count > 0));
}

export async function syncProfile(local: Profile, stillCurrent: () => boolean): Promise<Profile | null> {
  try {
    const response = await fetch("/api/player", { headers: headers() });
    if (!response.ok) return null;
    const cloud = (await response.json()) as Profile;
    if (!cloud || typeof cloud !== "object" || typeof cloud.name !== "string") return null;
    if (!hasProgress(cloud) && hasProgress(local)) {
      const body = JSON.stringify(local);
      const uploaded = new Promise<boolean>((resolve) => {
        chain = chain.then(async () => {
          if (!stillCurrent()) {
            resolve(false);
            return;
          }
          try {
            const saved = await fetch("/api/player", { method: "PUT", headers: headers(), body });
            resolve(saved.ok && stillCurrent());
          } catch {
            resolve(false);
          }
        });
      });
      return (await uploaded) ? local : null;
    }
    if (!stillCurrent()) return null;
    return cloud;
  } catch {
    return null;
  }
}

let chain: Promise<void> = Promise.resolve();

export function pushProfile(profile: Profile): void {
  const body = JSON.stringify(profile);
  chain = chain.then(async () => {
    try {
      await fetch("/api/player", { method: "PUT", headers: headers(), body });
    } catch {
      // The local copy is already saved.
    }
  });
}
