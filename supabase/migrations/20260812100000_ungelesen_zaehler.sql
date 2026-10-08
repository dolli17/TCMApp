-- ===========================================================================
-- Zaehler fuer die Glocke
--
-- Die Glocke hat bisher direkt auf notifications gezaehlt und sich dabei auf
-- RLS verlassen. Fuer Admins gilt dort aber zusaetzlich notifications_admin_all
-- - die Glocke zaehlte also die ungelesenen Benachrichtigungen aller
-- Mitglieder, waehrend my_notifications und mark_notifications_read nur die
-- eigenen kennen. Ergebnis: eine Zahl an der Glocke, eine leere Liste, und die
-- Zahl ging nie weg.
--
-- Der Zaehler laeuft deshalb ueber dieselbe Einschraenkung wie die Liste.
-- ===========================================================================

create or replace function public.my_unread_notification_count()
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.notifications n
  where n.member_id = private.current_member_id()
    and n.read_at is null;
$$;

revoke execute on function public.my_unread_notification_count() from public, anon;
grant  execute on function public.my_unread_notification_count() to authenticated;
