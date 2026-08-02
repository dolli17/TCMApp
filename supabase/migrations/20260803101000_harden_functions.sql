-- ===========================================================================
-- Haertung nach Auswertung des Security-Advisors
--
-- Drei Befunde, alle berechtigt:
--   1. member_directory war eine SECURITY-DEFINER-View. Views dieser Art
--      umgehen RLS pauschal und lassen sich nicht feiner steuern. Ersetzt
--      durch eine Funktion, die den Aufrufer selbst prueft.
--   2. Die Trigger-Funktionen waren ueber /rest/v1/rpc/ von aussen aufrufbar.
--      guard_member_self_update haette so direkt angesprochen werden koennen.
--   3. setting_int/text/time brauchen kein EXECUTE fuer Clients - die App
--      liest die Tabelle settings ohnehin direkt ueber ihre Policy.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Verzeichnis als Funktion statt View
--
-- Liefert ausschliesslich Id und Name aktiver Mitglieder - genau das, was fuer
-- Mitspielerauswahl, Belegungsplan und die Kiosk-Oberflaeche gebraucht wird.
-- Der Aufrufer muss Mitglied oder ein aktives Kiosk-Geraet sein.
-- ---------------------------------------------------------------------------
drop view if exists public.member_directory;

create or replace function public.member_directory(p_query text default null)
returns table (id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.first_name, m.last_name
  from public.members m
  where m.status = 'active'
    and (private.is_member() or private.is_kiosk())
    and (
      p_query is null
      or p_query = ''
      or m.first_name ilike '%' || p_query || '%'
      or m.last_name  ilike '%' || p_query || '%'
    )
  order by m.last_name, m.first_name;
$$;

comment on function public.member_directory(text) is
  'Namensverzeichnis fuer Mitspielerauswahl und Kiosk. Gibt nur Id und Name '
  'heraus - keine Kontaktdaten, keine Bankverbindung.';

revoke execute on function public.member_directory(text) from public, anon;
grant  execute on function public.member_directory(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger-Funktionen aus der REST-API nehmen
--
-- Sie werden ausschliesslich von Triggern aufgerufen und laufen dabei mit den
-- Rechten des Eigentuemers. Ein direktes EXECUTE-Recht braucht niemand.
-- ---------------------------------------------------------------------------
revoke execute on function public.assign_billing_period()      from public, anon, authenticated;
revoke execute on function public.guard_closed_billing_period() from public, anon, authenticated;
revoke execute on function public.guard_member_self_update()    from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Einstellungs-Helfer nur noch intern
--
-- Die RPCs, die sie benutzen, laufen als SECURITY DEFINER mit Eigentuemer-
-- rechten - sie brauchen kein Grant fuer authenticated.
-- ---------------------------------------------------------------------------
revoke execute on function public.setting_int(text)  from public, anon, authenticated;
revoke execute on function public.setting_text(text) from public, anon, authenticated;
revoke execute on function public.setting_time(text) from public, anon, authenticated;
