# Datenbank-Testsuite

pgTAP-Tests für Constraints, RLS und die Buchungs-RPCs.

## Ausführen

**Lokal** (braucht Docker):

```bash
pnpm db:start          # supabase start
pnpm db:test           # supabase test db
```

**Gegen ein Remote-Projekt** – die Testfunktionen einmal einspielen, dann:

```sql
set search_path = extensions, public, tests;
select * from runtests('tests'::name);

-- Nur eine Gruppe:
select * from runtests('tests'::name, '^test_rpc');
```

`runtests()` führt jede Testfunktion in einer eigenen Transaktion aus und rollt
sie danach zurück. Die Tests hinterlassen also keinen Zustand – auch nicht die
`auth.users`-Einträge, die sie für die Rollentests anlegen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `01_constraints.sql` | Doppelbuchungsschutz, Intervallform, Mitspieler-Regeln, gesperrte Abrechnungsperioden, Preisbildung, Idempotenz des Beitragslaufs |
| `02_rls.sql` | Rollentrennung, Eltern sehen das Kind nicht (jeder zahlt selbst), Bankdaten, Kiosk-Abgrenzung, `anon`, Vollständigkeitsprüfung |
| `03_rpc_bookings.sql` | Das Regelwerk über `create_booking`: Kontingent, Vorlauf, Öffnungszeiten, Zeitraster, Storno |
| `04_mitglieder.sql` | Selbstpflege-Erlaubnisliste, Änderungsprotokoll, Mitglieder-RPCs |
| `05_meine_buchungen.sql` | `my_bookings`, `leave_booking`, Benachrichtigungen |
| `06_mitspieler_gesucht.sql` | `join_booking`, `set_partner_wanted`, `open_matches`, Gastgebühr |
| `07_platzverwaltung.sql` | Sperrungen, Serien beenden, Plätze und Buchungsarten |
| `08_serien_aendern.sql` | `update_series`, `cancel_series_occurrence`, `series_id` im Tagesplan |
| `09_benachrichtigungs_mails.sql` | Auswahl, Bündelung und Abhaken der Mailbenachrichtigungen |
| `10_getraenkekarte.sql` | Preise, Preishistorie, Karte pflegen |
| `11_forderungen.sql` | Beitragslauf, Getränkemonat, Beitragsarten, Forderungen (immer an das Mitglied selbst) |
| `12_vorabankuendigung.sql` | Frist, Bündelung je Mitglied, Idempotenz der Ankündigung |
| `13_lastschrift.sql` | Auswahl, Mandat, Bündelung, drei Kinder mit derselben IBAN ergeben drei Lastschriften, Kontoinhaber als Schuldner, Datei und Einreichung |
| `14_ruecklaeufer.sql` | Rücklastschrift, Wiedervorlage, Abschluss eines Laufs |
| `15_arbeitsdienst.sql` | Soll-Regeln, Stunden erfassen, Jahresausgleich |
| `16_benachrichtigungs_pushes.sql` | Push-Marken, Auswahl und Abhaken der Push-Benachrichtigungen |
| `17_mannschaften.sql` | Mannschaften anlegen, Zuordnung und Mannschaftsführer, Archivierung |
| `18_rollen.sql` | Vorstand und App Admin mit vollen Rechten, Platzwart ohne volle Rechte, letzte Person mit vollen Rechten, Rollenende bei Login-Entzug und Archiv |
| `19_doppelbelegung.sql` | Niemand steht zur selben Zeit in zwei Buchungen |
| `20_platzwart.sql` | Platzrechte (`private.darf_plaetze`): Sperren und Aufheben, Serien, fremde Buchungen; keine Plätze, Arten, Einstellungen, Rollen; Gastgebühr beim Verdrängen durch `create_series` |
| `23_onboarding.sql` | Pflichtfelder bei Anlage und Antrag, Beitragswahl beim Annehmen, Onboarding-Schritte und ihre Minderjährigen-Regeln, SEPA-Mandat online mit Nachweis, `complete_onboarding`, Sperre über `is_member()` (Admin und Kiosk unberührt), Bestand freigeschaltet |
| `24_einzug.sql` | Einzug vorbereiten: genau die gewählten Forderungen, angekündigt und im Lauf zum selben Tag; ohne gültiges Mandat keine Ankündigung (Ausnahme); Frist und Rechte; Rückläufer neu angekündigt; Mitglied herausnehmen nur vor der Datei |
| `25_veranstaltungen.sql` | Anmeldung erzeugt sofort die Forderung (Preis × Personen), passt sich bis zum Anmeldeschluss an, Warteliste ohne Forderung und Nachrücken (wer passt), nach dem Schluss fest und erst dann im Einzug, im Einzug gesperrt, Gebühr ziehen mit, Absage löscht, Mitglieder sehen nur Zahlen, Stunden aus dem Arbeitsdienst genau einmal |
| `26_veranstaltungen_mitglieder.sql` | Eigener Platz auf der Warteliste in der Reihenfolge des Nachrückens, ohne fremde Anmeldungen |
| `27_veranstaltungen_nachrichten.sql` | Nachrichten zu Veranstaltungen: Veröffentlichen an alle aktiven Mitglieder genau einmal, Nachrücken mit Betrag, Absage an Angemeldete und Wartende, Verlegen nur bei echter Änderung; Verweis `event_id` in `my_notifications`; Mail- und Push-Arten |
| `28_veranstaltungen_erinnerung.sql` | Erinnerung zwei Tage vor dem Anmeldeschluss: nur an aktive Mitglieder ohne Anmeldung, genau einmal je Veranstaltung, nicht für Entwürfe, Abgesagtes oder ohne Anmeldung; pg_cron-Job `veranstaltungs-erinnerungen` |
| `29_zugang_ausgeschiedene.sql` | Zugang endet mit der Mitgliedschaft (`hat_zugang`): Archivierte, Gesperrte und Ausgetretene (nach dem Austrittsdatum) ohne Rechte, bis zum Austrittsdatum alles wie bisher; Archivieren sperrt, erlässt Gastgebühren, gibt Mitspielerplätze frei, meldet von Veranstaltungen und Wartelisten ab, nimmt aus Einzugsentwürfen; Archivierte rücken nicht nach; Rollen enden mit dem Austritt |
| `31_forderungen_doppelt.sql` | Keine doppelte Belastung (B1, B2): Erlassen und Abhaken nehmen eine Forderung aus dem Einzugsentwurf, nach erzeugter oder eingereichter Datei abgewiesen; die Datei entsteht nicht mit erlassenen Posten und überschreibt sie nicht; Gastgebühr genau einmal, auch angekündigt oder im Einzug; Storno erlässt sie und nimmt sie aus dem Entwurf, in einer Datei bleibt sie stehen; Gastgebühr erst ab Spielbeginn einziehbar |
| `32_haertung_welle3.sql` | `join_booking`, `update_booking_players` und `leave_booking` sperren die Buchung mit `FOR UPDATE` (B6, geprüft über pgrowlocks in der Testtransaktion); Mandat mit Berliner Datum auch in einer Sitzung hinter UTC (B10); Austritt zu einem künftigen Datum bleibt bis dahin im Verzeichnis und am Kiosk, Archivierte und Gesperrte nicht (B21); `update_member` archiviert nicht und holt nicht aus dem Archiv (B23) |
| `33_konto_loeschung.sql` | Kontolöschung beantragen (O9): Admins und Vorstand mit Zugang werden benachrichtigt (Mail und Push), höchstens ein Antrag je Mitglied in 24 Stunden, nur mit Zugang, Antrag sichtbar für das Mitglied selbst und den Vorstand |
| `34_haertung_welle4.sql` | Rechte und Grenzen: Lastschriftdatei je Versuch unter eigenem Pfad, kein Überschreiben (B7); Antragsherkunft aus `x-forwarded-for`, `p_ip` ignoriert (S6); keine `private.*`-Funktion für PUBLIC, auch keine künftige, `authenticated` und `anon` nur, was Policies brauchen (S8); Mitglieder lesen aus `bookings` nur Planspalten und fremde Buchungen bis eine Woche zurück (S15), aus `members` keine Notizen, Admins über `member_notes` (S17); Längengrenzen für Freitext (S21); kein Umhängen eines aktiven fremden Push-Geräts (S26) |
| `35_haertung_welle5.sql` | Berliner Datum: Getränkepreis ab dem Berliner Heute (B15), keine Funktion, kein Standardwert und keine Prüfung mit `current_date` (B16); neue Erinnerung, wenn der Anmeldeschluss nach hinten rückt (B17); als letzte Person mit vollen Rechten zählt nur, wer sie ausüben kann, `private.aktive_admins_ohne` (S18a); Text einer zugestimmten Rechtstext-Fassung unveränderlich (S23); `reactivate_member` holt Archivierte ohne Zugang und mit offenem Onboarding zurück (B26) |
| `36_pgtap_luecken.sql` | Direkte Tests für RPCs, die bisher nur nebenbei liefen (T4): Posten aus einem Lastschrift-Entwurf nehmen (`remove_charge_from_debit_batch`), Posten je Lastschrift lesen (`debit_batch_items`), Vorschau des Beitragslaufs (`fee_run_preview`), Veranstaltung veröffentlichen und löschen, `update_membership`, `my_booking_quota`, `remove_push_token`, Selbstpflege nur freigegebener Felder und die Umgehung über `tcm.selbstpflege_rpc` nur innerhalb der Onboarding-RPCs (`guard_member_self_update`) |
| `37_umlaute.sql` | Umlaute in Texten aus der Datenbank (U21, O13): keine Funktion schreibt ae/oe/ue/ss statt Umlaut oder ß (außerhalb von Kommentaren, Codes und Schlüsseln bleiben), Stichproben für Fehlermeldung, Benachrichtigung, Einstellung, Gastgebühr und Pflichtfeld-Name |
| `38_verwaltungsprotokoll.sql` | Verwaltungsprotokoll (O27, S29): eigene Buchung, Gastgebühr und Arbeitsstunden ohne Eintrag, dieselbe Aktion eines Admins für andere mit ihm als Urheber, Sperrung immer; Beitragslauf und Serie als Sammeleintrag mit Anzahl und Summe; `tcm.protokoll_sammel` setzen nur die Läufe, `set_config` nicht über die API; Mitglieder sehen keine Einträge, Notizen und Antragsangaben stehen nicht darin, Vereins-IBAN maskiert; `protokoll_zugang` nur für Admins |
| `39_antrag_bestaetigung.sql` | Mitgliedsantrag mit Bestätigungsmail (S22): unbestätigt für die Verwaltung unsichtbar und ohne Benachrichtigung, nur der Token-Hash gespeichert; Bestätigen einmal, Vorstand erst dann benachrichtigt; Link nach 24 Stunden abgelaufen, Aufräumjob `unbestaetigte-antraege` löscht nur Unbestätigtes; je Adresse ein Antrag, Mail erneut nach 10 Minuten, höchstens 5, Freigabe nach gescheitertem Versand; 10 je Herkunft auch unbestätigt; 50 erfundene Anträge blockieren keinen echten, der globale Deckel zählt nur bestätigte |
| `40_mein_zugang.sql` | Kein Zugang mehr (B22): `mein_zugang()` meldet Zugang bis zum Austrittstag, danach, archiviert oder gesperrt keinen Zugang mit Grund; Kiosk-Geräte und offene Onboardings fliegen nicht heraus; nur für angemeldete Konten |
| `41_benachrichtigungen_aufraeumen.sql` | Aufräumjob `alte-benachrichtigungen`: löscht Benachrichtigungen älter als drei Monate, gelesen oder nicht; drei Monate minus ein Tag bleibt, Mitglieder und Buchungen unberührt; Funktion nicht für `authenticated` und `anon` |
| `99_runtests.sql` | Führt die Suite aus |

Die Dateien `01` bis `23` **definieren nur Funktionen**. Ausgeführt wird alles in
`99_runtests.sql` – die Nummer sorgt dafür, dass `pg_prove` erst definiert und dann
ausführt. Jede Definitionsdatei schließt mit einem `plan(1)` plus `pass()`; ohne
Plan hält `pg_prove` eine Datei für kaputt und meldet „No subtests run".

## Zwei Fallen

**Umbenannte Testfunktionen bleiben liegen.** `create or replace` legt die neue
Funktion an, löscht die alte aber nicht – sie läuft in der Suite weiter mit und
schlägt fehl, während dieselbe Datei einzeln grün ist. Nach jedem Umbenennen oder
Löschen einer Testfunktion deshalb `pnpm db:reset`.

**Ein Admin kommt an `public.members` nicht per direktem `UPDATE`.** Die Policy
`members_admin_all` erlaubt ihm jede Zeile, aber `authenticated` hat auf der Tabelle
nur einen *Spalten*-Grant. Alles außerhalb dieser Liste – `is_trainer`, `status`,
`email` – geht ausschließlich über eine `security definer`-RPC.
Ein Test, der einen Admin direkt schreiben lässt, prüft die falsche Sache.

## Zwei Tests, die besonders wichtig sind

**`test_rls_auf_allen_tabellen`** iteriert über `pg_class` und schlägt fehl,
sobald eine Tabelle ohne RLS oder ohne Policy hinzukommt. Ein vergessener
Schutz fällt damit sofort auf, statt still Daten freizugeben.

**`test_rpc_kontingent_ueber_mitspieler`** belegt, dass die Buchungsgrenze auch
über Mitspielerschaft zählt. Ohne das könnte eine Vierergruppe reihum buchen
und hätte faktisch unbegrenzt Plätze – die Regel wäre eine Empfehlung statt
einer Regel.

## Rollenwechsel in Tests

Die Tests setzen `request.jwt.claims` und `role` genau so, wie PostgREST es zur
Laufzeit tut:

```sql
perform tests.act_as(auth_id);          -- als angemeldetes Mitglied
perform tests.act_as_anon();            -- als nicht angemeldeter Besucher
perform set_config('role', 'postgres', true);   -- zurück zum Eigentümer
```

Nach einem Wechsel auf `authenticated` besteht **kein** Zugriff mehr auf das
Schema `tests`. Alle Helferaufrufe und Zeitberechnungen müssen deshalb vorher
passieren – sonst stirbt der Test mit `permission denied for schema tests`.

## Vor `pnpm db:test` zurücksetzen

`runtests()` rollt jede Testfunktion zurück, aber es sieht den **Bestand** der
Datenbank. Wer vorher von Hand einen Beitragslauf ausgeführt und angekündigt
hat, hinterlässt dreihundert unversandte Benachrichtigungen – und die Tests um
`claim_notification_mails`, die „genau eine" erwarten, schlagen fehl, ohne dass
am Code etwas falsch wäre.

Deshalb: nach jedem manuellen Durchspielen erst `pnpm db:reset`, dann testen.
