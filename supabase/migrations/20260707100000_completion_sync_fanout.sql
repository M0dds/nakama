-- Abschluss-Fan-out für Sync-Instanzen (Review P3 #2, Nachzügler).
--
-- Ticks auf einer gesyncten Instanz fächern über set_episode_watch /
-- mark_episodes_watched_upto an alle Mitglieder aus — der abgeleitete
-- Abschluss-Stempel (item_history 'completed') tat das bisher nicht: er ist
-- ein Client-Write und RLS erlaubt nur die eigene Zeile. Folge: der Akteur
-- bekam sein "Du hast X abgeschlossen", der Partner erschien im Logbuch nur
-- mit der letzten Folge, sein Abschluss-Event fehlte (bis zu einem eigenen
-- Detailseiten-Besuch, der passiv heilt).
--
-- Dieser RPC spiegelt den Watch-Fan-out: ein LIVE-Abschluss auf einer
-- gesyncten Instanz stempelt alle Mitglieder mit now() (bzw. räumt beim
-- Un-Tick alle Stempel wieder ab). Vertrauensmodell wie beim Tick-Fan-out:
-- jedes Mitglied kann ohnehin für alle ticken, also auch abschließen.
-- Der passive Heal (rückdatiert) bleibt bewusst ein Own-Row-Client-Write.

create or replace function public.set_completion_synced(
  _item_id uuid,
  _list_item_id uuid,
  _complete boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _sync boolean;
  _list_id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;

  select li.sync_enabled, li.list_id into _sync, _list_id
  from public.list_items li
  where li.id = _list_item_id and li.item_id = _item_id;
  if _list_id is null then
    raise exception 'list_item % not found for item %', _list_item_id, _item_id;
  end if;
  if not public.is_list_member(_list_id, _uid) then
    raise exception 'not a member of list %', _list_id;
  end if;
  if not _sync then
    raise exception 'list_item % is not synced', _list_item_id;
  end if;

  if _complete then
    insert into public.item_history (user_id, item_id, status, updated_at)
    select lm.user_id, _item_id, 'completed', now()
    from public.list_members lm
    where lm.list_id = _list_id
    on conflict (user_id, item_id) do update
      set status = 'completed', updated_at = excluded.updated_at;
  else
    delete from public.item_history ih
    using public.list_members lm
    where lm.list_id = _list_id
      and ih.user_id = lm.user_id
      and ih.item_id = _item_id
      and ih.status = 'completed';
  end if;
end;
$$;

grant execute on function public.set_completion_synced(uuid, uuid, boolean) to authenticated;
