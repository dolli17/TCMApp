-- ===========================================================================
-- IBAN-Pruefziffer nach ISO 13616 / DIN 91095
--
-- Wird an zwei Stellen gebraucht: der Seed erzeugt damit synthetische, aber
-- formal gueltige IBANs, und die Eingabemaske prueft damit Tippfehler, bevor
-- eine Lastschrift daran scheitert.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Buchstaben zu Zahlen: A = 10, B = 11, ... Z = 35
-- ---------------------------------------------------------------------------
create or replace function public.iban_to_numeric(p_text text)
returns text
language sql
immutable
as $$
  select string_agg(
    case
      when ch between '0' and '9' then ch
      else (ascii(ch) - ascii('A') + 10)::text
    end, ''
  )
  from unnest(string_to_array(upper(p_text), null)) as ch;
$$;

-- ---------------------------------------------------------------------------
-- Modulo 97 stueckweise, weil die Zahl fuer bigint zu gross wird
-- ---------------------------------------------------------------------------
create or replace function public.mod97(p_digits text)
returns integer
language plpgsql
immutable
as $$
declare
  v_rest integer := 0;
  i      integer;
begin
  for i in 1 .. length(p_digits) loop
    v_rest := (v_rest * 10 + substr(p_digits, i, 1)::integer) % 97;
  end loop;
  return v_rest;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pruefziffern zu einer BBAN berechnen
-- ---------------------------------------------------------------------------
create or replace function public.iban_check_digits(
  p_bban    text,
  p_country text default 'DE'
)
returns text
language sql
immutable
as $$
  select lpad(
    (98 - public.mod97(
      public.iban_to_numeric(p_bban || p_country || '00')
    ))::text, 2, '0');
$$;

-- ---------------------------------------------------------------------------
-- Ist diese IBAN formal gueltig?
-- ---------------------------------------------------------------------------
create or replace function public.iban_is_valid(p_iban text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_clean text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if v_clean !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then
    return false;
  end if;

  -- Die ersten vier Zeichen ans Ende, dann muss der Rest mod 97 gleich 1 sein.
  return public.mod97(
    public.iban_to_numeric(substr(v_clean, 5) || substr(v_clean, 1, 4))
  ) = 1;
end;
$$;

comment on function public.iban_is_valid(text) is
  'Prueft Laenge und Pruefziffer. Sagt nichts darueber aus, ob das Konto existiert.';

revoke execute on function public.iban_to_numeric(text)         from public, anon;
revoke execute on function public.mod97(text)                   from public, anon;
revoke execute on function public.iban_check_digits(text, text) from public, anon;
revoke execute on function public.iban_is_valid(text)           from public, anon;
grant  execute on function public.iban_is_valid(text)           to authenticated;
