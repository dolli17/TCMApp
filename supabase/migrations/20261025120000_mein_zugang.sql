-- ===========================================================================
-- Kein Zugang mehr (B22)
--
-- Seit S12 liefert die Datenbank archivierten, gesperrten und ausgetretenen
-- Mitgliedern nichts mehr (private.hat_zugang). Die Anmeldung gelingt aber
-- weiter, und danach sind alle Seiten leer. Web und App fragen deshalb nach
-- der Anmeldung und bei jeder bestehenden Sitzung public.mein_zugang() und
-- zeigen statt leerer Seiten einen Hinweis, dann melden sie ab.
--
-- Eine Zeile, immer:
--
--   zugang            private.hat_zugang des eigenen Mitglieds. Ohne Mitglied
--                     (Kiosk-Geraet) true: dort entscheidet is_kiosk(), und
--                     das bleibt, wie es war.
--   grund             nur ohne Zugang: 'archiviert', 'gesperrt',
--                     'ausgetreten' (Austrittsdatum vorbei) oder 'unbekannt'.
--                     Die Oberflaeche nennt danach einen Satz; bei
--                     'unbekannt' bleibt er allgemein.
--   onboarding_offen  Mitglied mit Zugang, dessen Onboarding noch offen ist.
--                     Das lasen Web-Middleware und App bisher selbst aus
--                     members; ohne Zugang liefert members nichts mehr, und so
--                     reicht ein Aufruf fuer beide Weichen.
--
-- Ein Austritt in der Zukunft aendert nichts: hat_zugang gilt bis
-- einschliesslich zum Austrittsdatum, die Sperre greift ab dem Tag danach.
--
-- Die Funktion liest das Mitglied am Zugang vorbei (security definer), aber
-- nur das eigene und nur diese drei Angaben.
--
-- Abwaertskompatibel: neue Funktion, nichts Bestehendes aendert sich.
-- ===========================================================================

create or replace function public.mein_zugang()
returns table (zugang boolean, grund text, onboarding_offen boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.members;
begin
  select * into v_m from public.members where auth_user_id = (select auth.uid());

  if not found then
    return query select true, null::text, false;
    return;
  end if;

  if private.hat_zugang(v_m) then
    return query select true, null::text, v_m.onboarding_completed_at is null;
    return;
  end if;

  return query select false,
    case
      when v_m.status = 'archived' then 'archiviert'
      when v_m.login_disabled_at is not null then 'gesperrt'
      when exists (select 1 from public.memberships ms
                    where ms.member_id = v_m.id and ms.ended_on < private.heute()) then 'ausgetreten'
      else 'unbekannt'
    end,
    false;
end;
$$;

comment on function public.mein_zugang() is
  'Hat das eigene Konto noch Zugang (private.hat_zugang), und wenn nicht, warum; dazu, ob das Onboarding offen ist. '
  'Ohne Mitglied (Kiosk) Zugang. Grundlage der Weichen in Web-Middleware und App (B22).';

revoke execute on function public.mein_zugang() from public, anon;
grant  execute on function public.mein_zugang() to authenticated;
