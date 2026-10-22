-- ===========================================================================
-- Umlaute in Texten aus der Datenbank (U21, O13)
--
--   1. Kein Text in einer Funktion (Meldung, Benachrichtigung, Forderung,
--      Grund) schreibt ae/oe/ue/ss statt Umlaut oder ß. Gesucht werden die
--      Woerter, die es bis zu dieser Migration gab, ausserhalb von
--      Kommentaren. Codes und Schluessel (etwa 'geloescht' im Protokoll oder
--      'minderjaehrig' in my_onboarding) bleiben, wie sie sind.
--   2. Stichproben je Gruppe: Fehlermeldung, Benachrichtigung, Einstellung,
--      Forderungsbeschreibung (Getraenke, Gastgebuehr), Pflichtfeld-Name.
--
-- Bereits gespeicherte Benachrichtigungen und Forderungen bleiben, wie sie
-- sind. Kommentare in diesem Projekt bleiben ASCII.
--
-- Fixtures aus 01_constraints.sql (fixture_court), 02_rls.sql (fixture_user,
-- act_as), 03_rpc_bookings.sql (naechster_slot), 25_veranstaltungen.sql
-- (fixture_event), 27_veranstaltungen_nachrichten.sql (event_nachrichten).
-- ===========================================================================

create or replace function tests.test_keine_umschreibungen_in_funktionen()
returns setof text language plpgsql as $f$
begin
  return next is(
    (select array_agg(p.oid::regprocedure::text order by 1)
       from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
            ~ '\m(Abrechnungszeitraeume|Aeltere|Aendern|Aenderungen|Aenderungsprotokolls|Angekuendigt|Ankuendigung|Antraege|Aufraeumlauf|Bestaetige|Bestaetigung|Betraege|Dafuer|Eintraege|Einzuege|Faelligkeit|Faelligkeitsdatum|Faelligkeitstag|Faellt|Frueher|Frueheste|Fruehester|Fuer|Gastgebuehr|Geaendert|Gebuehr|Geloescht|Geraet|Geraete|Getraenk|Getraenke|Getraenkebuchungen|Glaeubiger|Glaeubigerdaten|Gruende|Kontoloeschung|Laerm|Lastschriftlaeufe|Loeschen|Mannschaftsuebersicht|Minderjaehrigen|Oeffnungszeit|Plaetze|Ruecklaeufer|Ruecklastschrift|Schliesszeit|Schluessel|Spaeteste|Strasse|Verdraengen|Verdraengt|Vorabankuendigung|Zahlungsempfaengers|Zugaenge|abklaeren|abschliessen|aendern|aenderst|aendert|angekuendigt|ankuendigen|ausdruecklich|ausgewaehlt|auswaehlen|bestaetige|bestaetigen|bestaetigt|duerfen|entfaellt|enthaelt|faellt|fuellen|fuer|geaendert|gefuehrt|gehoeren|gehoert|groesser|gueltig|gueltige|gueltiger|gueltiges|haengen|haengt|hochgezaehlt|hoechstens|kaemst|klaeren|koennen|koennte|kuenftige|laesst|laeuft|loeschen|moechte|muessen|nachgerueckt|naechsten|pruefen|regulaer|rueckwirkend|schliesse|schliessen|spaeter|traegt|ueber|uebernehmen|ungueltig|unveraendert|veroeffentlichen|veroeffentlichten|waehlen|waere|waeren|weiss|wofuer|wuerde|zaehlen|zerreissen|zurueck|zurueckgeben|zurueckgebucht|zurueckgenommen|zurueckholen|zurueckkommt|zuruecknehmen)\M'),
    null, 'Keine Funktion schreibt ae/oe/ue/ss statt Umlaut');
end; $f$;

create or replace function tests.test_umlaute_stichproben()
returns setof text language plpgsql as $f$
declare x record; a record; b record; adm record; v_court uuid := tests.fixture_court();
        v_event uuid := tests.fixture_event(1800); v_id uuid;
        s1 timestamptz := tests.naechster_slot(2, 10);
begin
  select * into x   from tests.fixture_user() limit 1;
  select * into a   from tests.fixture_user() limit 1;
  select * into b   from tests.fixture_user() limit 1;
  select * into adm from tests.fixture_user('admin', 'Admin') limit 1;

  -- (a) Fehlermeldung
  perform tests.act_as(x.auth_id);
  return next throws_ok(format($q$select public.set_member_role(%L, 'admin', true)$q$, x.member_id),
    '42501', 'Rollen vergeben dürfen nur Administratoren.', 'Fehlermeldung mit Umlaut');
  perform set_config('role', 'postgres', true);

  -- (b) Benachrichtigung
  perform tests.act_as(a.auth_id);
  perform public.event_anmelden(v_event, 0, null);
  perform set_config('role', 'postgres', true);
  perform tests.act_as(adm.auth_id);
  perform public.event_absagen(v_event);
  perform set_config('role', 'postgres', true);
  return next ok((select body from tests.event_nachrichten(v_event, a.member_id, 'event_cancelled'))
                 like '% fällt aus. Die Gebühr entfällt.', 'Benachrichtigung mit Umlaut');

  -- (c) Einstellung
  return next is((select label from public.settings where key = 'booking.opening_time'),
    'Öffnungszeit', 'Einstellung mit Umlaut');

  -- (d) Forderungsbeschreibung: Gastgebuehr beim Buchen mit Gast
  perform tests.act_as(a.auth_id);
  select public.create_booking(v_court, s1, 'einzel', '{}'::uuid[], array['Gast']) into v_id;
  perform set_config('role', 'postgres', true);
  return next ok((select description from public.charges where booking_id = v_id and kind = 'guest')
                 like 'Gastgebühr %', 'Gastgebühr mit Umlaut');

  -- (e) Pflichtfeld-Name
  return next is(private.fehlende_stammdaten(date '1990-01-01', 'female', null, '77815', 'Bühl', '1', null),
    array['Straße'], 'Straße mit ß');
end; $f$;

select plan(1);
select pass('Umlaute (U21, O13): Testfunktionen definiert');
