/**
 * Eine Einstellung setzen.
 *
 * Der Wert kommt als Text aus dem Formular und wird hier gemaess value_type
 * geprueft und nach jsonb umgewandelt. Absicht: die Pruefung liegt an einer
 * Stelle, nicht in jeder Oberflaeche neu - eine Schliesszeit "25:00" darf gar
 * nicht erst in der Tabelle landen.
 */
create or replace function public.set_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_typ text; v_wert jsonb;
begin
  if not private.is_admin() then
    raise exception 'Einstellungen aendern duerfen nur Administratoren.'
      using errcode = 'insufficient_privilege';
  end if;

  select value_type into v_typ from public.settings where key = p_key;
  if not found then
    raise exception 'Unbekannte Einstellung: %', p_key using errcode = 'no_data_found';
  end if;

  begin
    v_wert := case v_typ
      when 'integer' then to_jsonb(p_value::integer)
      when 'boolean' then to_jsonb(p_value::boolean)
      when 'time'    then to_jsonb(to_char(p_value::time, 'HH24:MI'))
      when 'date'    then to_jsonb(to_char(p_value::date, 'YYYY-MM-DD'))
      else to_jsonb(p_value)
    end;
  exception when others then
    raise exception '"%" ist kein gueltiger Wert fuer %.', p_value, p_key
      using errcode = 'invalid_parameter_value';
  end;

  if v_typ = 'integer' and (v_wert #>> '{}')::integer < 0 then
    raise exception 'Negative Werte sind hier nicht sinnvoll.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.settings
     set value = v_wert, updated_at = now(), updated_by = private.current_member_id()
   where key = p_key;
end; $$;

revoke execute on function public.set_setting(text, text) from public, anon;
grant  execute on function public.set_setting(text, text) to authenticated;
