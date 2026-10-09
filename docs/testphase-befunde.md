# Testphase – Befunde

Sammelstelle für Fehler, Lücken und Auffälligkeiten aus der Testphase (Start: Oktober 2026),
damit sie gebündelt abgearbeitet werden können. Neue Befunde unten in **Offen** ergänzen;
Erledigtes mit Commit nach **Behoben** verschieben.

Stand: 09.10.2026

Legende Priorität: **P1** blockiert Tester oder ist ein Sicherheitsthema · **P2** vor externen
Testern bzw. App Store · **P3** Komfort, Aufräumen.

---

## Offen

### Sicherheit und Betrieb

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O1 | P1 | Der **Resend-API-Key** und der **legacy Service-Role-Key** standen im Klartext im Chatverlauf. | Vor dem Echtbetrieb rotieren: in Resend einen neuen Key erzeugen, in den Supabase-Secrets (`RESEND_API_KEY`) und im Auth-SMTP-Passwort ersetzen. Supabase auf die neuen `sb_secret_…`-Keys umstellen, den Vault-Eintrag `notification_mails_key` ersetzen und den legacy JWT-Key deaktivieren. |
| O2 | P2 | Die **Supabase-Cloud läuft im Free-Tier** und schläft nach Inaktivität ein (HTTP 521). | Vor externen TestFlight-Testern und der Beta-Prüfung von Apple auf **Supabase Pro** umstellen, sonst scheitert die Prüfung. |
| O3 | P3 | Wird die E-Mail eines Mitglieds geändert, bleibt die Adresse in `auth.users` die alte. Es gibt keine Synchronisierung. | Bei Adressänderung auch den Login nachziehen (Admin-API `updateUserById`), oder zumindest in der Verwaltung darauf hinweisen. |
| O4 | P3 | `delete_member` und `anonymize_member` lösen nur die Verknüpfung; das Konto in `auth.users` bleibt verwaist bestehen. | Beim Löschen bzw. Anonymisieren den Login über `member-login` mitlöschen. |

### iOS-App und TestFlight

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O5 | P1 | **Push-Mitteilungen funktionieren nicht.** EAS kann den APNs-Key mit dem App-Store-Connect-API-Schlüssel nicht anlegen; dafür ist ein Apple-Login nötig. | Im Apple-Developer-Portal unter *Keys* einen APNs-Key anlegen und mit `npx eas-cli credentials -p ios` hochladen. Danach die Edge Function `notification-pushes` deployen, `EXPO_ACCESS_TOKEN` und `PUSH_AKTIV` setzen und den Zeitplan einrichten (`supabase/snippets/benachrichtigungs_pushes_zeitplan.sql`). Zum Schluss einen neuen Build erstellen. |
| O6 | P2 | **Expo SDK 52 / React Native 0.76** bauen nur mit festgelegtem EAS-Image `macos-sequoia-15.6-xcode-26.2`. Mit `latest` (Xcode 26.6+) scheitert `fmt` (consteval-Fehler). | Expo-SDK-Upgrade einplanen, danach das Image wieder auf `latest` bzw. ein neueres stellen. |
| O7 | P2 | **TestFlight intern:** Bisher sind nur Lucas und Robin Tester. Moritz' Einladung zu App Store Connect ist noch offen (bis 12.10.). Chris, Wolfgang, Ladi und Maren fehlen. | Apple-IDs der restlichen Tester einsammeln, sie in App Store Connect einladen (Rolle Marketing, nur diese App) und nach Annahme in die Gruppe „Team (Expo)“ eintragen. |
| O8 | P2 | **App-Icon** ist ein Platzhalter (`apps/mobile/assets/icon.svg`). | Echtes Logo in hoher Auflösung beschaffen. |
| O9 | P2 | **Apple-Regel 5.1.1(v):** In der App gibt es keinen Weg, das Löschen des Kontos zu beantragen. | „Konto löschen beantragen“ im Konto-Tab ergänzen, etwa als Mitteilung an den Vorstand. |
| O10 | P2 | **Store-Eintrag** fehlt: Screenshots, Beschreibung, Altersfreigabe, App-Datenschutzangaben. | Vor der externen Beta bzw. dem App Store anlegen; Alternative: „Nicht gelistet“. |
| O11 | P3 | Die App-Kasse (neue Gliederung, Art-Marken, Ankündigen nach Art) ist **nur per Typecheck und Unit-Tests** geprüft, nicht auf einem Gerät angesehen. | In TestFlight durchklicken. |

### Buchen und Plätze

| # | Prio | Befund | Was zu tun ist |
|---|---|---|---|
| O21 | P1 | **Eine Person kann zur selben Zeit auf zwei Plätzen eingetragen sein.** Beobachtet am 09.10.: Lucas steht heute um 14:00 auf Platz 2 (gebucht von Robin, Lucas als Mitspieler) **und** auf Platz 1 (gebucht von Lucas, mit Robin). Beide spielen damit doppelt zur selben Zeit. Ursache: Die Datenbank verhindert Überschneidungen nur **pro Platz** (Ausschlussregel `court_id, slot` in `20260803100400_bookings.sql`). Eine Prüfung **pro Person** fehlt in `create_booking`, beim Mitspieler-Hinzufügen und bei „Mitspielen“ (`20260807100300_mitspieler_gesucht.sql`). Die Grenze `booking.max_open_bookings` begrenzt nur die Anzahl, nicht die Zeit. | Beim Anlegen einer Buchung, beim Hinzufügen von Mitspielern, beim Mitspielen in offenen Spielen und beim Verschieben prüfen, ob Bucher oder Mitspieler im selben Zeitraum schon eine aktive Buchung haben. Dann abweisen mit „X spielt zu dieser Zeit schon auf Platz Y“. Am besten zentral in einer Funktion `private.spielt_schon(member_id, slot)`, dazu pgTAP-Tests. Offen ist noch, wie Serien bzw. Training mit Einzelbuchungen derselben Person zusammenspielen. |
| O22 | P2 | **Bei „Offene Spiele“ ist nicht zu erkennen, wer sucht.** Die Karte zeigt nur das Kürzel „RH“ als Avatar. Man muss raten, mit wem man spielen würde. | Den Namen des Suchenden prominent zeigen, etwa „**Robin Heinzler** sucht 1 Mitspieler“ als Kopfzeile der Karte, plus Namen der schon Eingetragenen. In der App (`Meine & offene Spiele`) und im Web gleich. |

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
| O18 | P3 | Zwei E2E-Tests in `mitglieder.spec.ts` (Einladung, Mitgliedsantrag annehmen) scheitern lokal, weil der Edge-Functions-Container nicht läuft (`member-login` → 503). | Lokal `supabase functions serve` mitstarten oder die Tests überspringen, wenn die Funktion fehlt. |
| O19 | P3 | **Testlauf-Rückstände:** Ein früherer E2E-Lauf hat dem lokalen Testmitglied die Admin-Rolle gegeben. Danach schlugen Berechtigungstests fehl, bis `db:reset` lief. | Die betroffenen Verwaltungstests sollen vergebene Rollen wieder entziehen; oder vor jedem Lauf `db:reset`. |
| O20 | P3 | Die Abläufe „Einladung über den Server“ und „Passwort-vergessen-Link in Tab 2“ sind nur einmalig mit dem lokalen Mail-Postfach (Mailpit) geprüft, nicht als dauerhafte E2E-Tests. | Hilfsfunktion für Mailpit in `apps/web/e2e/hilfen.ts` und dauerhafte Tests daraus machen. |

### Noch nicht live geprüft

| # | Was | Wie prüfen |
|---|---|---|
| L1 | **Benachrichtigungs-Mail** über Resend an einen echten Empfänger, ausgelöst durch den Zeitplan. | Ein Testkonto als Mitspieler buchen. Innerhalb von 5 Minuten sollte eine Mail kommen, und Resend zeigt „Delivered“. |
| L2 | **„Passwort vergessen“** live mit einem Testkonto. | Auf der Anmeldeseite anfordern, Link öffnen, Passwort setzen. |
| L3 | **Admin setzt das Passwort zurück** über die Verwaltung (`member-login` → `passwort_zuruecksetzen`, impliziter Link). | Verwaltung → Mitglied → Zugang → Passwort zurücksetzen. |
| L4 | **Sperre für Testadressen** bei Einladung und Passwort-Reset in der Verwaltung. | Bei einem `@example.org`-Mitglied „Einladung verschicken“. Erwartet ist die Meldung „Das ist eine Testadresse“. |

---

## Behoben

| Befund | Ursache | Commit |
|---|---|---|
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
