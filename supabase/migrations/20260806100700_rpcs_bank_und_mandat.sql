-- ===========================================================================
-- Bankverbindungen und SEPA-Mandate am Mitglied
--
-- Bisher liessen sich beide nur per SQL anlegen. Das ist die Luecke, die den
-- Beitragslauf blockiert: ohne Mandat erscheint ein Mitglied nicht in der
-- Lastschriftdatei, und der Kassenwart kann nichts daran aendern.
--
-- Die IBAN bleibt dabei, was sie ist - das sensibelste Datum im System. Sie
-- geht verschluesselt hinein und kommt nie wieder heraus: gespeichert wird
-- der Chiffretext, angezeigt werden vier Ziffern. Diese Funktionen sind der
-- einzige Weg hinein, und keine von ihnen gibt einen Klartext zurueck.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fingerabdruck der IBAN
--
-- pgp_sym_encrypt ist nicht deterministisch: dieselbe IBAN ergibt jedes Mal
-- einen anderen Chiffretext. Ohne einen stabilen Abgleichwert liesse sich
-- deshalb nicht erkennen, ob eine Bankverbindung schon erfasst ist - und der
-- Kassenwart legt sie beim zweiten Mal einfach nochmal an.
--
-- Der Fingerabdruck ist ein HMAC mit demselben Vault-Schluessel. Ohne den
-- Schluessel laesst sich daraus keine IBAN zurueckrechnen; ein blosser Hash
-- waere angreifbar, weil der Raum moeglicher IBANs klein genug ist, um ihn
-- durchzuprobieren.
-- ---------------------------------------------------------------------------
create or replace function private.fingerprint_iban(p_iban text)
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'iban_encryption_key';

  if v_key is null then
    raise exception 'Vault-Secret "iban_encryption_key" fehlt.'
      using errcode = 'no_data_found';
  end if;

  return extensions.hmac(upper(replace(p_iban, ' ', '')), v_key, 'sha256');
end;
$$;

alter table public.bank_accounts add column if not exists iban_fingerprint bytea;

comment on column public.bank_accounts.iban_fingerprint is
  'HMAC der IBAN, um Dubletten zu erkennen. Der Chiffretext taugt dafuer '
  'nicht - er ist bei jeder Verschluesselung ein anderer.';

-- Nur je Mitglied eindeutig: 76 Mitglieder teilen sich Familienkonten, das
-- soll weiterhin gehen.
create unique index if not exists bank_accounts_iban_fingerprint_unique
  on public.bank_accounts (member_id, iban_fingerprint)
  where (iban_fingerprint is not null);

-- Der Spalten-Grant fuer authenticated darf den Fingerabdruck nicht
-- einschliessen: mit ihm liesse sich pruefen, ob eine geratene IBAN zu einem
-- Mitglied gehoert.
revoke all (iban_fingerprint) on public.bank_accounts from authenticated;

-- Bestehende Konten nachtragen. Ohne diesen Schritt griffe die
-- Dublettenerkennung nur fuer neu erfasste Verbindungen - und gerade der
-- eBuSy-Bestand ist der, in dem Dubletten stecken koennen.
--
-- Laeuft nur, wenn der Vault-Schluessel bereitsteht; auf einer frisch
-- aufgesetzten Datenbank ohne Bankdaten gibt es ohnehin nichts zu tun.
do $$
begin
  if exists (select 1 from public.bank_accounts where iban_fingerprint is null)
     and exists (select 1 from vault.decrypted_secrets where name = 'iban_encryption_key')
  then
    update public.bank_accounts
       set iban_fingerprint = private.fingerprint_iban(private.decrypt_iban(iban_encrypted))
     where iban_fingerprint is null;
  end if;
exception when others then
  -- Ein fehlgeschlagener Nachtrag darf die Migration nicht aufhalten: die
  -- Spalte bleibt dann leer, und nur die Dublettenpruefung ist fuer diese
  -- Altbestaende nicht scharf.
  raise warning 'Fingerabdruecke konnten nicht nachgetragen werden: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Bankverbindung anlegen
-- ---------------------------------------------------------------------------
create or replace function public.add_bank_account(
  p_member_id uuid,
  p_iban      text,
  p_holder    text default null,
  p_bank_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_iban   text;
  v_m      public.members;
  v_id     uuid;
  v_finger bytea;
begin
  if not private.is_admin() then
    raise exception 'Bankverbindungen pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.members where id = p_member_id;
  if not found then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  v_iban := upper(replace(btrim(coalesce(p_iban, '')), ' ', ''));

  if not public.iban_is_valid(v_iban) then
    raise exception 'Diese IBAN ist nicht gueltig. Bitte die Ziffern pruefen.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_finger := private.fingerprint_iban(v_iban);

  if exists (select 1 from public.bank_accounts
              where member_id = p_member_id and iban_fingerprint = v_finger) then
    raise exception 'Diese Bankverbindung ist bei diesem Mitglied bereits erfasst.'
      using errcode = 'unique_violation';
  end if;

  insert into public.bank_accounts
    (member_id, iban_encrypted, iban_fingerprint, iban_last4, holder, bank_name)
  values (
    p_member_id,
    private.encrypt_iban(v_iban),
    v_finger,
    right(v_iban, 4),
    coalesce(nullif(btrim(coalesce(p_holder, '')), ''), v_m.first_name || ' ' || v_m.last_name),
    nullif(btrim(coalesce(p_bank_name, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_bank_account(uuid, text, text, text) from public, anon;
grant  execute on function public.add_bank_account(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bankverbindung stilllegen
--
-- Geloescht wird sie nicht: an ihr haengen Mandate, und an denen haengen
-- Positionen aus Lastschriftlaeufen. Die Buchhaltung muss nachvollziehbar
-- bleiben.
-- ---------------------------------------------------------------------------
create or replace function public.deactivate_bank_account(p_bank_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Bankverbindungen pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.bank_accounts where id = p_bank_account_id) then
    raise exception 'Diese Bankverbindung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.sepa_mandates
  where bank_account_id = p_bank_account_id and status = 'active';

  if v_offen > 0 then
    raise exception 'An dieser Bankverbindung haengt noch ein aktives Mandat. Bitte zuerst widerrufen.'
      using errcode = 'check_violation';
  end if;

  update public.bank_accounts set active = false where id = p_bank_account_id;
end;
$$;

revoke execute on function public.deactivate_bank_account(uuid) from public, anon;
grant  execute on function public.deactivate_bank_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mandatsreferenz
--
-- Form: TCM-<Mitgliedsnummer>-<Jahr>, bei Bedarf mit laufendem Zusatz. Die
-- 375 Bestandsmandate aus eBuSy behalten dagegen ihre Referenz unveraendert -
-- sie neu zu vergeben wuerde bedeuten, dass alle neu unterschreiben muessen.
-- ---------------------------------------------------------------------------
create or replace function private.next_mandate_reference(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nummer text;
  v_basis  text;
  v_kandidat text;
  v_lauf   integer := 1;
begin
  select s.number into v_nummer
  from public.memberships s
  where s.member_id = p_member_id
  order by (s.ended_on is null) desc, s.started_on desc
  limit 1;

  v_basis := 'TCM-' || coalesce(v_nummer, substr(p_member_id::text, 1, 8))
             || '-' || to_char(current_date, 'YYYY');
  v_kandidat := v_basis;

  while exists (select 1 from public.sepa_mandates where reference = v_kandidat) loop
    v_lauf := v_lauf + 1;
    v_kandidat := v_basis || '-' || v_lauf;
  end loop;

  return v_kandidat;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mandat erteilen
-- ---------------------------------------------------------------------------
create or replace function public.create_sepa_mandate(
  p_member_id       uuid,
  p_bank_account_id uuid,
  p_reference       text default null,
  p_signed_on       date default null,
  p_scope           public.mandate_scope default 'fees_only')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_konto     public.bank_accounts;
  v_referenz  text;
  v_signed    date := coalesce(p_signed_on, current_date);
begin
  if not private.is_admin() then
    raise exception 'Mandate erteilen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_konto from public.bank_accounts where id = p_bank_account_id;
  if not found then
    raise exception 'Diese Bankverbindung gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_konto.member_id <> p_member_id then
    raise exception 'Diese Bankverbindung gehoert zu einem anderen Mitglied.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not v_konto.active then
    raise exception 'Diese Bankverbindung ist stillgelegt.'
      using errcode = 'check_violation';
  end if;

  if v_signed > current_date then
    raise exception 'Ein Mandat kann nicht in der Zukunft unterschrieben worden sein.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Zwei aktive Mandate mit gleichem Umfang waeren fuer den Beitragslauf
  -- nicht zu unterscheiden.
  if exists (select 1 from public.sepa_mandates
              where member_id = p_member_id and status = 'active' and scope = p_scope) then
    raise exception 'Fuer diesen Zweck besteht bereits ein aktives Mandat. Bitte zuerst widerrufen.'
      using errcode = 'check_violation';
  end if;

  v_referenz := coalesce(nullif(btrim(coalesce(p_reference, '')), ''),
                         private.next_mandate_reference(p_member_id));

  insert into public.sepa_mandates
    (member_id, bank_account_id, reference, signed_on, scope, sequence_type, status)
  values (p_member_id, p_bank_account_id, v_referenz, v_signed, p_scope, 'FRST', 'active');

  return v_referenz;
end;
$$;

revoke execute on function public.create_sepa_mandate(
  uuid, uuid, text, date, public.mandate_scope) from public, anon;
grant execute on function public.create_sepa_mandate(
  uuid, uuid, text, date, public.mandate_scope) to authenticated;

-- ---------------------------------------------------------------------------
-- Mandat widerrufen
-- ---------------------------------------------------------------------------
create or replace function public.revoke_sepa_mandate(
  p_mandate_id uuid, p_revoked_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Mandate widerrufen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.sepa_mandates where id = p_mandate_id) then
    raise exception 'Dieses Mandat gibt es nicht.' using errcode = 'no_data_found';
  end if;

  -- Ein Mandat, mit dem gerade eingezogen wird, darf nicht verschwinden -
  -- sonst steht in der Lastschriftdatei eine Referenz ohne Grundlage.
  select count(*)::integer into v_offen
  from public.debit_items
  where mandate_id = p_mandate_id and result = 'pending';

  if v_offen > 0 then
    raise exception 'Dieses Mandat steckt in einem noch nicht abgeschlossenen Lastschriftlauf.'
      using errcode = 'check_violation';
  end if;

  update public.sepa_mandates
     set status = 'revoked', revoked_on = coalesce(p_revoked_on, current_date)
   where id = p_mandate_id;
end;
$$;

revoke execute on function public.revoke_sepa_mandate(uuid, date) from public, anon;
grant  execute on function public.revoke_sepa_mandate(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Finanzen eines Mitglieds, fertig zum Anzeigen
--
-- Bewusst eine eigene Funktion statt eines Selects in der Oberflaeche: auf
-- bank_accounts darf dort kein "select *" laufen, weil iban_encrypted nicht
-- herausgegeben wird. Hier steht ein fuer alle Mal, welche Spalten die
-- Oberflaeche sieht.
-- ---------------------------------------------------------------------------
create or replace function public.member_finances(p_member_id uuid)
returns table (
  bank_account_id  uuid,
  iban_last4       text,
  holder           text,
  bank_name        text,
  konto_aktiv      boolean,
  mandate_id       uuid,
  reference        text,
  signed_on        date,
  last_used_on     date,
  scope            public.mandate_scope,
  sequence_type    public.mandate_sequence,
  mandat_status    public.mandate_status,
  revoked_on       date,
  reference_conflict boolean,
  im_einzug        boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    k.id, k.iban_last4, k.holder, k.bank_name, k.active,
    m.id, m.reference, m.signed_on, m.last_used_on, m.scope, m.sequence_type,
    m.status, m.revoked_on, m.reference_conflict,
    exists (select 1 from public.debit_items d
             where d.mandate_id = m.id and d.result = 'pending')
  from public.bank_accounts k
  left join public.sepa_mandates m on m.bank_account_id = k.id
  where k.member_id = p_member_id
    and (private.is_admin() or private.can_view_member(p_member_id))
  order by k.active desc, k.created_at desc, m.signed_on desc;
$$;

revoke execute on function public.member_finances(uuid) from public, anon;
grant  execute on function public.member_finances(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Beitragsarten eines Mitglieds, mit Preis
--
-- Der Preis steht jahresweise in fee_prices; ein Sonderbetrag am Mitglied
-- ueberschreibt ihn. Beides zusammenzufuehren gehoert in die Datenbank und
-- nicht in die Oberflaeche - der Beitragslauf rechnet genauso.
-- ---------------------------------------------------------------------------
create or replace function public.member_fee_overview(p_member_id uuid, p_year integer)
returns table (
  fee_type_id  uuid,
  code         text,
  name         text,
  zugeordnet   boolean,
  override_amount_cents integer,
  note         text,
  preis_cents  integer,
  effektiv_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.code, t.name,
    f.member_id is not null,
    f.override_amount_cents,
    f.note,
    p.amount_cents,
    coalesce(f.override_amount_cents, p.amount_cents)
  from public.fee_types t
  left join public.member_fees f
         on f.fee_type_id = t.id and f.member_id = p_member_id and f.year = p_year
  left join lateral (
    select pr.amount_cents
    from public.fee_prices pr
    where pr.fee_type_id = t.id and pr.valid_from_year <= p_year
    order by pr.valid_from_year desc
    limit 1
  ) p on true
  where private.is_admin()
    and (t.active or f.member_id is not null)
  order by t.sort_order, t.name;
$$;

revoke execute on function public.member_fee_overview(uuid, integer) from public, anon;
grant  execute on function public.member_fee_overview(uuid, integer) to authenticated;
