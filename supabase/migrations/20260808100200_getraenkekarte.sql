-- ===========================================================================
-- Die Getraenkekarte pflegen
--
-- Bisher gab es Einstellungen zu Getraenken, aber keine einzige Funktion, um
-- die Karte selbst zu aendern: Namen, Beschreibungen und vor allem Preise
-- liessen sich nur direkt in der Datenbank anfassen.
--
-- Auf drink_items und drink_prices gibt es - wie bei courts - ausschliesslich
-- "grant select". Die *_admin_all-Policies laufen ueber PostgREST deshalb ins
-- Leere: die Policy erlaubt die Zeile, aber das fehlende Tabellenrecht
-- verbietet die Anweisung. Alles Schreibende geht ueber diese RPCs.
--
-- Zwei Eigenschaften des Bestands tragen den ganzen Entwurf:
--
--   1. drink_prices ist eine echte Historie mit (drink_item_id, valid_from)
--      und OHNE valid_to - der Zeitraum endet implizit mit der naechsten
--      Zeile. Ein kuenftig datierter Preis greift damit von selbst.
--   2. drink_purchases.unit_price_cents wird beim Buchen kopiert und nie
--      wieder nachgeschlagen. Eine Preisaenderung kann Altbuchungen deshalb
--      technisch gar nicht erreichen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Preise
-- ---------------------------------------------------------------------------

/**
 * Einen Preis setzen - ab heute oder ab einem kuenftigen Tag.
 *
 * Rueckwirkende Preise werden abgewiesen. Sie wuerden keine einzige Buchung
 * aendern (der Preis ist dort eingefroren), sondern nur eine Historie
 * erzeugen, die etwas anderes behauptet als die Belege.
 *
 * Zweimal am selben Tag ist eine Korrektur, kein zweiter Zeitraum - deshalb
 * "on conflict do update" statt einer zusaetzlichen Zeile.
 *
 * Rueckgabe: wie viele nicht stornierte Buchungen dieses Getraenks im offenen
 * Abrechnungszeitraum liegen. Die Oberflaeche macht daraus den Satz, der die
 * Frage des Vorstands beantwortet: "14 Buchungen aus diesem Monat behalten
 * den alten Preis."
 */
create or replace function public.set_drink_price(
  p_item_id uuid, p_price_cents integer, p_valid_from date default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ab date := coalesce(p_valid_from, (now() at time zone 'Europe/Berlin')::date);
  v_name text;
  v_betroffen integer;
begin
  if not private.is_admin() then
    raise exception 'Getraenke koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  select name into v_name from public.drink_items where id = p_item_id;
  if v_name is null then
    raise exception 'Dieses Getraenk gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_ab < (now() at time zone 'Europe/Berlin')::date then
    raise exception
      'Ein Preis kann nicht rueckwirkend gelten. Bereits gebuchte Getraenke behalten ohnehin ihren Preis.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Obergrenze wie bei den Buchungsarten: ein Tippfehler soll nicht als
  -- 300-Euro-Bier in der Karte landen.
  if p_price_cents is null or p_price_cents < 1 or p_price_cents > 10000 then
    raise exception 'Der Preis muss zwischen 0,01 und 100,00 Euro liegen.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.drink_prices (drink_item_id, valid_from, price_cents)
  values (p_item_id, v_ab, p_price_cents)
  on conflict (drink_item_id, valid_from) do update set price_cents = excluded.price_cents;

  select count(*)::integer into v_betroffen
  from public.drink_purchases p
  join public.billing_periods b on b.id = p.billing_period_id
  where p.drink_item_id = p_item_id
    and p.voided_at is null
    and b.status = 'open';

  return v_betroffen;
end; $$;

revoke execute on function public.set_drink_price(uuid, integer, date) from public, anon;
grant  execute on function public.set_drink_price(uuid, integer, date) to authenticated;

/**
 * Einen geplanten Preis zuruecknehmen.
 *
 * Nur fuer kuenftige Zeilen - ein Tippfehler in einer terminierten Erhoehung.
 * Vergangene Preise bleiben stehen: sie sind der Beleg dafuer, was damals
 * gegolten hat.
 */
create or replace function public.remove_drink_price(p_item_id uuid, p_valid_from date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Getraenke koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_valid_from <= (now() at time zone 'Europe/Berlin')::date then
    raise exception
      'Nur ein geplanter Preis laesst sich zuruecknehmen. Vergangene Preise bleiben als Beleg stehen.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.drink_prices
   where drink_item_id = p_item_id and valid_from = p_valid_from;
end; $$;

revoke execute on function public.remove_drink_price(uuid, date) from public, anon;
grant  execute on function public.remove_drink_price(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Karte
-- ---------------------------------------------------------------------------

/**
 * Ein Getraenk anlegen oder aendern.
 *
 * Der Preis ist beim Anlegen Pflicht: drink_menu() blendet Getraenke ohne
 * gueltigen Preis aus, und record_purchase bricht mit "Fuer "%" ist kein Preis
 * hinterlegt." ab. Ein Getraenk ohne Preis waere also unsichtbar und
 * unbuchbar - ein Datensatz, den niemand findet und niemand erklaeren kann.
 *
 * Beim Aendern bedeutet ein leerer Preis "unveraendert"; ein Wert wird an
 * set_drink_price ab heute weitergereicht.
 */
create or replace function public.upsert_drink_item(
  p_id uuid, p_name text, p_description text default null,
  p_category public.drink_category default 'drink',
  p_price_cents integer default null, p_sort_order integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pos integer;
begin
  if not private.is_admin() then
    raise exception 'Getraenke koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Der Name ist Pflicht.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null and p_price_cents is null then
    raise exception 'Ein neues Getraenk braucht einen Preis, sonst taucht es in der Karte nicht auf.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    -- Neue Getraenke landen hinten, damit die bestehende Karte bleibt.
    select coalesce(max(sort_order), 0) + 1 into v_pos from public.drink_items;
    insert into public.drink_items (name, description, category, sort_order)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
            p_category, coalesce(p_sort_order, v_pos))
    returning id into v_id;
  else
    update public.drink_items
       set name = btrim(p_name),
           description = nullif(btrim(coalesce(p_description, '')), ''),
           category = p_category,
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Dieses Getraenk gibt es nicht.' using errcode = 'no_data_found';
    end if;
  end if;

  if p_price_cents is not null then
    perform public.set_drink_price(v_id, p_price_cents, null);
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Ein Getraenk mit diesem Namen gibt es schon.'
    using errcode = 'unique_violation';
end; $$;

revoke execute on function public.upsert_drink_item(
  uuid, text, text, public.drink_category, integer, integer) from public, anon;
grant execute on function public.upsert_drink_item(
  uuid, text, text, public.drink_category, integer, integer) to authenticated;

/**
 * Ein Getraenk stilllegen oder wieder anbieten.
 *
 * Kein Loeschen: drink_purchases verweist mit "on delete restrict" darauf, und
 * die Abrechnungshistorie muss stehen bleiben. Ein stillgelegtes Getraenk
 * verschwindet aus der Karte, seine bisherigen Buchungen bleiben lesbar.
 *
 * Rueckgabe: Buchungen im offenen Zeitraum, die trotzdem noch abgerechnet
 * werden - dieselbe Idee wie bei set_court_active.
 */
create or replace function public.set_drink_item_active(p_id uuid, p_active boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_offen integer;
begin
  if not private.is_admin() then
    raise exception 'Getraenke koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.drink_items set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'Dieses Getraenk gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_offen
  from public.drink_purchases p
  join public.billing_periods b on b.id = p.billing_period_id
  where p.drink_item_id = p_id and p.voided_at is null and b.status = 'open';

  return v_offen;
end; $$;

revoke execute on function public.set_drink_item_active(uuid, boolean) from public, anon;
grant  execute on function public.set_drink_item_active(uuid, boolean) to authenticated;

/** Reihenfolge der Karte: die Liste gibt sie von oben nach unten. */
create or replace function public.reorder_drink_items(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_anzahl integer;
begin
  if not private.is_admin() then
    raise exception 'Getraenke koennen nur Administratoren pflegen.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update public.drink_items d
     set sort_order = x.ord
  from (select id, ord from unnest(p_ids) with ordinality as t(id, ord)) x
  where d.id = x.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end; $$;

revoke execute on function public.reorder_drink_items(uuid[]) from public, anon;
grant  execute on function public.reorder_drink_items(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Uebersicht
-- ---------------------------------------------------------------------------

/**
 * Die Karte fuer die Verwaltungsseite.
 *
 * Der geplante Preis gehoert dazu: ohne ihn ist eine terminierte Erhoehung bis
 * zu ihrem Stichtag unsichtbar - und wird ein zweites Mal eingetragen.
 */
create or replace function public.drink_item_overview()
returns table (
  id uuid, name text, description text, category public.drink_category,
  sort_order integer, active boolean,
  price_cents integer, price_valid_from date,
  naechster_preis_cents integer, naechster_preis_ab date,
  buchungen integer, buchungen_offen integer
)
language sql stable security definer set search_path = '' as $$
  select
    d.id, d.name, d.description, d.category, d.sort_order, d.active,
    aktuell.price_cents, aktuell.valid_from,
    geplant.price_cents, geplant.valid_from,
    (select count(*)::integer from public.drink_purchases p
      where p.drink_item_id = d.id and p.voided_at is null),
    (select count(*)::integer from public.drink_purchases p
      join public.billing_periods b on b.id = p.billing_period_id
      where p.drink_item_id = d.id and p.voided_at is null and b.status = 'open')
  from public.drink_items d
  left join lateral (
    select pr.price_cents, pr.valid_from from public.drink_prices pr
    where pr.drink_item_id = d.id
      and pr.valid_from <= (now() at time zone 'Europe/Berlin')::date
    order by pr.valid_from desc limit 1
  ) aktuell on true
  left join lateral (
    select pr.price_cents, pr.valid_from from public.drink_prices pr
    where pr.drink_item_id = d.id
      and pr.valid_from > (now() at time zone 'Europe/Berlin')::date
    order by pr.valid_from limit 1
  ) geplant on true
  where private.is_admin()
  order by d.sort_order, d.name;
$$;

revoke execute on function public.drink_item_overview() from public, anon;
grant  execute on function public.drink_item_overview() to authenticated;

/**
 * Die Preishistorie eines Getraenks.
 *
 * Die einzige Stelle, an der sich nachvollziehen laesst, dass eine Erhoehung
 * die Vergangenheit nicht angefasst hat.
 */
create or replace function public.drink_price_history(p_item_id uuid)
returns table (valid_from date, price_cents integer, ist_aktuell boolean, geplant boolean)
language sql stable security definer set search_path = '' as $$
  with heute as (select (now() at time zone 'Europe/Berlin')::date as tag)
  select
    pr.valid_from,
    pr.price_cents,
    pr.valid_from = (
      select max(x.valid_from) from public.drink_prices x
      where x.drink_item_id = p_item_id and x.valid_from <= (select tag from heute)
    ),
    pr.valid_from > (select tag from heute)
  from public.drink_prices pr
  where pr.drink_item_id = p_item_id and private.is_admin()
  order by pr.valid_from desc
  limit 10;
$$;

revoke execute on function public.drink_price_history(uuid) from public, anon;
grant  execute on function public.drink_price_history(uuid) to authenticated;
