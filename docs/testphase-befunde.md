# Testphase – Befunde

Sammelstelle für Fehler, Lücken und Auffälligkeiten aus der Testphase (Start: Oktober 2026),
damit sie gebündelt abgearbeitet werden können. Neue Befunde unten in **Offen** ergänzen;
Erledigtes mit Commit nach **Behoben** verschieben.

Stand: 14.10.2026

Legende Priorität: **P1** blockiert Tester oder ist ein Sicherheitsthema · **P2** vor externen
Testern bzw. App Store · **P3** Komfort, Aufräumen.

---

## Offen

### Sicherheit und Betrieb

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O1 | P1 | Der **Resend-API-Key** und der **legacy Service-Role-Key** standen im Klartext im Chatverlauf. | Vor dem Echtbetrieb rotieren: in Resend einen neuen Key erzeugen, in den Supabase-Secrets (`RESEND_API_KEY`) und im Auth-SMTP-Passwort ersetzen. Supabase auf die neuen `sb_secret_…`-Keys umstellen, den Vault-Eintrag `notification_mails_key` ersetzen und den legacy JWT-Key deaktivieren. |
| O2 | P2 | Die **Supabase-Cloud läuft im Free-Tier** und schläft nach Inaktivität ein (HTTP 521). | Vor externen TestFlight-Testern und der Beta-Prüfung von Apple auf **Supabase Pro** umstellen, sonst scheitert die Prüfung. |

### iOS-App und TestFlight

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O5 | P1 | **Push-Mitteilungen funktionieren nicht.** EAS kann den APNs-Key mit dem App-Store-Connect-API-Schlüssel nicht anlegen; dafür ist ein Apple-Login nötig. | Im Apple-Developer-Portal unter *Keys* einen APNs-Key anlegen und mit `npx eas-cli credentials -p ios` hochladen. Danach die Edge Function `notification-pushes` deployen, `EXPO_ACCESS_TOKEN` und `PUSH_AKTIV` setzen und den Zeitplan einrichten (`supabase/snippets/benachrichtigungs_pushes_zeitplan.sql`). Zum Schluss einen neuen Build erstellen. |
| O6 | P2 | **Expo SDK 52 / React Native 0.76** bauen nur mit festgelegtem EAS-Image `macos-sequoia-15.6-xcode-26.2`. Mit `latest` (Xcode 26.6+) scheitert `fmt` (consteval-Fehler). | Expo-SDK-Upgrade einplanen, danach das Image wieder auf `latest` bzw. ein neueres stellen. |
| O7 | P2 | **TestFlight intern:** Bisher sind nur Lucas und Robin Tester. Moritz' Einladung zu App Store Connect ist noch offen (bis 12.10.). Chris, Wolfgang, Ladi und Maren fehlen. | Apple-IDs der restlichen Tester einsammeln, sie in App Store Connect einladen (Rolle Marketing, nur diese App) und nach Annahme in die Gruppe „Team (Expo)“ eintragen. |
| O8 | P2 | **App-Icon** ist ein Platzhalter (`apps/mobile/assets/icon.svg`). | Echtes Logo in hoher Auflösung beschaffen. |
| O9 | P2 | **Apple-Regel 5.1.1(v):** In der App gibt es keinen Weg, das Löschen des Kontos zu beantragen. | „Konto löschen beantragen“ im Konto-Tab ergänzen, etwa als Mitteilung an den Vorstand. |
| O10 | P2 | **Store-Eintrag** fehlt: Screenshots, Beschreibung, Altersfreigabe, App-Datenschutzangaben. | Vor der externen Beta bzw. dem App Store anlegen; Alternative: „Nicht gelistet“. |

### Verwaltung

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O24 | P1 | **Web erledigt (PR C, Onboarding im Web):** Aktion `einladung_erneut` in `member-login` (unbestätigter Login: `inviteUserByEmail` für den bestehenden Login; bestätigt, aber Onboarding offen: Recovery-Link; der Login bleibt), Lesen über `einladung_status` aus `auth.users`. Statusmarken „Einladung ausstehend“, „abgelaufen“ und „Onboarding offen“ in Übersicht, Zugang-Karte und Mitgliederliste (Filter „Onboarding offen“). **Offen:** dasselbe in der App-Verwaltung. Ursprünglicher Befund: **Abgelaufene Einladungen lassen sich aus der Verwaltung nicht neu senden, und Links gelten nur 1 Stunde.** Beobachtet am 11.10. bei Ladi: Er wurde am 09.10. eingeladen, beide Links waren abgelaufen. (1) In der Cloud gilt jeder Mail-Link (Einladung, „Passwort vergessen“) nur **1 Stunde** (`mailer_otp_exp = 3600`); möglich sind maximal 24 Stunden. (2) Beim Einladen wird der Login sofort mit dem Mitglied verknüpft. `member_login_state.hat_zugang` ist deshalb `true`, auch wenn die Einladung **nie angenommen** wurde. Die Verwaltung zeigt „App-Zugang aktiv“ und nur „Passwort zurücksetzen“, „Sperren“ und „Entfernen“. Der Knopf „Einladung verschicken“ erscheint nur ohne Login (`LoginKarte.tsx`, App `Zugang.tsx`), und `member-login/einladen` lehnt mit „hat bereits einen Zugang“ ab. | ~~`mailer_otp_exp` auf **86400**~~ (erledigt am 11.10.: Cloud per Management-API, lokal `otp_expiry` in `supabase/config.toml`). Hinweis „Der Link gilt 24 Stunden“ in `supabase/templates/einladung.html`. `member_login_state` um `angenommen` (bestätigt oder schon angemeldet) und `einladung_abgelaufen` erweitern. Neue Aktion `erneut_einladen` in `member-login`: `inviteUserByEmail` für den unbestätigten Login; bei Fehler löschen, neu einladen und neu verknüpfen, Admin-Rolle behalten. Web und App: Status **„Einladung ausstehend“** bzw. „abgelaufen“ statt „App-Zugang aktiv“, Knopf **„Einladung erneut senden“**, auch als Statusmarke in der Mitgliederübersicht. pgTAP-Tests für die neuen Felder. **Workaround bis dahin:** Neuversand über die Auth-Schnittstelle (so am 11.10. für Ladi gemacht). „Zugang entfernen“ und „Einladung verschicken“ gibt es seit der Login-Pflicht nicht mehr. |
| O23 | P2 | ~~**Die Admin-Rolle ist nicht auffindbar.**~~ **Erledigt:** Zeile „Rollen“ in der Übersicht (Web und App), alle Rollen in der Karte „Rollen und Zahler“. In der Mitgliederübersicht (Verwaltung → Mitglieder → Mitglied) gibt es keine Zeile für die Rolle. Der Schalter „Verwaltungsrechte“ sitzt in der Karte „Rolle und Zahler“ auf der Unterseite `?teil=mitgliedschaft`, und die erreicht man nur über die Zeile **„Mannschaft“** (`apps/web/src/components/MitgliedUebersicht.tsx:147`). | Im Abschnitt **Mitgliedschaft** eine eigene Zeile **„Rolle“** mit Hinweis „Mitglied“ bzw. „Admin“, die direkt zum Schalter führt. Die Rolle gehört zur Mitgliedschaft, nicht zur Mannschaft. Die Zeile „Mannschaft“ führt dann nur noch zur Mannschaft. Rolle und Zahler eventuell auf eine eigene Unterseite (`?teil=rolle`) trennen. In der App (`Mitgliedschaft.tsx`, Karte „Rolle und Zahler“) gleich ziehen. |

### Inhalte und Rechtliches

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O12 | P2 | **Datenschutz und Impressum** enthalten noch `[[Platzhalter]]`. | Echte Angaben des Vereins eintragen. Die Datenschutzerklärung muss auch Resend als Mail-Dienstleister und Supabase nennen. |
| O13 | P3 | Beschreibungen von Forderungen sind in ASCII („Getraenke …“, „Gastgebuehr …“). | Entweder beim Erzeugen echte Umlaute schreiben (SQL-Funktionen `charge_billing_period`, Gastgebühr), oder bewusst so lassen. Die Art-Marken machen sie lesbar. |

### Testdaten und Testkonten

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O14 | P3 | Jede Testperson steht **zweimal** in der Mitgliederliste (Mitglied und Admin), weil ein Login genau einem Mitglied gehört. Das zählt auch in den Statistiken mit. | Für die Testphase hinnehmen. Beim echten Import bekommt jeder Vorstand **ein** Konto mit Admin-Rolle. Optional ein Merkmal „Testkonto“ zum Filtern. |
| O15 | P3 | **GMX und T-Online** nehmen Plus-Adressen (`name+zusatz@…`) nicht zuverlässig an. Maren hat deshalb zwei echte Adressen bekommen. | Bei weiteren Testern ohne Gmail zwei echte Adressen nutzen. |
| O16 | P3 | Beim Aufräumen der 199 Seed-Mitglieder hat der **abgeschlossene Lastschriftlauf „Getränke“** Posten verloren (jetzt 45 Lastschriften, 185,80 €). Die Summen sind neu berechnet, der Lauf passt aber nicht mehr zur damals erzeugten Datei. | Testdaten, unkritisch. Vor dem Echtbetrieb ohnehin den gesamten Testbestand ersetzen. |
| O17 | P3 | Vor dem Echtbetrieb muss der **gesamte Testbestand** raus: 200 Seed-Mitglieder, Testkonten, Prüferkonto, Testläufe. Danach folgt der Import aus eBuSy. | Eigenes Aufräum-Skript; danach `tools/import` gegen die Cloud. |

### Tests und Entwicklung

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O19 | P3 | **Testlauf-Rückstände:** Ein früherer E2E-Lauf hat dem lokalen Testmitglied die Admin-Rolle gegeben. Danach schlugen Berechtigungstests fehl, bis `db:reset` lief. | Die betroffenen Verwaltungstests sollen vergebene Rollen wieder entziehen; oder vor jedem Lauf `db:reset`. |
| O20 | P3 | Die Abläufe „Einladung über den Server“ und „Passwort-vergessen-Link in Tab 2“ sind nur einmalig mit dem lokalen Mail-Postfach (Mailpit) geprüft, nicht als dauerhafte E2E-Tests. | Hilfsfunktion für Mailpit in `apps/web/e2e/hilfen.ts` und dauerhafte Tests daraus machen. |

### Noch nicht live geprüft

| # | Was | Wie prüfen |
|---|---|---|
| L1 | **Benachrichtigungs-Mail** über Resend an einen echten Empfänger, ausgelöst durch den Zeitplan. | Ein Testkonto als Mitspieler buchen. Innerhalb von 5 Minuten sollte eine Mail kommen, und Resend zeigt „Delivered“. |
| L2 | **„Passwort vergessen“** live mit einem Testkonto. | Auf der Anmeldeseite anfordern, Link öffnen, Passwort setzen. |
| L3 | **Admin setzt das Passwort zurück** über die Verwaltung (`member-login` → `passwort_zuruecksetzen`, impliziter Link). | Verwaltung → Mitglied → Zugang → Passwort zurücksetzen. |
| L4 | **Testadressen** in der Verwaltung: Passwort-Reset wird gesperrt, Anlegen und Einladen legen den Login still an (`createUser`, keine Mail). | Bei einem `@example.org`-Mitglied „Passwort zurücksetzen lassen“: Erwartet ist die Meldung „Das ist eine Testadresse“. Ein Mitglied mit `@example.org` anlegen: Erwartet ist „Zugang … eingerichtet“, und in Resend erscheint keine Mail. |
| L5 | **Buchung umsetzen** (`move_booking`, Mail und Push `booking_moved`). Bisher nur per pgTAP geprüft, die Oberfläche kommt mit einem eigenen PR. | Als Platzwart eine fremde Buchung auf einen freien Platz setzen. Bucher und Mitspieler bekommen „Deine Platzbuchung wurde verlegt“ mit altem und neuem Ort. |

---

## Behoben

| Befund | Ursache | Commit |
|---|---|---|
| Nach der Ankündigung stand die Kasse bis zum Fälligkeitstag auf „Vorabankündigung läuft – bis dahin ist nichts zu tun“, obwohl Lauf und Datei sofort erzeugt werden durften. Wie Läufe aufgebaut sind, war unklar. | Die 14 Tage galten in der Anzeige als eigener Schritt; sie sind nur eine Bedingung an den Abbuchungstag. Ankündigung und Lauf waren zwei Vorgänge mit je eigenem Datum, ein Lauf entstand leer. Neu: **Einzug** (`einzug_vorbereiten`) kündigt an und legt den Lauf mit genau diesen Forderungen in einem Schritt an; ohne gültiges Mandat keine Ankündigung. Kasse neu gegliedert: Start (Zu tun), Einzüge, Forderungen, Abrechnen, Einstellungen. | #35 und dieser PR |
| O11: Die App-Kasse war nur per Typecheck geprüft. | Hinfällig: Die App hat keine Kasse mehr, Kasse und Verwaltung der Finanzen gibt es nur im Web. | – |
| O25: Ein Kiosk-Konto ließ sich mit einem Mitglied verknüpfen. | `link_auth_user` prüfte nur `members`, nicht `kiosk_devices`. Neu: `private.login_pruefen` weist Kiosk-Konten ab und gilt für `link_auth_user` und `create_member` (Login-Pflicht, Migration `20261014105338`). Zusätzlich prüft `member-login` beim Übernehmen eines vorhandenen Kontos, dass es kein Kiosk-Konto ist. | dieser PR |
| O3: Eine geänderte E-Mail blieb in `auth.users` die alte. | Die Verwaltung änderte nur `members.email`. Neu: Aktion `email_aendern` in `member-login`. Sie ändert zuerst das Mitglied über `update_member` mit dem Token des Admins, danach den Login (`updateUserById`). Lehnt der Login ab, setzt sie das Mitglied auf die alte Adresse zurück. | dieser PR |
| O4: Löschen und Anonymisieren ließen das Konto in `auth.users` verwaist zurück. | Beide liefen als RPC direkt aus dem Web. Neu: Aktion `loeschen` (Art `loeschen` oder `anonymisieren`) in `member-login`. Erst die RPC mit dem Token des Admins, dann `deleteUser`. | dieser PR |
| O18: E2E-Tests mit Einladung scheiterten lokal (`member-login` → 503). | Der Container `supabase_edge_runtime` fehlte. Ein beendetes `supabase functions serve` entfernt ihn, und `supabase start` legt ihn bei laufendem Stack nicht neu an. Außerdem bindet er die Functions des Checkouts ein, der ihn gestartet hat. Neu: `apps/web/e2e/edge-functions.ts` als zweites `globalSetup`. Läuft die Runtime nicht oder mit den Functions eines anderen Checkouts, startet es `supabase functions serve` für die Dauer des Laufs und beendet es danach. Das gilt nur gegen den lokalen Stack. | dieser PR |
| O21: Eine Person konnte zur selben Zeit auf zwei Plätzen eingetragen sein. | Der Ausschluss `bookings_no_overlap` gilt nur pro Platz. Neu: `private.spielt_schon` prüft pro Person (Bucher oder Mitspieler, aktive Buchungen, halboffene Zeiträume). Aufgerufen in `create_booking` (Bucher und Mitspieler), `update_booking_players` (neu hinzukommende Mitspieler), `join_booking` und per Trigger beim Verschieben. Meldung „X spielt zu dieser Zeit schon auf Platz Y“. Entscheidung Serien/Training: Das sind Blockungen ohne Person (kein Bucher, keine Mitspieler). Sie werden nicht geprüft und `create_series`/`update_series` bleiben unverändert. Ein Training blockiert also keine Person, und Admin-Serien brechen nicht. Bestehende Doppelungen und der Import bleiben unberührt, geprüft wird nur, was neu dazukommt. | dieser PR |
| Bei „Offene Spiele“ war nicht zu erkennen, wer sucht (O22). | Die Karte zeigte nur Kürzel-Avatare bzw. den Namen klein in der Unterzeile. Jetzt Kopfzeile „Robin Heinzler sucht einen Mitspieler“ (bei eigener Buchung „Du suchst …“) und „Schon dabei: …“, in Web und App aus `offenesSpielText` in `@tcm/core`. | `fb5ee2a` (#16) |
| Die Glocke zeigte eine Zahl, die Liste war leer. | Admins sahen über RLS die ungelesenen Mitteilungen aller Mitglieder; Liste und „gelesen“ arbeiten nur mit den eigenen. Neue RPC `my_unread_notification_count`. | `c5a9950` |
| Arbeitsdienst, Gastgebühr, Pfand und Sonstiges kamen nie in einen Lastschriftlauf. | Die Oberfläche konnte nur Beiträge und Getränke ankündigen. Jetzt „Zur Ankündigung bereit“ für jede Art. | `30b0bef` |
| In der Kasse waren „Beitragslauf“ und Lastschriftlauf nicht zu unterscheiden, und die Art einer Forderung war unsichtbar. | Begriffe vermischt, keine Art-Marken. Neue Gliederung, Art-Marken, Art-Filter, Läufe nach Art. | `30b0bef` |
| Mails an Testadressen (`@example.org`, `.local`) hätten die Absenderreputation bei Resend gefährdet; 448 alte Mitteilungen warteten auf Versand. | Keine Sperre im Versand. `public.ist_testadresse` sperrt Benachrichtigungen, Einladungen und Passwort-Reset dorthin. | `72b1520` |
| Der Zeitplan für Benachrichtigungsmails wurde abgewiesen („Nicht angemeldet“). | Schlüsselumstellung bei Supabase: anderer gültiger Dienstschlüssel in der Funktionsumgebung als im Vault. Jetzt zählt die Rolle im Token. | `12f0f6c` |
| Jeder Einladungslink meldete „abgelaufen“. | Einladungen kommen im impliziten Verfahren (`#access_token`), der Browser-Client erwartete PKCE (`?code`). | `249fc0c` |
| iOS-Build 9 wurde von Apple abgelehnt (ITMS-90725, iOS 18.2 SDK). | EAS nahm für SDK 52 ein altes Image. Image fest auf Xcode 26.2 (`latest` scheitert an `fmt`). | `249fc0c` |
| „Passwort festlegen“ erschien im Menü des noch angemeldeten Kontos; ein fehlerhafter Link hätte das Passwort des falschen Kontos geändert. | Die Seite fiel auf die bestehende Sitzung zurück. Jetzt kein Rückgriff mehr, Anzeige des Kontos, Anmeldeseiten ohne Menü. | `da06083` |
| Mit einem Link für ein anderes Konto blieb die alte Sitzung bei Supabase gültig. | Die Sitzung wurde nur im Browser ersetzt. Jetzt Abmelden vor dem Wechsel, bei PKCE Beenden der alten Sitzung mit ihrem eigenen Token. | `20e5878` |
| Im selben Browser waren in zwei Tabs zwei Konten angemeldet. | Tabs teilen Cookies, zeigten aber das alte Konto weiter an. `KontoWaechter` plus BroadcastChannel melden andere Tabs ab. | `4312a37` |
| Nach der Abmeldung wegen Inaktivität stand auf der Anmeldeseite der falsche Grund. | Wettlauf zwischen Inaktivitätsprüfung und `KontoWaechter` im selben Tab. | `4312a37` |
| Deploy auf dem Server scheiterte mit „dubious ownership“. | Der Checkout gehört seit dem Server-Agenten dem Benutzer `claude`. Für root als `safe.directory` eingetragen. | Server-Konfiguration |
