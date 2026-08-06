-- ===========================================================================
-- Aenderungsprotokoll
--
-- Mitglieder duerfen ihre Daten selbst pflegen. Damit der Vorstand trotzdem
-- weiss, wer wann was geaendert hat, laeuft jede Aenderung durch einen
-- generischen Trigger - Selbstpflege, Admin-Aenderung, Import und jeder
-- kuenftige Codepfad gleichermassen. Ein Protokoll, an das jemand denken muss,
-- ist kein Protokoll.
--
-- Zwei bewusste Entscheidungen:
--
-- 1. member_id und row_id sind KEINE Fremdschluessel. Das Protokoll soll das
--    Loeschen des Mitglieds ueberleben - ein FK wuerde den Eintrag beim
--    Loeschen entweder mitreissen oder das Loeschen selbst blockieren.
--
-- 2. Beim Loeschen wird NICHT der ganze Datensatz konserviert, sondern nur die
--    Kennfelder aus dem dritten Trigger-Argument. Sonst waere jedes Loeschen
--    in Wahrheit ein Umzug der Daten in eine zweite Tabelle - genau das
--    Gegenteil dessen, was ein Loeschen leisten soll.
-- ===========================================================================

create table public.change_log (
  id              bigint generated always as identity primary key,
  table_name      text not null,
  -- Null bei Tabellen mit zusammengesetztem Schluessel (member_roles, member_fees).
  row_id          uuid,
  member_id       uuid,
  action          text not null,
  diff            jsonb not null,
  changed_by      uuid references public.members (id) on delete set null,
  changed_by_auth uuid,
  changed_at      timestamptz not null default now(),

  constraint change_log_action_known check (action in ('insert', 'update', 'delete'))
);

comment on table public.change_log is
  'Anhaengetabelle. Wird ausschliesslich vom Trigger private.log_change '
  'geschrieben; authenticated hat kein Schreibrecht, das Protokoll ist damit '
  'nicht faelschbar.';

comment on column public.change_log.member_id is
  'Betroffenes Mitglied, ohne Fremdschluessel - der Eintrag ueberlebt das '
  'Loeschen der Person.';

comment on column public.change_log.diff is
  'Format {"feld": {"alt": …, "neu": …}}. Beim Loeschen zusaetzlich '
  '"_aktion": "geloescht".';

-- bigint identity statt uuid: reine Anhaengetabelle, die schnell waechst. Ein
-- monoton wachsender Schluessel haelt den Index kompakt und die Eintraege in
-- der Reihenfolge, in der sie entstanden sind.

create index change_log_member_idx on public.change_log (member_id, changed_at desc);
create index change_log_row_idx    on public.change_log (table_name, row_id, changed_at desc);
create index change_log_by_idx     on public.change_log (changed_by);

-- ---------------------------------------------------------------------------
-- Der Trigger
--
-- Argumente:
--   TG_ARGV[0]  Spalte, aus der member_id gelesen wird ('id' bei members)
--   TG_ARGV[1]  Spalten, die nie protokolliert werden (kommagetrennt)
--   TG_ARGV[2]  Kennfelder, die beim Loeschen erhalten bleiben (kommagetrennt)
-- ---------------------------------------------------------------------------
create or replace function private.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alt  jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_neu  jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_aus  text[] := case when TG_NARGS > 1 and TG_ARGV[1] <> ''
                        then string_to_array(TG_ARGV[1], ',') else '{}'::text[] end;
  v_kenn text[] := case when TG_NARGS > 2 and TG_ARGV[2] <> ''
                        then string_to_array(TG_ARGV[2], ',') else '{}'::text[] end;
  v_diff jsonb := '{}'::jsonb;
  v_feld text;
begin
  -- Beim Loeschen bleibt nur uebrig, was ausdruecklich als Kennfeld benannt
  -- ist - genug, um nachzuvollziehen wen es traf, zu wenig, um die Person
  -- daraus wiederherzustellen.
  if TG_OP = 'DELETE' then
    v_alt := coalesce(
      (select jsonb_object_agg(k, v_alt -> k) from unnest(v_kenn) as k where v_alt ? k),
      '{}'::jsonb);
  end if;

  for v_feld in select jsonb_object_keys(v_alt || v_neu) loop
    if v_feld = any (v_aus) then continue; end if;
    if v_alt -> v_feld is distinct from v_neu -> v_feld then
      v_diff := v_diff || jsonb_build_object(
        v_feld, jsonb_build_object('alt', v_alt -> v_feld, 'neu', v_neu -> v_feld));
    end if;
  end loop;

  if TG_OP = 'DELETE' then
    v_diff := v_diff || jsonb_build_object('_aktion', to_jsonb('geloescht'::text));
  elsif v_diff = '{}'::jsonb then
    -- Nichts Protokollierbares geaendert. Ohne diesen Ausstieg wuerde jeder
    -- Lauf des moddatetime-Triggers einen leeren Eintrag erzeugen.
    return null;
  end if;

  insert into public.change_log
    (table_name, row_id, member_id, action, diff, changed_by, changed_by_auth)
  values (
    TG_TABLE_NAME,
    nullif(coalesce(v_neu ->> 'id', to_jsonb(old) ->> 'id'), '')::uuid,
    nullif(coalesce(v_neu ->> TG_ARGV[0], to_jsonb(old) ->> TG_ARGV[0]), '')::uuid,
    lower(TG_OP),
    v_diff,
    (select private.current_member_id()),
    (select auth.uid())
  );

  return null;
end;
$$;

comment on function private.log_change() is
  'Generischer Diff-Trigger. Erfasst Selbstpflege, Admin-Aenderungen und '
  'Import gleichermassen, weil er an der Tabelle haengt und nicht am Codepfad.';

-- ---------------------------------------------------------------------------
-- Trigger je Tabelle
--
-- Bei bank_accounts ist der Ausschluss von iban_encrypted Pflicht: sonst laege
-- der Chiffretext in einer zweiten Tabelle mit anderen Policies.
-- ---------------------------------------------------------------------------
create trigger members_log_change
  after insert or update or delete on public.members
  for each row execute function private.log_change('id', 'updated_at,legacy_data', 'first_name,last_name');

create trigger memberships_log_change
  after insert or update or delete on public.memberships
  for each row execute function private.log_change('member_id', 'updated_at,legacy_data', 'number');

create trigger member_roles_log_change
  after insert or update or delete on public.member_roles
  for each row execute function private.log_change('member_id', '', 'role');

create trigger member_fees_log_change
  after insert or update or delete on public.member_fees
  for each row execute function private.log_change('member_id', '', 'fee_type_id,year');

create trigger bank_accounts_log_change
  after insert or update or delete on public.bank_accounts
  for each row execute function private.log_change('member_id', 'updated_at,iban_encrypted', 'iban_last4');

create trigger sepa_mandates_log_change
  after insert or update or delete on public.sepa_mandates
  for each row execute function private.log_change('member_id', 'updated_at', 'reference');

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
alter table public.change_log enable row level security;

create policy change_log_admin_all on public.change_log
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy change_log_own_select on public.change_log
  for select to authenticated
  using (member_id = (select private.current_member_id()));

-- Nur lesen. Geschrieben wird ausschliesslich vom Definer-Trigger.
grant select on public.change_log to authenticated;

-- ---------------------------------------------------------------------------
-- Aufbewahrung
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, value_type, label, description) values
  ('privacy.change_log_days', '1095'::jsonb, 'integer',
   'Aufbewahrung des Aenderungsprotokolls in Tagen',
   'Aeltere Eintraege werden beim Aufraeumlauf entfernt. 1095 Tage sind drei Jahre.')
on conflict (key) do nothing;
