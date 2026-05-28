/**
 * Tiny class-name joiner — accepts strings, undefined, false, and arrays.
 * No tailwind-merge: when two utilities collide we want the LAST one to win
 * (the Tailwind default), and we structure callers to never pass conflicting
 * pairs anyway. If that breaks later, we can swap to tailwind-merge then.
 */
export type ClassValue =
  | string
  | undefined
  | null
  | false
  | 0
  | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string") {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
    }
  };
  for (const v of values) walk(v);
  return out.join(" ");
}
