-- Anzeige-Tag (Display-Weekday-Override) deaktiviert (2026-07-07).
--
-- Der manuelle Release-Tag-Versatz hat mehr verwirrt als geholfen: Lanes
-- konnten auseinanderlaufen (gesyncte Instanz Mo vs. globale Lane So), und der
-- Was-kommt-Klick landete auf der globalen Item-Route — also in einer anderen
-- Lane, als der Eintrag anzeigte. Der Picker ist im Client unmountet
-- (ItemDetail.tsx); diese Migration setzt alle gespeicherten Overrides
-- zurück, damit jede Fläche wieder das Quell-Datum zeigt.
--
-- Bewusst NUR ein Daten-Reset: Tabelle `item_display_prefs`, Spalte
-- `list_items.display_weekday` und der RPC `set_instance_display_weekday`
-- bleiben bestehen (schlafend) — mit überall NULL sind alle snapToWeekday-
-- Aufrufe No-Ops, und das Feature ließe sich per Remount günstig
-- reaktivieren. Idempotent.

delete from public.item_display_prefs;

update public.list_items
set display_weekday = null
where display_weekday is not null;
