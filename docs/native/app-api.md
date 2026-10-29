# API-Vertrag der App

Stand: 29.10.2026 · Quelle: Expo-App in `apps/mobile` (Datenschicht `src/lib/daten.ts`, `src/lib/push.ts`, `src/lib/verwaltung/*.ts`)

Hier steht, was die App mit Supabase spricht: 51 RPCs, 9 direkte Tabellenzugriffe, ein Realtime-Kanal und die Auth-Aufrufe. Die nativen Apps (iOS, Android) müssen genau das abdecken, nicht mehr und nicht weniger. Statt der Tabellenzugriffe nehmen sie die RPCs aus [„Neu für die nativen Apps“](#neu-für-die-nativen-apps). Fahrplan: [`native-apps.md`](../native-apps.md).

**Maschinenlesbar:** [`app-api.json`](app-api.json). Sie enthält Parameter und Rückgaben jeder RPC, die Spalten der Tabellen und die Werte der Enums. Erzeugt wird sie aus `packages/core/src/database.types.ts` mit `pnpm --filter @tcm/core build:app-api`. Der Test `packages/core/src/app-api.test.ts` prüft, dass sie aktuell ist und dass die Liste zu `apps/mobile` passt. Ruft die Expo-App eine neue RPC auf, schlägt er fehl.

## Grundsätze

- **Alles läuft als angemeldetes Mitglied** (Publishable Key plus Sitzungs-JWT). Was jemand darf, entscheiden RLS und die RPCs, nie die App. Die App blendet nur aus, was die Datenbank ohnehin ablehnen würde (`bookingActions`, `canStartAt`, siehe `packages/core/golden/`).
- **Schreiben nur über RPCs.** Einzige Ausnahme in der Expo-App sind die zwei `update` auf `members` (siehe unten). Die nativen Apps nehmen dafür `save_my_profile` und `save_my_notfallkontakt`.
- **Zeitpunkte** gehen als ISO-8601 mit Zone hinaus (`toISOString()`, also UTC). Ein Zeitstempel ohne Zone würde Postgres in der Zeitzone der Verbindung (UTC) lesen, und die Buchung landete zwei Stunden daneben. Tage (`p_date`, `p_valid_from`) gehen als `JJJJ-MM-TT`, Uhrzeiten (`p_start_time`) als `HH:MM`. Wandeln Tag und Minute in einen Zeitpunkt immer in Europe/Berlin (`berlinTime`), nie in der Zeitzone des Geräts.
- **Rückgaben:** `setof`/`returns table` kommt als Liste. Bei Funktionen, die genau eine Zeile liefern (`my_booking_quota`, `booking_settings`, `mein_zugang`, `my_work_duty`), nimmt die App die erste Zeile. `void` liefert nichts.
- **Nullbarkeit:** Die generierten Typen sagen bei Rückgabespalten von RPCs nichts Verlässliches über `null`, `day_schedule.series_id` etwa ist meist `null`. Die nativen Modelle machen deshalb jede Rückgabespalte optional, die nicht offensichtlich Pflicht ist (Kennungen, Zeitpunkte).
- **Optionale Parameter** (`p_reason?` in der JSON) lässt die App weg, statt `null` zu schicken. Für PostgREST ist das ein Unterschied: Ein fehlender Parameter nimmt den Standardwert der Funktion.

## Fehler

Jeder Fehler geht durch `translateDbError` (`packages/core/src/errors.ts`, Golden File `translateDbError.json`). Was dort herauskommt, zeigt die App unverändert an. Die Regeln in Kürze:

1. Kein Netz (`fetch failed`, `Network request failed`, `ECONNREFUSED` …): „Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut.“
2. Bekannter Constraint-Name in `message` oder `details` (`bookings_no_overlap`, `members_email_key` …): fester Satz aus der Tabelle in `errors.ts`.
3. Meldung aus einer RPC, die auf `.`, `!` oder `?` endet und kein „violates“ enthält: unverändert durchreichen. Deshalb enden alle `raise exception`-Texte der Migrationen auf einen Punkt.
4. Sonst nach SQLSTATE: `23P01` belegt, `23505` existiert bereits, `23503` verknüpft, `23514` Regel verletzt, `42501` keine Berechtigung, `22023` ungültig, `P0002` nicht gefunden.
5. Sonst „Das hat nicht geklappt. Bitte versuche es erneut.“, ohne `message` „Unbekannter Fehler.“

Was die App darüber hinaus auswertet, steht bei der jeweiligen RPC in der Spalte „Fehler“. Lesende Aufrufe werfen den übersetzten Satz als Fehler, und der Bildschirm zeigt ihn mit „Erneut versuchen“. Schreibende geben `{ ok: false, meldung }` zurück, und die Meldung erscheint im Formular oder als Hinweis.

## Auth

| Aufruf | Wo | Zweck, Besonderheiten |
|---|---|---|
| `signInWithPassword(email, password)` | `app/anmelden.tsx` | E-Mail wird getrimmt. Jeder Fehler wird zu „E-Mail-Adresse oder Passwort stimmt nicht.“, damit die Antwort nicht verrät, ob es die Adresse gibt. |
| `signOut()` | `abmelden`: Konto, Onboarding, Kein Zugang | Vorher den Getränkekorb leeren. Konto und Onboarding melden vorher auch das Push-Token ab (`remove_push_token`), sonst bekommt das Gerät weiter die Nachrichten des Vorbesitzers. |
| `signOut({ scope: "local" })` | `app/passwort-setzen.tsx` | Eine bestehende Sitzung verwerfen, bevor ein Link eingelöst wird. |
| `resetPasswordForEmail(email, { redirectTo })` | `app/passwort-vergessen.tsx` | Antwort ist immer „Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs.“, auch im Fehlerfall. `redirectTo` ist heute `Linking.createURL("/passwort-setzen")`, im Build also `tcm://passwort-setzen`, und wird ein Universal Link bzw. App Link (Phase A). |
| `verifyOtp({ token_hash, type })` | `app/passwort-setzen.tsx` | Link aus Einladungs- oder Passwortmail (`?token_hash=…&type=invite\|recovery`). |
| `setSession({ access_token, refresh_token })` | `app/passwort-setzen.tsx` | Altes Linkformat mit Tokens im Fragment. Entfällt mit S20 (`docs/goLive.md`, Schritt 1). Die nativen Apps brauchen es nicht mehr, wenn bis dahin beide Projekte umgestellt sind. |
| `updateUser({ password })` | Passwort setzen, Onboarding-Schritt „Passwort“ | Fehler über `translateDbError`. Erfolg: „Passwort gespeichert.“ |
| `getSession()`, `onAuthStateChange` | `app/index.tsx` (Weiche) | Ohne Sitzung zur Anmeldung, mit Sitzung `mein_zugang` fragen. |
| `getUser()` | `ladeIchSelbst`, `ladeVeranstaltung` | `auth.uid` für `members.auth_user_id`. Nativ nicht nötig: `ich()` liefert die `member_id`, `events_fuer_mitglied` die eigene Forderung. |

Die Sitzung liegt in der Expo-App im SecureStore. Nativ kommt sie in die Keychain (mit App Group, damit Widgets lesen können) bzw. in den Android Keystore.

## RPCs

Die Spalte „Wo“ nennt die Wrapper-Funktion in `apps/mobile/src/lib` und die Bildschirme in `apps/mobile/app`. Parameter stehen so da, wie die App sie füllt. Die genauen Typen stehen in `app-api.json`.

### Start und Zugang

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `mein_zugang` | – | eine Zeile `{zugang, grund, onboarding_offen}` | `ladeZugang`: Weiche `index`, Tab-Schutz `(tabs)/_layout` | Ohne Zeile (Kiosk-Konto ohne Mitglied) gilt: Zugang ja, Onboarding nein. `grund` geht durch `zugangsGrund` (archiviert, gesperrt, ausgetreten, sonst unbekannt) und führt nach `/kein-zugang?grund=…`. |
| `my_onboarding` | – | `Json` (Typ `OnboardingZustand` in `packages/core/src/onboarding.ts`: `status` je Schritt, `pflicht_fehlt`, `stammdaten`, `erziehungsberechtigte`, `notfallkontakt`, `dokumente`, `minderjaehrig` …), `null` ohne Mitglied | `ladeOnboarding`: `onboarding` | wirft |

### Plätze und Buchungen

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `day_schedule` | `p_date` (JJJJ-MM-TT, Berliner Tag) | Belegungen des Tages: `booking_id, court_id, starts_at, ends_at, kind, series_id, type_code, type_name, title, owner_member_id, owner_name, is_own, bin_dabei, partner_wanted, frei, players, player_member_ids, guest_names` | `ladeTagesplan`: Plätze, Home; Verwaltung (Zustand „gesperrt bis …“) | wirft; in der Verwaltung fehlt bei Fehler nur der Zustand |
| `booking_settings` | – | eine Zeile `{opening_time, closing_time, slot_minutes, lead_days, max_open_bookings, display_minutes, guest_fee_cents}` | `ladeBuchungseinstellungen`: Plätze, Home | wirft; ohne Zeile `null` |
| `my_booking_quota` | – | eine Zeile `{used, allowed}` | `ladeKontingent`: Plätze | wirft; ohne Zeile `{0, 0}` |
| `create_booking` | `p_court_id`, `p_starts_at` (ISO, aus `berlinTime`), `p_booking_type_code`, `p_player_member_ids[]`, `p_guest_names[]`, `p_partner_wanted` | `uuid` der Buchung | `bucheplatz`: Plätze | Meldung anzeigen. Typisch: Platz belegt (`23P01`/`bookings_no_overlap`), Kontingent, Vorlauf, Person spielt schon woanders (Text aus der RPC, nicht „Platz belegt“). Erfolg: „Platz gebucht.“ |
| `update_booking_players` | `p_booking_id`, `p_member_ids[]`, `p_guest_names[]` (getrimmt, leere raus) | – | `aendereMitspieler`: Plätze | Meldung. Erfolg: „Mitspieler aktualisiert.“ |
| `cancel_booking` | `p_booking_id`, `p_reason` (getrimmt, leer weglassen) | – | `storniereBuchung`: Plätze, Spiele; `hebeSperreAuf`: Plätze | Meldung. Erfolg: „Buchung storniert.“ bzw. „Die Sperrung ist aufgehoben.“ |
| `cancel_series_occurrence` | `p_booking_id`, `p_reason` | – | `sageSerienterminAb`: Plätze | Meldung. Erfolg: „Der Termin ist abgesagt.“ |
| `move_booking` | `p_booking_id`, `p_court_id`, `p_starts_at` (aus `berlinTime(tag, minute)`), `p_reason` | – | `setzeUm`: Plätze (nur Platzrechte) | Meldung. Erfolg: „Die Buchung ist umgesetzt.“ |
| `my_bookings` | – (`p_ab` bleibt beim Standard) | `booking_id, starts_at, ends_at, court_name, kind, type_code, type_name, title, owner_name, bin_bucher, players` | `ladeMeineBuchungen`: Home, Spiele | wirft |
| `open_matches` | – (`p_von`, `p_bis` Standard) | `booking_id, starts_at, ends_at, court_name, type_code, type_name, owner_member_id, owner_name, players, frei, bin_dabei` | `ladeOffeneSpiele`: Home, Spiele | wirft |
| `join_booking` | `p_booking_id` | – | `spieleMit`: Plätze, Spiele | Meldung. Erfolg: „Du bist eingetragen. Viel Spaß!“ |
| `leave_booking` | `p_booking_id` | – | `verlasseBuchung`: Spiele | Meldung (etwa: dann blieben zu wenige Spieler). Erfolg: „Du bist ausgetragen.“ |
| `set_partner_wanted` | `p_booking_id`, `p_wanted` | – | `sucheMitspieler`: Plätze, Buchungsfenster | Meldung. Erfolg je nach Richtung „Die Buchung steht jetzt bei den offenen Spielen.“ bzw. „Die Buchung ist nicht mehr ausgeschrieben.“ |
| `member_directory` | `p_query` (Suchtext, leer = alle) | `{id, first_name, last_name}` | `ladeVerzeichnis`: Plätze (Mitspielerauswahl) | wirft |

### Sperren und Serien (Platzrechte: Admin, Vorstand, Platzwart)

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `create_blocking` | `p_court_ids[]`, `p_von`, `p_bis` (ISO, aus `berlinTime`), `p_type_code` (Blockungsart), `p_title` (Grund, getrimmt, darf leer sein), `p_force` | eine Zeile `{created_count, displaced_count}` | `sperreStunde`: Plätze; `sperre`: Verwaltung, Buchungsfenster | **Zweistufig:** Ohne `p_force` lehnt die RPC ab, wenn Buchungen im Weg liegen: „`<n>` Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen.“ Die App liest `<n>` per `^(\d+) Buchungen liegen` aus der Meldung, fragt nach und ruft mit `p_force = true` erneut. Erfolg: „`<n>` Plätze gesperrt[, `<m>` Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.]“ |
| `update_blocking` | `p_booking_id`, `p_court_ids[]`, `p_von`, `p_bis`, `p_type_code`, `p_title`, `p_force` | eine Zeile `{created_count, displaced_count}` | `aendereSperre`: Plätze | Zweistufig wie `create_blocking`. Erfolg: „Sperrung geändert[, `<m>` Buchung(en) verdrängt].“ |
| `court_overview` | – | `{id, name, short_name, subline, sort_position, active, offene_buchungen}` | Verwaltung `ladePlaetze` | wirft „Die Plätze konnten nicht geladen werden. (…)“ |
| `series_overview` | – | `{id, court_name, type_name, title, weekday, start_time, end_time, valid_from, valid_to, kuenftige}` | Verwaltung `ladePlaetze` | wirft |
| `preview_series` | `p_court_id`, `p_weekday`, `p_start_time`, `p_end_time` (HH:MM), `p_valid_from`, `p_valid_to` (JJJJ-MM-TT) | kollidierende Termine `{starts_at, ends_at, conflict_booking_id, conflict_member_name, conflict_kind}` | `vorschauSerie`: Serienformular | Meldung; ändert nichts |
| `create_series` | wie `preview_series` plus `p_booking_type_code`, `p_title`, `p_displace` | eine Zeile `{series_id, created_count, displaced_count}` | `legeSerieAn`: Serienformular | Ohne `p_displace` Abbruch bei Kollision mit Meldung. Erfolg: „Serie angelegt: `<n>` Termine[, `<m>` bestehende Buchungen verdrängt …].“ |
| `update_series` | `p_series_id`, `p_start_time`, `p_end_time`, `p_title`, `p_valid_to` (leer = unverändert, dann weglassen), `p_displace` | eine Zeile `{created_count, displaced_count, cancelled_count}` | `aendereSerie`: Serienliste | Zweistufig: „`<n>` Termine kollidieren mit bestehenden Buchungen. Vorschau ansehen und Verdrängen bestätigen.“, gelesen per `^(\d+) Termine kollidieren` |
| `end_series` | `p_series_id` (`p_ab` Standard = heute) | Zahl abgesagter künftiger Termine | `beendeSerie`: Serienliste | Meldung. Erfolg: „Serie beendet. `<n>` künftige Termine wurden abgesagt.“ bzw. „… Es standen keine Termine mehr aus.“ |

Vor dem Absenden prüft die Verwaltung die Eingaben selbst. Uhrzeit: „Uhrzeit als HH:MM angeben.“, Datum: „Das Datum bitte als TT.MM.JJJJ angeben.“, Serie mit `seriesSchema` aus `@tcm/core`.

### Startseite und Nachrichten

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `my_notifications` | `p_limit` (30) | `{id, kind, title, body, created_at, read_at, event_id}`, ungelesen zuerst | `ladeBenachrichtigungen`: Home, Nachrichten, Glocke | wirft |
| `mark_notifications_read` | – (ohne `p_ids` alle) | Zahl markierter | `markiereBenachrichtigungenGelesen`: Nachrichten, Glocke | wirft |
| `my_unread_notification_count` | – | Zahl | `zaehleUngelesen`: Glocke | Fehler zählt als 0, die Glocke bleibt dann einfach leer |
| `my_work_duty` | – (`p_year` Standard) | eine Zeile `{year, required_hours, completed_hours, missing_hours}` | `ladeArbeitsdienst`: Home, Konto | wirft; ohne Zeile `null` |

### Verein: Getränke, Veranstaltungen

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `drink_menu` | – | `{id, name, category, description, price_cents, sort_order}` | `ladeGetraenkekarte`: Getränke | wirft |
| `my_drink_purchases` | – | `{id, item_name, quantity, unit_price_cents, total_cents, created_at, voided_at, source}` | `ladeEigeneGetraenke`: Home, Konto, Getränke | wirft |
| `record_drink_purchase` | `p_item_id`, `p_quantity` (1 bis 50, `MAX_DRINK_QUANTITY`) | `uuid` | `bucheGetraenk`: Getränke (je Artikel im Korb) | Meldung je Artikel; was scheitert, bleibt im Korb |
| `void_drink_purchase` | `p_purchase_id`, `p_reason` = „Fehlbuchung“ | – | `storniereGetraenk`: Getränke | Meldung (etwa: Stornofenster vorbei). Erfolg: „Zurückgenommen.“ |
| `events_fuer_mitglied` | – | veröffentlichte und abgesagte Veranstaltungen mit eigenem Stand: `id, kind, title, description, location, status, starts_at, ends_at, registration_enabled, registration_deadline, max_participants, companions_allowed, fee_cents, work_hours, personen, warteliste, mein_status, meine_begleitpersonen, meine_bemerkung`, seit Phase A auch `meine_forderung_cents, meine_forderung_status` (die eigene, nicht erlassene Forderung, sonst `null`; die Expo-App liest sie noch aus `charges`) | `ladeVeranstaltungen`: Veranstaltungen, Home; `ladeVeranstaltung`: Detail mit `.eq("id", …)` auf dem Ergebnis | wirft; Detail ohne Treffer ist `null` |
| `event_mein_wartelistenplatz` | `p_event_id` | Zahl oder `null` | `ladeVeranstaltung`: Detail | Fehler wird nicht ausgewertet, es gibt dann keinen Platz |
| `event_anmelden` | `p_event_id`, `p_companions`, `p_note` | `registered` oder `waitlisted` | `meldeZuVeranstaltungAn`: Detail | Meldung. Erfolg: „Du bist angemeldet.“ bzw. „Ausgebucht – du stehst auf der Warteliste.“ |
| `event_anmeldung_aendern` | `p_event_id`, `p_companions`, `p_note` | wie oben | `aendereVeranstaltungsAnmeldung`: Detail | Erfolg: „Deine Anmeldung ist geändert.“ bzw. „Geändert – du stehst weiter auf der Warteliste.“ |
| `event_abmelden` | `p_event_id` | – | `meldeVonVeranstaltungAb`: Detail | Erfolg: „Du bist abgemeldet.“ |

### Konto

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `my_charges` | – | `{id, kind, description, period_label, amount_cents, due_date, status, member_name, is_for_other}` | `ladeMeineForderungen`: Konto | wirft |
| `member_attributes` | `p_member_id` (eigene Id) | Merkmale mit `code, name, description, value_kind, multiple, optionen, option_value, option_label, text_value, set_at, self_editable, darf_ich` | `ladeMeineMerkmale`: Konto | wirft. `description` geht durch `merkmalBeschreibung(…, "mitglied")`. |
| `set_member_attribute` | `p_member_id`, `p_type_code`, `p_option_value` oder `p_text_value` | – | `setzeMerkmal`: Konto (Merkmale-Karte), Onboarding | Meldung. Erfolg: „Gespeichert.“ |
| `remove_member_attribute` | `p_member_id`, `p_type_code`, `p_option_value` | – | `entferneMerkmal`: wie oben | Erfolg: „Entfernt.“ |
| `konto_loeschung_beantragen` | `p_nachricht` (nur wenn nicht leer, geprüft mit `kontoloeschungPruefen`) | `true` = neuer Antrag, `false` = binnen 24 h schon einer da | `beantrageKontoloeschung`: Konto | Meldung; Text je nach Rückgabe aus `kontoloeschungMeldung` |

### Onboarding

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `onboarding_save_stammdaten` | `p_first_name`, `p_last_name`, `p_birthday` (JJJJ-MM-TT), `p_gender` (`female`, `male`, `diverse`), `p_street`, `p_postcode`, `p_city`, `p_phone`, `p_mobile`, `p_title` (leere weglassen) | – | `speichereOnboardingStammdaten` | Vorher prüft die App selbst und nennt das Feld (`pruefeOnboardingStammdaten`): Vorname, Nachname, Geburtsdatum (TT.MM.JJJJ, nicht in der Zukunft, nicht vor 1900), Geschlecht, Straße, PLZ, Ort, Telefon oder Mobil. Die RPC meldet sonst nur „Pflichtangaben fehlen: …“. |
| `onboarding_accept_documents` | `p_codes[]` | – | `akzeptiereDokumente` | Meldung |
| `onboarding_save_guardian` | `p_name`, `p_email`, `p_phone`, `p_consent` | – | `speichereErziehungsberechtigte` | Vorher: Name Pflicht, E-Mail oder Telefon Pflicht |
| `onboarding_save_notfallkontakt` | `p_name`, `p_phone`, `p_relation` | – | `speichereOnboardingNotfallkontakt` | Vorher: „Zur Notfallnummer gehört auch ein Name.“ |
| `create_my_sepa_mandate` | `p_iban`, `p_holder`, `p_accept = true` | Mandatsreferenz | `erteileMandat` | Vorher: Bestätigung Pflicht, `isValidIban` |
| `save_my_tennis` | `p_tennis_lk`, `p_nuliga_id` (leer weglassen), `p_mannschaft_interesse` | – | `speichereTennis` | Meldung (`members_nuliga_id_key` → „Diese nuLiga-Id ist bereits …“) |
| `complete_onboarding` | – | Text | `schliesseOnboardingAb` | Fehlt noch etwas, kommt `check_violation` mit `details` = Komma-Liste der fehlenden Schritte (`passwort`, `stammdaten`, `rechtliches`, `erziehungsberechtigte`, `notfallkontakt`, `sepa`). Die App springt zum ersten davon. Erfolg: „Dein Konto ist freigeschaltet.“ |

### Push

| RPC | Parameter | Rückgabe | Wo | Fehler |
|---|---|---|---|---|
| `register_push_token` | `p_token` (heute Expo-Token), `p_platform` (`ios`, `android`), `p_device_name`; nativ zusätzlich `p_provider` (`apns`, `fcm`, Standard `expo`) | – | `push.ts registriereGeraet`: Konto, Onboarding | Meldung. Erfolg: „Benachrichtigungen sind eingeschaltet.“ |
| `remove_push_token` | `p_token` | – | `push.ts meldeGeraetAb`: Konto, Onboarding, vor dem Abmelden | Meldung |

Die nativen Apps registrieren APNs- bzw. FCM-Tokens mit dem optionalen Parameter `p_provider` (`expo`, `apns`, `fcm`, Standard `expo`). Die Expo-App schickt ihn nicht und bleibt bei `expo`. Ein anderer Wert: „Unbekannter Push-Anbieter "…".“ Die Regel S26 bleibt: Eine Marke, die noch für ein anderes Mitglied mit Zugang aktiv ist, zieht nicht um.

Der Versand (`claim_notification_pushes`, nur Edge Function `notification-pushes`) liefert je Empfänger zusätzlich `geraete` = `[{token, provider}]`, neueste zuerst. `tokens` enthält bis zum Umbau der Function nur noch Expo-Marken, denn sie schickt alles an `exp.host`. Eine APNs- oder FCM-Marke würde dort abgelehnt und stillgelegt. Bis die Function APNs und FCM selbst verschickt, gehen Nachrichten an native Geräte also nicht hinaus, sind aber wie bisher abgehakt.

## Neu für die nativen Apps

Diese RPCs ersetzen die direkten Tabellenzugriffe (Migration `20261029113529_app_rpcs.sql`, Tests in `supabase/tests/42_app_rpcs.sql`). Die Expo-App ruft sie nicht auf. Deshalb stehen sie in `app-api.json` unter `nativ` und nicht unter `rpcs`. In `app-api.ts` heißt die Liste `NATIVE_RPCS`.

Für alle gilt: nur angemeldet (`anon` hat kein `execute`), und jede liefert nur Eigenes, auch einem Admin. Ohne Zugang (`private.hat_zugang`) geben die lesenden nichts zurück (keine Zeile, `false` bzw. `null`), die schreibenden lehnen mit „Nur Mitglieder haben ein Konto.“ (`42501`) ab. Wo die Tabellen-Policies schon das Richtige zeigen, laufen sie als Aufrufer (`security invoker`). Nur `ich` läuft als `security definer`, wie `mein_zugang`.

| RPC | Parameter | Rückgabe | Ersetzt | Fehler, Hinweise |
|---|---|---|---|---|
| `ich` | – | eine Zeile `{member_id, first_name, last_name, roles[], admin, platz_rechte, kiosk, zugang, grund, onboarding_offen}` | `members` (`id` über `auth_user_id`), `member_roles`, `getUser()` | `admin` = Vorstand oder App Admin (`hatVolleRechte`), `platz_rechte` = dazu Platzwart (`hatPlatzRechte`), beide aus `private.is_admin`/`private.darf_plaetze`. `zugang`, `grund`, `onboarding_offen` wie `mein_zugang`. Ohne Zugang oder ohne Mitglied (Kiosk) sind `member_id` und Name `null`, `roles` ist leer und alle Rechte sind `false`. |
| `mein_profil` | – | eine Zeile `{first_name, last_name, title, phone, mobile, street, postcode, city, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, membership_number, member_since, team_name, is_team_captain}` | `members` (Name, Stammdaten, Notfallkontakt, Mannschaft), `memberships` | Mitgliedschaft = neueste aktive, sonst `null`. `team_name` ist bei den meisten `null`. Ohne Zugang keine Zeile. |
| `save_my_profile` | `p_first_name`, `p_last_name`, `p_title`, `p_phone`, `p_mobile`, `p_street`, `p_postcode`, `p_city`, alle optional | – | `update members` (`speichereStammdaten`) | Nur geänderte Felder schicken. Fehlt ein Parameter oder ist er `null`, bleibt das Feld unverändert. Ein leerer Text leert es, Vor- und Nachname dürfen nicht leer sein („Vor- und Nachname sind Pflicht.“). Läuft als Aufrufer, also über Policy `members_update_own`, Spalten-Grant und Trigger `guard_member_self_update`. Andere Spalten nimmt die Funktion gar nicht erst an. Die Prüfung der Formate (PLZ, Telefon) macht wie heute die App vorher mit `memberProfileSchema`. Erfolg: „Gespeichert.“ |
| `save_my_notfallkontakt` | `p_name`, `p_phone`, `p_relation` | – | `update members` (`speichereNotfallkontakt`) | Ersetzt alle drei Felder, leere Texte werden `null`. Nummer ohne Namen: „Zur Notfallnummer gehört auch ein Name.“ Erfolg: „Notfallkontakt gespeichert.“ |
| `mein_mandat` | – | höchstens eine Zeile `{reference, signed_on, status, holder, bank_name, iban_last4}` | `sepa_mandates` mit `bank_accounts` | Neuestes aktives Mandat. Von der IBAN gibt es nur die letzten vier Stellen. |
| `courts_aktiv` | – | `{id, name, short_name, position}` nach `position` | `courts` | Wie die Policy nur für Mitglieder mit abgeschlossenem Onboarding (`is_member`). |
| `booking_types_aktiv` | `p_applies_to` (`booking` oder `blocking`) | `{code, name, duration_minutes, requires_partner, min_players, max_players, sort_order}` nach `sort_order` | `booking_types` (`ladeBuchungsarten`, `ladeBlockungsarten`) | Nur aktive Arten. Die Platzverwaltung mit den inaktiven Arten bleibt ein Tabellenzugriff, bis sie nativ gebaut wird. |
| `drink_void_window_minutes` | – | Zahl (Minuten) | `settings` (`drinks.void_window_minutes`) | Eine eigene RPC statt einer Spalte in `drink_menu` (dort stünde dieselbe Zahl in jeder Zeile) oder in `booking_settings` (gehört zum Platz). Fehlt die Einstellung: 15. Ohne Zugang `null`. |
| `push_token_aktiv` | `p_token` | `boolean` | `push_tokens` (`istAngemeldet`) | `true` nur für die eigene, nicht stillgelegte Marke. |

Außerdem geändert, ohne Bruch für Expo und Web: `events_fuer_mitglied` hat zwei Spalten mehr (`meine_forderung_cents`, `meine_forderung_status`), `register_push_token` hat `p_provider` (siehe [Push](#push)).

## Direkte Tabellenzugriffe – sollen RPC oder View werden

Neun Tabellen liest die App direkt über PostgREST, `members` schreibt sie auch direkt. Das bindet die App an Spaltennamen und RLS-Details und kostet beim Start mehrere Runden. Für die nativen Apps sind alle neun durch RPCs ersetzt (Phase A, Spalte „Ersatz“, siehe [oben](#neu-für-die-nativen-apps)). Die Expo-App liest bis zum Umstieg weiter direkt, deshalb bleiben Tabellen-Policies und -Grants bis zum Aufräumen danach.

| Tabelle | Zugriff heute (Wo, Spalten, Filter) | Vorschlag | Ersatz |
|---|---|---|---|
| `courts` | `ladePlaetze`: `id, name, short_name` · `active = true` · nach `position` | **soll RPC/View werden:** `courts_aktiv()` oder View `courts_app`, nur aktive Plätze | `courts_aktiv()` |
| `booking_types` | `ladeBuchungsarten`: `code, name, duration_minutes, requires_partner, min_players, max_players` · `active`, `applies_to = booking` · `ladeBlockungsarten`: `code, name` · `applies_to = blocking` · Verwaltung: `code, name, applies_to, active` · alle nach `sort_order` | **soll RPC/View werden:** `booking_types_aktiv(p_applies_to)`, oder gleich in `booking_settings` mitliefern | `booking_types_aktiv(p_applies_to)`; die Verwaltung (auch inaktive) bleibt vorerst |
| `members` | `ladeIchSelbst`/`ladeVeranstaltung`: `id` über `auth_user_id` · `ladeMeinenNamen`: `first_name, last_name` · `ladeMeineStammdaten`: 8 Stammdatenfelder + 3 Notfallkontakt · `ladeMeineMannschaft`: `is_team_captain, teams(name)` · **update** `speichereStammdaten` (nur geänderte Felder) und `speichereNotfallkontakt` | **soll RPC werden:** `mein_profil()` (alles Lesende in einem Zug), `save_my_profile(…)` und `save_my_notfallkontakt(…)`. Heute regeln Policy `members_update_own`, Spalten-Grant und Trigger `guard_member_self_update` das Schreiben. Der Trigger lehnt ab, sobald eine fremde Spalte im Patch steht. | `ich()`, `mein_profil()`, `save_my_profile(…)`, `save_my_notfallkontakt(…)` |
| `member_roles` | `ladeIchSelbst`: `role` · `member_id = ich` | **soll RPC werden:** `ich()` mit `member_id`, Name, Rollen und abgeleiteten Rechten (`admin`, `platz_rechte` wie `hatVolleRechte`/`hatPlatzRechte`). Ersetzt beim Start drei Abfragen. | `ich()` |
| `memberships` | `ladeMeineMitgliedschaft`: `number, started_on` · `status = active` · neueste | **soll RPC werden:** in `mein_profil()` | `mein_profil()` |
| `sepa_mandates` | `ladeMeinMandat`: `reference, signed_on, status, bank_accounts(holder, bank_name, iban_last4)` · `status = active` · neuestes | **soll RPC werden:** `mein_mandat()` | `mein_mandat()` |
| `charges` | `ladeVeranstaltung`: `amount_cents, status` · `event_id`, `member_id = ich`, `status ≠ waived` (bewusst nur die eigene, ein Admin sähe sonst alle) | **soll RPC/View werden:** als `meine_forderung_cents`/`meine_forderung_status` in `events_fuer_mitglied` | `events_fuer_mitglied` (`meine_forderung_cents`, `meine_forderung_status`) |
| `settings` | `ladeStornoFenster`: `drinks.void_window_minutes` (bei Fehler 15) · Verwaltung `ladeEinstellungen`: alle, gefiltert auf `booking.` | **soll RPC werden:** Stornofenster in `drink_menu` oder `booking_settings`; Öffnung und Schluss liefert `booking_settings` schon | `drink_void_window_minutes()`; Öffnung und Schluss aus `booking_settings`, die Verwaltung bleibt vorerst |
| `push_tokens` | `istAngemeldet`: `id` · `token = <token>`, `disabled_at is null` | **soll RPC werden:** `push_token_aktiv(p_token) → boolean`, im selben Zug wie `provider` | `push_token_aktiv(p_token)`; `provider` beim Anmelden über `register_push_token` |

Über Fremdschlüssel liest die App außerdem `teams` (bei `members`) und `bank_accounts` (bei `sepa_mandates`) mit. Beides liefern jetzt `mein_profil()` und `mein_mandat()`.

## Realtime

| Kanal | Abo | Wo | Verhalten |
|---|---|---|---|
| `plan-<datum>` | `postgres_changes`, Event `*`, Schema `public`, Tabelle `bookings` | `app/(tabs)/plaetze/index.tsx` | Jede Änderung lädt den Tagesplan neu, höchstens einmal pro Sekunde. Der Kanal filtert nicht nach Tag, RLS bestimmt, was ankommt. Nach dem Aufwachen der App wird ohnehin neu geladen, weil der Kanal im Hintergrund nichts sieht. Beim Wechsel des Tages wird der Kanal neu aufgebaut. |

Nativ: supabase-swift und supabase-kt haben Realtime mit derselben Semantik. Ein Widget abonniert nichts, es lädt im Zeitplan (Phase D).
