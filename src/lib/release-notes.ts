// The "Was ist neu"-Verlauf — a hand-curated changelog, newest first. Update =
// deploy (the code-changelog choice over a DB table; no schema, ships with the
// build that introduces the changes).
//
// On every app load we compare APP_VERSION against the version the user last
// saw (localStorage `nakama:last-seen-version`); if it moved forward and an
// entry exists for the new version, the ReleaseNotesDialog auto-opens once. The
// version label in the profile footer reopens it manually any time.
//
// Convention: `version` MUST match the `package.json` version that shipped it,
// so the "is this newer than last seen?" comparison lines up. Keep `changes`
// short and user-facing (what changed for them, not the commit subject).

export interface ReleaseNote {
  /** Matches package.json version at ship time, e.g. "0.1.0". */
  version: string;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** Optional one-line headline shown under the version. */
  title?: string;
  /** User-facing bullet points. */
  changes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.1.0",
    date: "2026-06-04",
    title: "Nakama ist da — die Beta für Freunde",
    changes: [
      "Tracke Anime, Manga, Serien, Filme und Spiele — pro Folge oder als Abschluss.",
      "Geteilte Listen: gemeinsam schauen, Fortschritt optional synchron halten.",
      "Home zeigt, was als Nächstes kommt und wo du weitermachen kannst.",
      "Kalender, Logbuch und Mitseher-Anzeige für geteilte Listen.",
      "8 Themes in Hell & Dunkel, eigene Listen-Cover und Profilbilder.",
    ],
  },
];

/** The newest entry, or null if the changelog is empty. */
export function latestNote(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null;
}

/**
 * Compare two semver-ish "x.y.z" strings. Returns >0 if `a` is newer than `b`,
 * <0 if older, 0 if equal. Missing/garbage segments count as 0, so a malformed
 * stored value just reads as the oldest possible version (auto-open fires).
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
