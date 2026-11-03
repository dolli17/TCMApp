# Trainingsorga – Anforderungen

Stand: 03.11.2026 · Status: **geplant, nicht begonnen**

Diese Datei ist die Arbeitsliste für das Feature. Jede Anforderung hat eine ID (`TR-…`) und ein Häkchen. Wer eine Anforderung umsetzt, hakt sie im selben PR ab und schreibt die PR-Nummer dahinter. Ändert sich eine Entscheidung, gehört sie in den Abschnitt „Entscheidungen“ mit Datum.

Design: Canvas „TCM Training & Vereinsmeisterschaft“ (https://claude.ai/artifact/5tPsr7ifiRSpBzMMjYZm68). Für die Trainingsorga gelten die Boards Home, Meine Spiele, Verein, Gruppe – Training, Verwaltung › Sport › Training und Trainingsgruppe anlegen. Die Turnier-Boards gehören zur Vereinsmeisterschaft und sind hier nicht dabei.

> **Zeitpunkt:** Bis zum Prod-Go-Live gilt der Härtungsplan (nur Bugfix, Security, Testing, UI/UX). Die Umsetzung beginnt deshalb erst nach dem Go-Live, außer der Verein entscheidet ausdrücklich anders.

---

## 1. Ziel

Der Verein organisiert sein Training in der App statt über Listen und WhatsApp:

- Der Vorstand legt Trainingsgruppen an. Die Termine werden dabei als Platzserie gebucht.
- Mitglieder melden sich an, wenn die Gruppe das erlaubt, und sehen ihre Termine neben ihren Spielen.
- Trainer sehen ihre Gruppen, führen die Anwesenheit und sagen Termine ab. Die Teilnehmer erfahren es sofort.
- Die Trainingsgebühr wird zur Forderung und läuft über den normalen Einzug.

## 2. Nicht-Ziele (Version 1)

- **Vereinsmeisterschaft:** eigenes Feature, wird separat geplant.
- **Trainerabrechnung:** Stunden, Honorare und Verträge laufen außerhalb der App.
- **Einzelstunden beim Trainer buchen:** Privatstunden bucht der Trainer weiter als normale Buchung.
- **Hallentraining und Orte außerhalb der Anlage:** Ein Termin ohne Platz ist in Version 1 nicht vorgesehen.
- **Anteilige Gebühren:** Wer später einsteigt, zahlt die volle Gebühr. Der Vorstand kann eine Forderung von Hand erlassen.
- **Chat in der Gruppe:** Es gibt nur „Nachricht an alle“ als Push. Antworten sind nicht vorgesehen.

## 3. Entscheidungen

| Datum | Entscheidung |
|---|---|
| 03.11.2026 | Trainingsgruppen legen nur der **Vorstand und App Admins** an („volle Rechte“). Der Platzwart darf das nicht, Trainer auch nicht. |
| 03.11.2026 | Trainer pflegen **nur ihre eigenen Gruppen**: Teilnehmer, Anwesenheit, Absagen, Nachricht an alle. Struktur und Geld ändern sie nicht. |
| 03.11.2026 | Die **Gebühr** wird pro Gruppe und Saison als Forderung angelegt und per Lastschrift eingezogen. Eine Trainerabrechnung gibt es nicht. |
| 03.11.2026 | Die **Vereinsmeisterschaft** ist nicht Teil dieses Features. |
| 03.11.2026 | **Kein neuer Tab.** Gruppen stehen unter Verein › „Meine Gruppen“, Termine stehen in Plätze › Meine Spiele, und Hinweise erscheinen als Karte auf Start. Die Verwaltung bekommt den Bereich „Sport“ mit dem Segment Mannschaften · Training. |
| 03.11.2026 | Das Recht hängt **an der Funktion am Objekt** (Trainer *dieser* Gruppe), wie beim Mannschaftsführer. Das Rollenmodell bleibt unverändert. |

## 4. Begriffe

Diese Begriffe kommen nach `docs/begriffe.md`, sobald die erste Oberfläche erscheint.

| Begriff | Bedeutung | Nicht |
|---|---|---|
| **Trainingsgruppe** (kurz **Gruppe**) | Feste Gruppe mit Trainer, Wochentermin und Teilnehmern für eine Saison. | Kurs, Trainingskurs |
| **Art** | Jugend, Erwachsene, Mannschaft oder Kurs. Die Art dient nur zum Filtern und Anzeigen und gibt keine Rechte. | Typ, Kategorie |
| **Trainer** | Mitglied mit Trainer-Häkchen, das einer Gruppe zugeordnet ist. Eine Gruppe hat 1–2 Trainer. | Leiter, Coach |
| **Teilnehmer** | Mitglied, das in der Gruppe steht. | Schüler, Spieler |
| **Termin** | Ein einzelnes Training an einem Datum. Ein Termin kann mehrere Plätze belegen. | Einheit, Stunde |
| **Absagen** | Ein Termin fällt aus. Die Plätze werden frei, und die Teilnehmer bekommen eine Nachricht. | Stornieren (das bleibt bei Buchungen) |
| **Anwesenheit** | Wer bei einem Termin da war. | Teilnahme, Präsenz |
| **Anmeldung offen** | Mitglieder melden sich selbst an, bis zur Höchstzahl, danach auf die Warteliste. | Selbstanmeldung |

## 5. Rollen und Rechte

„Volle Rechte“ heißt Vorstand oder App Admin, wie in `begriffe.md`. Trainer und Teilnehmer sind keine Rollen, sondern **Funktionen an einer Gruppe**.

| Was | Volle Rechte | Platzwart | Trainer der Gruppe | Teilnehmer | Andere Mitglieder |
|---|:-:|:-:|:-:|:-:|:-:|
| Gruppe anlegen, Termine und Plätze ändern, beenden | ✓ | – | – | – | – |
| Trainer zuordnen | ✓ | – | – | – | – |
| Gebühr, Höchstzahl, Anmeldung offen/zu festlegen | ✓ | – | – | – | – |
| Alle Gruppen in der Verwaltung sehen | ✓ | ✓ nur lesen | – | – | – |
| Teilnehmer hinzufügen und entfernen | ✓ | – | ✓ | – | – |
| Warteliste nachrücken lassen | ✓ | – | ✓ | – | – |
| Einzelnen Termin absagen oder wieder ansetzen | ✓ | ✓ (Platz gesperrt) | ✓ | – | – |
| Anwesenheit führen | ✓ | – | ✓ | – | – |
| Nachricht an alle Teilnehmer | ✓ | – | ✓ | – | – |
| Teilnehmerliste mit Namen sehen | ✓ | – | ✓ | ⚠ offen (F-3) | – |
| Notfallkontakt bei Minderjährigen sehen | ✓ | – | ⚠ offen (F-2) | – | – |
| Gruppe in der Liste „Training“ finden und sich anmelden | – | – | – | – | ✓ wenn Anmeldung offen |
| Sich selbst abmelden | – | – | – | ✓ (Regeln TR-33) | – |
| Eigene Anwesenheit sehen | – | – | – | ✓ | – |
| Termine in der Belegung sehen | ✓ | ✓ | ✓ | ✓ | ✓ als Blockung mit Gruppenname |

Die Regeln dahinter:

- **R-1:** Jede Prüfung läuft in der Datenbank über eine Funktion: `private.ist_trainer_der_gruppe(gruppe)` (analog `private.ist_mannschaftsfuehrer`). Die Oberfläche blendet Knöpfe nur aus. Geschützt sind die Daten durch RLS und die RPCs.
- **R-2:** Trainer einer Gruppe kann nur werden, wer `members.is_trainer = true` hat. Nimmt der Vorstand das Häkchen weg, bleibt die Zuordnung bestehen. Die Verwaltung zeigt die Gruppe dann mit dem Hinweis „kein Trainer“, und das Recht erlischt sofort, weil die Prüfung beide Bedingungen verlangt.
- **R-3:** Ein Trainer sieht über seine Gruppe nur Name, Avatar, Anwesenheit und Anmeldestatus seiner Teilnehmer. Mehr nur nach F-2 und F-3.
- **R-4:** Alle Änderungen an Gruppen, Trainern und Teilnehmern kommen ins Verwaltungsprotokoll.

## 6. Datenmodell (Vorschlag)

Alles kommt als neue Migrationen, abwärtskompatibel. Neue Enum-Werte stehen jeweils in einer eigenen Datei vor der Migration, die sie benutzt.

```
training_groups
  id, name, kind ('jugend'|'erwachsene'|'mannschaft'|'kurs'), team_id → teams (nur bei 'mannschaft'),
  season_label ('2027'), weekday, start_time, end_time, valid_from, valid_to,
  registration_open bool, max_participants int null, registration_deadline timestamptz null,
  fee_cents int null, description text null,
  status ('active'|'ended'), ended_at, created_by, created_at, updated_at

training_group_courts      (group_id, court_id, series_id → booking_series)   -- eine Serie je Platz
training_group_trainers    (group_id, member_id, sort_order)                   -- 1–2 Trainer
training_group_members     (group_id, member_id, status 'registered'|'waitlisted'|'removed',
                            source 'self'|'trainer'|'admin'|'team', registered_at, waitlisted_at, removed_at)
training_sessions          (id, group_id, date, starts_at, ends_at, status 'planned'|'cancelled',
                            cancel_reason, cancelled_by, cancelled_at)          -- ein Datensatz je Termin
training_attendance        (session_id, member_id, present bool, marked_by, marked_at)
charges.training_group_id  → training_groups   + charge_kind 'training'
```

Begründung:

- **Termine als eigene Zeilen:** Eine Gruppe mit zwei Plätzen hat zwei Serien und damit zwei Buchungen je Datum. Absage, Anwesenheit und die Anzeige „Termin“ brauchen trotzdem genau ein Objekt pro Datum.
- **Die Serie bleibt die Wahrheit für die Plätze:** Die Gruppe nutzt `create_series`, `cancel_series_occurrence`, `update_series` und `end_series` mit. Die Konfliktprüfung und das Verdrängen gibt es dort schon.
- **Mannschaftstraining:** Bei der Art „Mannschaft“ ist der Kader nicht kopiert, sondern dynamisch. Teilnehmer ist, wer in der Mannschaft steht, plus Einträge mit `source = 'trainer'` oder `'admin'` (etwa Gastspieler aus einer anderen Mannschaft).

## 7. Anforderungen

Die Pakete bauen aufeinander auf und werden in dieser Reihenfolge umgesetzt. Jedes Paket ist ein PR, oder eine Spur je Plattform. Erst die Datenbank, dann Web, dann die Apps.

### Paket A – Datenbank-Fundament

- [ ] **TR-01** Tabellen aus Abschnitt 6 mit Constraints:
  - Höchstzahl ≥ 1.
  - Gebühr 0–1000 €.
  - Ende nach Beginn.
  - `team_id` nur bei der Art „Mannschaft“.
  - Höchstens 2 Trainer je Gruppe.
  - Je Mitglied und Gruppe höchstens ein Eintrag.
- [ ] **TR-02** Buchungsart `training` absichern: Heute steht sie nur in `supabase/seed.sql`. Die Migration legt sie mit `on conflict (code) do nothing` an (Blockung, zählt nicht aufs Kontingent).
- [ ] **TR-03** `private.ist_trainer_der_gruppe(group_id)`: Das aktuelle Mitglied steht in `training_group_trainers` dieser Gruppe **und** hat `is_trainer = true`.
- [ ] **TR-04** `private.ist_teilnehmer(group_id)` liefert `true` für einen registrierten Eintrag oder bei einer Mannschaftsgruppe für die passende `team_id`.
- [ ] **TR-05** RLS auf allen neuen Tabellen:
  - Volle Rechte sehen alles; der Platzwart liest `training_groups` und `training_sessions`.
  - Trainer sehen ihre Gruppen samt Teilnehmern und Anwesenheit.
  - Teilnehmer sehen ihre Gruppe, ihre Termine und die eigene Anwesenheit.
  - Andere Mitglieder sehen nur Gruppen mit offener Anmeldung (ohne Teilnehmer).
  - Geschrieben wird nur über die RPCs.
- [ ] **TR-06** Archivieren oder Anonymisieren eines Mitglieds trägt es aus allen Gruppen aus und entfernt es als Trainer (Trigger wie `leave_team_on_archive`).
- [ ] **TR-07** pgTAP-Tests: je Rolle und Funktion ein erlaubter und ein verbotener Zugriff (Matrix aus Abschnitt 5).

### Paket B – Gruppe anlegen und verwalten (RPCs, volle Rechte)

- [ ] **TR-10** `training_group_preview(...)` liefert ohne zu schreiben:
  - die Zahl der Termine,
  - die Konflikte je Platz (Datum, Uhrzeit, Platz, Art, Name des Buchenden),
  - Daten, die auf Feiertage oder gesperrte Zeiträume fallen.
- [ ] **TR-11** `training_group_create(...)` legt in einer Transaktion an:
  - die Gruppe,
  - eine Serie je Platz über die bestehende Serienlogik,
  - die Termine,
  - die Trainer.

  Konflikte werden nur mit `p_displace = true` verdrängt. Wer verdrängt wird, bekommt die bestehende Storno-Benachrichtigung.
- [ ] **TR-12** `training_group_update(...)`:
  - **Name, Beschreibung, Trainer, Anmeldung, Höchstzahl:** ändern sich sofort.
  - **Wochentag, Uhrzeit, Plätze:** wirken ab einem Stichtag und nur auf künftige Termine; vergangene Termine und ihre Anwesenheit bleiben.
- [ ] **TR-13** `training_group_end(group_id, ab)`:
  - beendet die Serien ab dem Datum,
  - löscht künftige Termine samt Blockungen,
  - setzt `status = 'ended'`,
  - benachrichtigt die Teilnehmer.

  Vergangenes bleibt sichtbar (Archiv).
- [ ] **TR-14** Pausen: Der Vorstand kann einzelne Daten oder einen Zeitraum ausnehmen (z. B. Sommerferien). Das setzt die Termine dort auf „abgesagt“ mit Grund „Pause“, ohne Einzelbenachrichtigung.
- [ ] **TR-15** Trainer zuordnen: Zur Auswahl stehen nur Mitglieder mit Trainer-Häkchen, höchstens 2. Der Trainer bekommt eine Nachricht „Du leitest jetzt …“.
- [ ] **TR-16** Gruppe kopieren für die neue Saison: Name, Art, Trainer, Wochentag, Uhrzeit und Plätze werden übernommen, die Teilnehmer wahlweise auch.

### Paket C – Teilnehmer und Anmeldung

- [ ] **TR-20** `training_group_add_member(group, member)` steht Trainern und vollen Rechten offen; das Mitglied bekommt eine Nachricht „Du bist jetzt in …“. Ist die Gruppe voll, gibt es eine Warnung, die sich mit Bestätigung übergehen lässt.
- [ ] **TR-21** `training_group_remove_member(...)` steht Trainern und vollen Rechten offen und ist mit einer Nachricht verbunden. Eine bestehende Forderung bleibt (siehe TR-42).
- [ ] **TR-22** Selbst anmelden (`training_group_register`) geht nur bei offener Anmeldung und vor dem Anmeldeschluss. Bis zur Höchstzahl gilt der Status `registered`, danach `waitlisted` nach Zeitstempel, wie bei Veranstaltungen.
- [ ] **TR-23** Nachrücken: Wird ein Platz frei, rückt der Erste der Warteliste **automatisch** nach und bekommt eine Nachricht. Trainer und volle Rechte können auch jemanden von Hand nachrücken lassen.
- [ ] **TR-24** Mannschaftsgruppen: Der Kader ist automatisch dabei, ohne Anmeldung und ohne Höchstzahl. Wer die Mannschaft verlässt, ist nicht mehr Teilnehmer.
- [ ] **TR-25** Ein Mitglied darf in mehreren Gruppen sein. Überschneiden sich zwei Gruppen zeitlich, zeigt die Anmeldung einen Hinweis, verhindert sie aber nicht.

### Paket D – Termine, Absage, Anwesenheit

- [ ] **TR-30** Einen Termin absagen (`training_session_cancel`) dürfen der Trainer, volle Rechte und der Platzwart. Dazu gehört ein Grund mit Vorschlägen (Regen, Platz gesperrt, Trainer krank, Sonstiges).
  - Die Blockungen dieses Datums werden storniert, die Plätze sind sofort frei.
  - Alle Teilnehmer bekommen eine Push-Nachricht mit dem Grund.
- [ ] **TR-31** Einen abgesagten Termin wieder ansetzen geht nur, solange die Plätze frei sind. Sonst kommt ein Fehler mit der Buchung, die im Weg ist.
- [ ] **TR-32** Abmelden für einen einzelnen Termin („Ich kann nicht“): Der Teilnehmer meldet sich nur für dieses Datum ab, und der Trainer sieht es in der Anwesenheit vorbelegt.
- [ ] **TR-33** Sich ganz aus der Gruppe abmelden geht nur bei offener Anmeldung und vor dem ersten Termin. Danach geht es nur über den Trainer oder den Vorstand, weil die Gebühr dann fällig ist.
- [ ] **TR-34** Anwesenheit führen (`training_attendance_set`): Erlaubt ist das ab Terminbeginn bis 14 Tage danach. Volle Rechte dürfen auch später. Vorbelegt ist „da“, außer bei einer Abmeldung (TR-32).
- [ ] **TR-35** Anwesenheitsübersicht je Gruppe: Teilnehmer × Termine, mit Quote je Teilnehmer. Der Trainer sieht das in der App, der Vorstand in der Verwaltung, dort als CSV-Export.
- [ ] **TR-36** Nachricht an alle (`training_group_message`): Trainer und volle Rechte schreiben einen Text mit höchstens 500 Zeichen, der als Push und Mitteilung an alle Teilnehmer geht. Gespeichert wird er nur in der Mitteilungsliste der Empfänger.

### Paket E – Gebühren

- [ ] **TR-40** Neuer `charge_kind`-Wert `training` (in einer eigenen Migration) und eine Spalte `charges.training_group_id`. Je Mitglied und Gruppe gibt es höchstens eine Forderung, die nicht erlassen ist.
- [ ] **TR-41** Hat eine Gruppe eine Gebühr, entsteht die Forderung, sobald ein Teilnehmer **registered** wird, egal auf welchem Weg. Bei Mannschaftsgruppen gibt es keine Forderung, außer der Vorstand setzt dort ausdrücklich eine Gebühr. Die Fälligkeit ist der erste Termin.
- [ ] **TR-42** Wer vor dem ersten Termin entfernt wird oder sich abmeldet, dessen offene Forderung wird automatisch erlassen. Danach bleibt sie, und der Vorstand kann sie von Hand erlassen.
- [ ] **TR-43** Ändert sich die Gebühr nachträglich, bleiben bestehende Forderungen gleich. Die Verwaltung zeigt dann den Hinweis „X Forderungen haben den alten Betrag“.
- [ ] **TR-44** Im Einzug lässt sich „Training“ als Art auswählen (`einzug_forderungen`), so wie heute „Veranstaltung“.
- [ ] **TR-45** Im Konto des Mitglieds steht die Forderung als „Training · Jugend U12 (2027)“.

### Paket F – Verwaltung im Web (`/admin/sport`)

- [ ] **TR-50** Neuer Eintrag „Sport“ in der Seitenleiste der Verwaltung mit dem Segment **Mannschaften · Training**.
  - Die Mannschaften ziehen aus Mitglieder hierher um; die alte URL leitet weiter.
  - Den Eintrag sehen nur volle Rechte und der Platzwart (der nur lesend).
- [ ] **TR-51** Liste der Trainingsgruppen links mit 420 px, das Detail rechts.
  - Filter: Jugend, Erwachsene, Mannschaften, Kurse, Beendet.
  - Jede Zeile trägt genau einen Hinweis, z. B. „voll · 3 warten“, „Anmeldung offen“ oder in Rot „kein Trainer“.
- [ ] **TR-52** Das Detail hat die Abschnitte Termine (nächste 5 und abgesagte), Leitung & Teilnehmer, Anmeldung & Geld und Anwesenheit. Am Ende steht in Rot „Gruppe beenden“.
- [ ] **TR-53** Das Blatt „Trainingsgruppe anlegen“ folgt dem Board `AdminGruppeAnlegen`.
  - Die Art ist als Chips wählbar.
  - Der Knopf nennt das Ergebnis, etwa „Gruppe anlegen · 24 Termine“.
  - Ein gestrichelter Hinweis zeigt die Konflikte, die die Vorschau aus TR-10 liefert.
- [ ] **TR-54** Die Übersicht der Verwaltung bekommt eine Karte „Braucht dich“, wenn eine Gruppe keinen Trainer hat oder eine Warteliste mit freiem Platz existiert.
- [ ] **TR-55** Gruppen mit beendeten Saisons stehen unter „Beendet“, nur lesend und mit dem Knopf „Für 2028 kopieren“ (TR-16).

### Paket G – Mitglieder und Trainer im Web (`/verein`, `/plan`, `/`)

- [ ] **TR-60** Verein › **Meine Gruppen** stehen oben, erst die Mannschaft, dann die Trainingsgruppen. Wer keine Gruppe hat, sieht den Abschnitt nicht. Darunter steht ein Link „Training im Verein“ zur Liste der offenen Gruppen.
- [ ] **TR-61** Die Gruppenseite für Teilnehmer zeigt:
  - nächster Termin,
  - Trainer,
  - Termine mit Absagen,
  - eigene Anwesenheit,
  - „Ich kann nicht“ (TR-32),
  - „Aus der Gruppe abmelden“ (TR-33).
- [ ] **TR-62** Die Gruppenseite für Trainer folgt dem Board `GruppeTraining`:
  - Anwesenheit mit Schaltern,
  - Termin absagen,
  - Nachricht an alle,
  - Teilnehmer hinzufügen und entfernen,
  - Warteliste.
- [ ] **TR-63** Plätze › Meine Spiele zeigt Trainingstermine mit dem Chip „Training“ in derselben Liste. Ein abgesagter Termin ist durchgestrichen und trägt den Grund.
- [ ] **TR-64** In der Belegung steht die Trainingsblockung mit dem Gruppennamen. Ein Klick führt Teilnehmer und Trainer zur Gruppe, andere sehen nur den Namen.
- [ ] **TR-65** Auf Start erscheint die Karte „Für dich“:
  - **Für Teilnehmer:** „Heute 17:00 Training“ und „Training heute abgesagt“.
  - **Für Trainer:** „Anwesenheit eintragen“ nach einem Termin ohne Einträge.
- [ ] **TR-66** Die Liste „Training im Verein“ zeigt Gruppen mit offener Anmeldung: Art, Tag, Uhrzeit, Trainer, freie Plätze und Gebühr. Daneben steht der Knopf „Anmelden“ oder „Auf die Warteliste“.

### Paket H – iOS (`apps/ios`)

- [ ] **TR-70** Gleicher Umfang wie Paket G: Meine Gruppen, Gruppenseite für Teilnehmer und Trainer, Meine Spiele, Start-Karte, Training im Verein.
- [ ] **TR-71** Die Verwaltung in der App bleibt bei Plätze & Serien. Trainingsserien erscheinen dort nur lesend mit dem Hinweis „gehört zu Gruppe X“, damit niemand die Serie an der Gruppe vorbei ändert.

### Paket I – Android (`apps/android`)

- [ ] **TR-80** Gleicher Umfang wie TR-70.
- [ ] **TR-81** Gleiches Verhalten wie TR-71.

### Paket J – Benachrichtigungen

- [ ] **TR-90** Neue Arten in `BENACHRICHTIGUNGS_ARTEN` mit deutschen Namen; alle gehen per Push und Mitteilung, nicht per Mail:

  | Art | Wann |
  |---|---|
  | `training_added` | Trainer oder Vorstand trägt dich in eine Gruppe ein. |
  | `training_registered` | Deine Anmeldung ist durch. |
  | `training_waitlisted` | Du stehst auf der Warteliste. |
  | `training_promoted` | Du bist von der Warteliste nachgerückt. |
  | `training_removed` | Du bist aus der Gruppe ausgetragen. |
  | `training_cancelled` | Ein Termin fällt aus, mit Grund. |
  | `training_message` | Nachricht an alle. |
  | `training_group_ended` | Die Gruppe ist beendet. |
  | `training_trainer_assigned` | Du leitest jetzt eine Gruppe. |
- [ ] **TR-91** Abschaltbar sind nur `training_message`; Absagen kommen immer.
- [ ] **TR-92** Erinnerung am Trainingstag ist **nicht** in Version 1 (siehe F-5).

### Paket K – Qualität

- [ ] **TR-95** pgTAP für alle RPCs: Rechte, Warteliste, Nachrücken, Forderung entsteht und wird erlassen, Absage storniert Blockungen.
- [ ] **TR-96** E2E (lokal, `pnpm e2e`):
  - Vorstand legt eine Gruppe an.
  - Mitglied meldet sich an.
  - Trainer sagt ab und führt die Anwesenheit.
  - Die Forderung erscheint im Konto.
- [ ] **TR-97** Neue Begriffe in `docs/begriffe.md`, Einstellungstexte in `packages/core`.

## 8. Randfälle

| Fall | Verhalten |
|---|---|
| Trainer ist gleichzeitig Teilnehmer einer anderen Gruppe | Erlaubt. Die Rechte gelten je Gruppe. |
| Trainer verliert das Trainer-Häkchen | Die Zuordnung bleibt, das Recht erlischt, und die Verwaltung zeigt „kein Trainer“ (R-2). |
| Platz wird gesperrt (Platzwart) | Der Platzwart sagt betroffene Termine über TR-30 ab, mit dem Grund „Platz gesperrt“. |
| Zwei Gruppen auf demselben Platz zur selben Zeit | Das verhindert die bestehende Konfliktprüfung der Serie. |
| Mitglied ist minderjährig | Es hat ein eigenes Konto, zahlt seine Forderung selbst (Mandat) und meldet sich selbst an. Ob die Eltern mitlesen: F-1. |
| Gruppe ohne Gebühr | Es entstehen keine Forderungen, und die Anmeldung läuft genauso. |
| Gruppe mit Gebühr, Teilnehmer ohne Mandat | Die Forderung entsteht trotzdem und wird wie andere ohne Mandat behandelt (Überweisung). |
| Termin liegt in der Vergangenheit | Absagen ist nicht mehr möglich, nur noch die Anwesenheit. |
| Serie wird in der Platzverwaltung gelöscht | Das verhindert die Datenbank: Serien mit `training_group_courts` ändert nur die Gruppe (TR-71). |
| Saisonende | Die Gruppe endet mit `valid_to` von allein und gilt dann als „beendet“, ohne Nachricht. |

## 9. Offene Fragen

Diese Fragen müssen vor dem jeweiligen Paket geklärt sein.

| ID | Frage | Betrifft | Vorschlag |
|---|---|---|---|
| F-1 | Sollen Eltern das Training ihrer Kinder sehen oder für sie handeln? Heute gibt es nur `guardian_name/email/phone` am Kind, keine Verknüpfung zwischen Konten. | C, G | Version 1: Das Kind handelt selbst. Absagen gehen zusätzlich per Mail an `guardian_email`, wenn eine da ist. |
| F-2 | Darf der Trainer bei Minderjährigen die Telefonnummer der Erziehungsberechtigten sehen (Notfall)? | A, G | Ja, nur für Teilnehmer seiner Jugendgruppen, mit Hinweis in der Datenschutzerklärung. |
| F-3 | Sehen Teilnehmer, wer noch in ihrer Gruppe ist? | A, G | Ja, nur Vorname und Nachname. |
| F-4 | Gilt die Gebühr pro Saison oder pro Halbjahr, und gibt es Geschwister- oder Mannschaftsrabatte? | E | Pro Saison und ohne Rabatt. Rabatt ist Handarbeit (Forderung ändern). |
| F-5 | Soll es eine Erinnerung am Trainingstag geben? | J | Nein in Version 1, weil es zu viele Pushs wären. |
| F-6 | Mit welcher Saison startet die Trainingsorga, und gibt es bestehende Gruppen zu übernehmen? Zum Beispiel stammen die 134 Trainings-Blockungen aus eBuSy. | B | Neu anlegen. Die alten Serien beendet der Vorstand von Hand. |
| F-7 | Startet das Feature vor oder nach dem Prod-Go-Live? | alle | Nach dem Go-Live (Härtungsplan). |

## 10. Umsetzungsreihenfolge

1. Paket A und Paket J (nur die Enum-Werte und `BENACHRICHTIGUNGS_ARTEN`) bilden einen PR. Danach folgt ein zweiter PR mit B, C, D und E (RPCs und pgTAP).
2. Danach Paket F (Verwaltung) und Paket G (Mitglieder Web) parallel als zwei herdr-Spuren.
3. Danach Paket H und Paket I parallel.
4. Paket K läuft in jedem PR mit. Die E2E-Strecke aus TR-96 kommt mit Paket G.

Für jedes Paket gilt `pnpm verify` grün und ein eigener PR auf einem Branch `feature/training-…`.
