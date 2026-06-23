import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Display-weekday overrides (the "Anzeige-Tag" feature). Lets a viewer snap an
 * item's displayed dates ("Was kommt", calendar, badge, detail) to a chosen
 * weekday — the regional drop ("From" airs US-Sun, here Mon) or a group's watch
 * night ("wir schauen freitags"). Stored per LANE, mirroring episode_watches:
 *
 *   • global lane  → item_display_prefs (per USER, this module)
 *   • sync instance → list_items.display_weekday (group-shared; read via
 *     syncContext, written via the set_instance_display_weekday RPC below)
 *
 * Weekday convention: 0=Sun..6=Sat (Date.getDay()), see format.snapToWeekday.
 */

export const globalDisplayPrefsKey = (userId: string) =>
  ["display-prefs", userId] as const;

/** All of the caller's GLOBAL-lane overrides as item_id → weekday. RLS scopes
 *  item_display_prefs to own rows. Batch-read once, shared by Home/Calendar and
 *  the detail-page picker. */
export function globalDisplayPrefsOptions(user: User) {
  return {
    queryKey: globalDisplayPrefsKey(user.id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const map = new Map<string, number>();
      const { data, error } = await supabase
        .from("item_display_prefs")
        .select("item_id, weekday")
        .eq("user_id", user.id);
      if (error) {
        console.error("display prefs query failed", error);
        return map;
      }
      for (const r of data ?? [])
        map.set(r.item_id as string, r.weekday as number);
      return map;
    },
  };
}

/** Set or clear (`weekday == null`) the GLOBAL per-user override for an item.
 *  Upsert keyed on (user_id, item_id); clearing deletes the row. */
export async function setGlobalDisplayWeekday(
  userId: string,
  itemId: string,
  weekday: number | null,
): Promise<void> {
  if (weekday == null) {
    const { error } = await supabase
      .from("item_display_prefs")
      .delete()
      .eq("user_id", userId)
      .eq("item_id", itemId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("item_display_prefs")
    .upsert(
      { user_id: userId, item_id: itemId, weekday },
      { onConflict: "user_id,item_id" },
    );
  if (error) throw error;
}

/** Set or clear (`weekday == null`) the group-shared override for a synced
 *  instance, via the member-scoped DEFINER RPC. */
export async function setInstanceDisplayWeekday(
  listItemId: string,
  weekday: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("set_instance_display_weekday", {
    _list_item_id: listItemId,
    _weekday: weekday,
  });
  if (error) throw error;
}
