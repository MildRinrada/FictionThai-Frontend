/**
 * Achievements (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3).
 *
 * Three families doing three different jobs: `path` tells a new writer what to
 * do next, `identity` says what kind of writer they are, and `egg` is found
 * rather than announced. There is no score anywhere in these types on purpose -
 * no total, no level, no leaderboard.
 */

export type AchievementFamily = "path" | "identity" | "egg";

/** The blank-slot count: the only thing anyone is told about an unfound egg. */
export interface EggCount {
  unlocked: number;
  total: number;
}

/** One achievement as its OWNER sees it, with progress. */
export interface OwnerAchievement {
  key: string;
  family: AchievementFamily;
  title: string;
  description?: string;
  count: number;
  threshold: number;
  unlocked: boolean;
  unlocked_at?: string;
  seen_at?: string;
  showcase_order?: number;
  /** Present only for an egg the owner has actually found. */
  trigger?: string;
  message?: string;
  /** False for every egg - a visitor must never see one named. */
  showcaseable: boolean;
}

export interface OwnerAchievements {
  enabled: boolean;
  achievements: OwnerAchievement[];
  eggs: EggCount;
  showcase_min: number;
  showcase_max: number;
}

/** One achievement as a VISITOR sees it. No progress: that is private. */
export interface PublicAchievement {
  key: string;
  family: AchievementFamily;
  title: string;
  description?: string;
  unlocked_at: string;
}

export interface PublicAchievements {
  enabled: boolean;
  showcase: PublicAchievement[];
  unlocked: number;
  total: number;
  eggs: EggCount;
}

/** What the browser gets back when it reports a client-side trigger. */
export interface SignalResult {
  recorded: boolean;
  unlocked?: {
    key: string;
    family: AchievementFamily;
    title: string;
    trigger?: string;
    message?: string;
  };
}

/** The four keys a browser may report. The server holds the real allowlist. */
export const CLIENT_SIGNALS = {
  devtools: "egg_devtools",
  adminPath: "egg_admin_path",
  disabledButton: "egg_disabled_button",
  ctrlS: "egg_ctrl_s",
} as const;
