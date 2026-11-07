import { profileHasProgress } from "@/lib/progress";
import type { Profile } from "@/lib/types";

const TOKEN_KEY = "pokerng-player";

function legacyToken(): string | null {
  const existing = localStorage.getItem(TOKEN_KEY);
  return existing && /^[a-f0-9]{64}$/.test(existing) ? existing : null;
}

function headers(): HeadersInit {
  const token = legacyToken();
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export async function syncProfile(local: Profile, stillCurrent: () => boolean): Promise<Profile | null> {
  try {
    const response = await fetch("/api/player", { headers: headers() });
    if (response.status === 401) return null;
    if (!response.ok) return null;
    const cloud = (await response.json()) as Profile;
    if (!cloud || typeof cloud !== "object" || typeof cloud.name !== "string") return null;
    if (!profileHasProgress(cloud) && profileHasProgress(local)) {
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
    if (!profileHasProgress(cloud) && !profileHasProgress(local)) {
      const adopted = await fetch("/api/player?adopt=1", { headers: headers() });
      if (adopted.ok && stillCurrent()) {
        const older = (await adopted.json()) as Profile;
        if (older && profileHasProgress(older)) return older;
      }
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
