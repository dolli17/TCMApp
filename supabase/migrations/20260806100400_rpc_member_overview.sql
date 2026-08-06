-- ===========================================================================
-- Mitgliederliste in einem Zug
--
-- Die Liste holte ihre Daten bisher ueber verschachtelte PostgREST-Selects:
-- members mit memberships und member_roles als Unterabfragen. Bei 400
-- Mitgliedern dauerte das drei bis elf Sekunden - fuer die Seite, die der
-- Vorstand am haeufigsten oeffnet.
--
-- Diese Funktion macht dieselbe Arbeit in einer Abfrage: die Mitgliedschaft
-- ueber "distinct on" statt als Unterabfrage, die Rollen als Aggregat, und die
-- Filterung passiert in der Datenbank statt im Anwendungscode.
--
-- Sichtbarkeit: die Funktion ist "security definer" und ersetzt damit die
-- RLS-Pruefung durch eine ausdrueckliche Admin-Pruefung. Das ist hier richtig,
-- weil die Liste ohnehin nur Administratoren offensteht.
-- ===========================================================================

create or replace function public.member_overview(
  p_filter text default 'aktiv',
  p_query  text default null,
  p_limit  integer default 500)
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  email          text,
  birthday       date,
  status         public.member_status,
  is_trainer     boolean,
  has_login      boolean,
  is_admin       boolean,
  is_paid_by     boolean,
  number         text,
  started_on     date,
  ended_on       date
)
language sql
stable
security definer
set search_path = ''
as $$
  with sichtbar as (
    select m.*
    from public.members m
    where private.is_admin()
      and case p_filter
            when 'aktiv'       then m.status = 'active'
            when 'archiviert'  then m.status = 'archived'
            when 'ohne-login'  then m.auth_user_id is null and m.status <> 'archived'
            when 'trainer'     then m.is_trainer
            when 'admins'      then exists (select 1 from public.member_roles r
                                             where r.member_id = m.id and r.role = 'admin')
            else true
          end
      and (
        p_query is null or btrim(p_query) = ''
        or m.first_name ilike '%' || btrim(p_query) || '%'
        or m.last_name  ilike '%' || btrim(p_query) || '%'
        or (m.first_name || ' ' || m.last_name) ilike '%' || btrim(p_query) || '%'
        or (m.last_name || ' ' || m.first_name) ilike '%' || btrim(p_query) || '%'
      )
  ),
  -- Die laufende Mitgliedschaft, sonst die zuletzt beendete. "distinct on"
  -- liefert genau eine Zeile je Mitglied, ohne Unterabfrage je Zeile.
  aktuelle as (
    select distinct on (s.member_id)
           s.member_id, s.number, s.started_on, s.ended_on
    from public.memberships s
    where s.member_id in (select id from sichtbar)
    order by s.member_id, (s.ended_on is null) desc, s.started_on desc
  )
  select
    m.id, m.first_name, m.last_name, m.email::text, m.birthday, m.status,
    m.is_trainer,
    m.auth_user_id is not null,
    exists (select 1 from public.member_roles r
             where r.member_id = m.id and r.role = 'admin'),
    m.billing_payer_id is not null,
    a.number, a.started_on, a.ended_on
  from sichtbar m
  left join aktuelle a on a.member_id = m.id
  order by lower(m.last_name), lower(m.first_name)
  limit least(coalesce(p_limit, 500), 1000);
$$;

comment on function public.member_overview(text, text, integer) is
  'Mitgliederliste fuer das Admin-Dashboard, fertig gefiltert und sortiert. '
  'Der Suchbegriff wird als Parameter uebergeben und nicht in einen '
  'Filterausdruck eingesetzt - Sonderzeichen koennen ihn deshalb nicht zerlegen.';

revoke execute on function public.member_overview(text, text, integer) from public, anon;
grant  execute on function public.member_overview(text, text, integer) to authenticated;

-- Die Suche laeuft ueber ilike auf beiden Namensspalten. Der vorhandene Index
-- members_last_name_idx greift dabei nicht (fuehrendes Platzhalterzeichen),
-- deshalb zwei Trigramm-Indizes.
create extension if not exists pg_trgm with schema extensions;

create index if not exists members_last_name_trgm_idx
  on public.members using gin (last_name extensions.gin_trgm_ops);
create index if not exists members_first_name_trgm_idx
  on public.members using gin (first_name extensions.gin_trgm_ops);
