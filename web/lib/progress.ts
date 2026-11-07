import type { Profile } from "@/lib/types";

export function profileHasProgress(profile: Profile): boolean {
  if (profile.opened > 0 || profile.xp > 0 || profile.avatar || profile.recent.length > 0) return true;
  return Object.values(profile.owned).some((counts) => counts.some((count) => count > 0));
}
