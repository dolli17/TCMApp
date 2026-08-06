-- ===========================================================================
-- Merkmale: Definitionen pflegen und Werte setzen
--
-- Die Berechtigung ist hier feiner als sonst: Merkmale mit self_editable darf
-- auch das Mitglied selbst setzen - und zwar ebenso fuer die Personen, fuer
-- die es zahlt. Ein Elternteil erteilt damit die Fotoeinwilligung fuers Kind,
-- was der einzige praktikable Weg ist: das Kind hat keinen Login.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Definition anlegen oder aendern
-- ---------------------------------------------------------------------------
create or replace function public.upsert_member_attribute_type(
  p_code           text,
  p_name           text,
  p_description    text,
  p_value_kind     public.attribute_kind default 'list',
  p_multiple       boolean default false,
  p_self_editable  boolean default false,
  p_in_application boolean default false,
  p_active         boolean default true,
  p_sort_order     integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_bisher   public.member_attribute_types;
  v_benutzt  integer;
begin
  if not private.is_admin() then
    raise exception 'Merkmale pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_code), '') !~ '^[a-z0-9_]+$' then
    raise exception 'Der Schluessel darf nur Kleinbuchstaben, Ziffern und Unterstriche enthalten.'
      using errcode = 'invalid_parameter_value';
  end if;

  if length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'Bitte beschreiben, wofuer dieses Merkmal gebraucht wird.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_bisher from public.member_attribute_types where code = btrim(p_code);

  -- Die Art nachtraeglich zu wechseln wuerde die vorhandenen Werte
  -- bedeutungslos machen: aus einer Auswahl wird kein Datum.
  if found and v_bisher.value_kind <> p_value_kind then
    select count(*)::integer into v_benutzt
    from public.member_attribute_values where attribute_type_id = v_bisher.id;

    if v_benutzt > 0 then
      raise exception 'Die Art dieses Merkmals kann nicht mehr geaendert werden, solange % Mitglieder einen Wert dazu haben.',
        v_benutzt using errcode = 'check_violation';
    end if;
  end if;

  insert into public.member_attribute_types
    (code, name, description, value_kind, multiple, self_editable, in_application, active, sort_order)
  values
    (btrim(p_code), btrim(p_name), btrim(p_description), p_value_kind,
     p_multiple, p_self_editable, p_in_application, p_active, p_sort_order)
  on conflict (code) do update set
    name = excluded.name,
    description = excluded.description,
    value_kind = excluded.value_kind,
    multiple = excluded.multiple,
    self_editable = excluded.self_editable,
    in_application = excluded.in_application,
    active = excluded.active,
    sort_order = excluded.sort_order
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.upsert_member_attribute_type(
  text, text, text, public.attribute_kind, boolean, boolean, boolean, boolean, integer)
  from public, anon;
grant execute on function public.upsert_member_attribute_type(
  text, text, text, public.attribute_kind, boolean, boolean, boolean, boolean, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Werteliste setzen
--
-- Bekommt die vollstaendige Liste als jsonb-Array [{value, label}, ...].
-- Optionen, die noch benutzt werden, verschwinden nicht - sie werden
-- stillgelegt. Sonst risse das Loeschen einer Option die Historie der
-- Mitglieder mit, die sie hatten.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_attribute_options(
  p_type_id uuid, p_options jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag jsonb;
  v_pos     integer := 0;
  v_aktiv   integer;
  v_werte   text[] := '{}';
begin
  if not private.is_admin() then
    raise exception 'Merkmale pflegen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.member_attribute_types where id = p_type_id) then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  for v_eintrag in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_pos := v_pos + 1;

    if length(btrim(coalesce(v_eintrag ->> 'value', ''))) = 0 then
      raise exception 'Der %. Eintrag hat keinen Wert.', v_pos
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.member_attribute_options (attribute_type_id, value, label, sort_order, active)
    values (p_type_id, btrim(v_eintrag ->> 'value'),
            coalesce(nullif(btrim(coalesce(v_eintrag ->> 'label', '')), ''),
                     btrim(v_eintrag ->> 'value')),
            v_pos, true)
    on conflict (attribute_type_id, value) do update
      set label = excluded.label, sort_order = excluded.sort_order, active = true;

    v_werte := v_werte || btrim(v_eintrag ->> 'value');
  end loop;

  -- Was nicht mehr in der Liste steht: loeschen, wenn ungenutzt, sonst
  -- stilllegen.
  delete from public.member_attribute_options o
   where o.attribute_type_id = p_type_id
     and not (o.value = any (v_werte))
     and not exists (select 1 from public.member_attribute_values v where v.option_id = o.id);

  update public.member_attribute_options o
     set active = false
   where o.attribute_type_id = p_type_id
     and not (o.value = any (v_werte));

  select count(*)::integer into v_aktiv
  from public.member_attribute_options
  where attribute_type_id = p_type_id and active;

  return v_aktiv;
end;
$$;

revoke execute on function public.set_member_attribute_options(uuid, jsonb) from public, anon;
grant  execute on function public.set_member_attribute_options(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Darf ich dieses Merkmal an dieser Person setzen?
-- ---------------------------------------------------------------------------
create or replace function private.darf_merkmal_setzen(
  p_member_id uuid, p_typ public.member_attribute_types)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
      or (p_typ.self_editable and private.can_view_member(p_member_id));
$$;

-- ---------------------------------------------------------------------------
-- Wert setzen
--
-- Bei value_kind = 'boolean' steht allein die Existenz der Zeile fuer "ja";
-- p_option_value und p_text_value bleiben dann leer. set_at haelt fest, wann
-- die Einwilligung erteilt wurde.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_attribute(
  p_member_id    uuid,
  p_type_code    text,
  p_option_value text default null,
  p_text_value   text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ    public.member_attribute_types;
  v_option uuid;
  v_text   text;
begin
  select * into v_typ from public.member_attribute_types where code = p_type_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not v_typ.active then
    raise exception 'Das Merkmal "%" ist stillgelegt.', v_typ.name
      using errcode = 'check_violation';
  end if;

  if not private.darf_merkmal_setzen(p_member_id, v_typ) then
    raise exception 'Dieses Merkmal kann nur ein Administrator setzen.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Dieses Mitglied gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if v_typ.value_kind = 'boolean' then
    -- Die Zeile selbst ist die Aussage.
    v_text := 'ja';

  elsif v_typ.value_kind = 'list' then
    select o.id into v_option
    from public.member_attribute_options o
    where o.attribute_type_id = v_typ.id
      and o.value = btrim(coalesce(p_option_value, ''))
      and o.active;

    if v_option is null then
      raise exception '"%" ist kein gueltiger Wert fuer %.',
        coalesce(p_option_value, ''), v_typ.name
        using errcode = 'invalid_parameter_value';
    end if;

  else
    v_text := nullif(btrim(coalesce(p_text_value, '')), '');
    if v_text is null then
      raise exception 'Fuer % fehlt der Wert.', v_typ.name
        using errcode = 'invalid_parameter_value';
    end if;

    -- Datum und Zahl vorab pruefen, damit die Meldung das Merkmal nennt und
    -- nicht der Typwandler zuschlaegt.
    begin
      if v_typ.value_kind = 'date'   then perform v_text::date; end if;
      if v_typ.value_kind = 'number' then perform v_text::numeric; end if;
    exception when others then
      raise exception '"%" passt nicht zu %.', v_text, v_typ.name
        using errcode = 'invalid_parameter_value';
    end;
  end if;

  -- Ohne multiple ersetzt der neue Wert den alten.
  if not v_typ.multiple then
    delete from public.member_attribute_values
    where member_id = p_member_id and attribute_type_id = v_typ.id;
  end if;

  insert into public.member_attribute_values
    (member_id, attribute_type_id, option_id, text_value, set_by)
  values (p_member_id, v_typ.id, v_option, v_text, private.current_member_id())
  on conflict do nothing;
end;
$$;

revoke execute on function public.set_member_attribute(uuid, text, text, text) from public, anon;
grant  execute on function public.set_member_attribute(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Wert entfernen
--
-- Bei einer Einwilligung ist das der Widerruf.
-- ---------------------------------------------------------------------------
create or replace function public.remove_member_attribute(
  p_member_id uuid, p_type_code text, p_option_value text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ public.member_attribute_types;
begin
  select * into v_typ from public.member_attribute_types where code = p_type_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  if not private.darf_merkmal_setzen(p_member_id, v_typ) then
    raise exception 'Dieses Merkmal kann nur ein Administrator aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_option_value is null then
    delete from public.member_attribute_values
    where member_id = p_member_id and attribute_type_id = v_typ.id;
  else
    delete from public.member_attribute_values v
    using public.member_attribute_options o
    where v.member_id = p_member_id
      and v.attribute_type_id = v_typ.id
      and o.id = v.option_id
      and o.value = btrim(p_option_value);
  end if;
end;
$$;

revoke execute on function public.remove_member_attribute(uuid, text, text) from public, anon;
grant  execute on function public.remove_member_attribute(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Merkmale eines Mitglieds, fertig zum Anzeigen
--
-- Liefert jede aktive Definition samt dem, was bei diesem Mitglied gesetzt
-- ist - auch die leeren. Die Oberflaeche kann daraus unmittelbar ein Formular
-- bauen, ohne zwei Listen gegeneinander abzugleichen.
-- ---------------------------------------------------------------------------
create or replace function public.member_attributes(p_member_id uuid)
returns table (
  code           text,
  name           text,
  description    text,
  value_kind     public.attribute_kind,
  multiple       boolean,
  self_editable  boolean,
  darf_ich       boolean,
  option_value   text,
  option_label   text,
  text_value     text,
  set_at         timestamptz,
  optionen       jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.code, t.name, t.description, t.value_kind, t.multiple, t.self_editable,
    private.darf_merkmal_setzen(p_member_id, t),
    o.value, o.label, v.text_value, v.set_at,
    (select coalesce(jsonb_agg(jsonb_build_object('value', a.value, 'label', a.label)
                               order by a.sort_order, a.label), '[]'::jsonb)
       from public.member_attribute_options a
      where a.attribute_type_id = t.id and a.active)
  from public.member_attribute_types t
  left join public.member_attribute_values v
         on v.attribute_type_id = t.id and v.member_id = p_member_id
  left join public.member_attribute_options o on o.id = v.option_id
  where t.active
    and (private.is_admin() or private.can_view_member(p_member_id))
  order by t.sort_order, t.name, o.sort_order;
$$;

revoke execute on function public.member_attributes(uuid) from public, anon;
grant  execute on function public.member_attributes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Merkmal loeschen
--
-- Nur solange niemand einen Wert dazu hat - sonst risse das Loeschen die
-- Angaben der betroffenen Mitglieder mit. Fuer alles andere gibt es das
-- Stilllegen ueber active = false.
--
-- Gebraucht wird das vor allem fuer den Fall, den es in jeder Verwaltung gibt:
-- ein Merkmal versehentlich angelegt, falsch benannt, und der Schluessel
-- laesst sich nachtraeglich nicht mehr aendern.
-- ---------------------------------------------------------------------------
create or replace function public.delete_member_attribute_type(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ     public.member_attribute_types;
  v_benutzt integer;
begin
  if not private.is_admin() then
    raise exception 'Merkmale loeschen duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_typ from public.member_attribute_types where code = p_code;
  if not found then
    raise exception 'Dieses Merkmal gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select count(*)::integer into v_benutzt
  from public.member_attribute_values where attribute_type_id = v_typ.id;

  if v_benutzt > 0 then
    raise exception '% Mitglieder haben einen Wert zu "%". Das Merkmal laesst sich deshalb nur stilllegen, nicht loeschen.',
      v_benutzt, v_typ.name using errcode = 'check_violation';
  end if;

  delete from public.member_attribute_types where id = v_typ.id;
end;
$$;

revoke execute on function public.delete_member_attribute_type(text) from public, anon;
grant  execute on function public.delete_member_attribute_type(text) to authenticated;
