# iOS-App bauen und in TestFlight bringen

Anleitung für die Person, die den Apple-Developer-Account hat. Alles Weitere –
Expo-Projekt, Icon, Build-Konfiguration – liegt im Repo bereit. Du brauchst
**kein Xcode, keine `.env` und keinen lokalen Build**: EAS baut in der Cloud
und lädt das Ergebnis zu Apple hoch.

## Voraussetzungen

- Node ≥ 20 und pnpm (`corepack enable pnpm`)
- `npm install -g eas-cli`
- Ein Expo-Konto (kostenlos, expo.dev), das als **Mitglied im Expo-Projekt des
  Vereins** eingetragen ist – die Einladung kommt von Lucas. Das Projekt gehört
  dem Verein, damit Push-Schlüssel und Build-Historie dort bleiben.
- Apple-Developer-Account mit Rolle *Account Holder* oder *Admin*

## Einmalig

```bash
git clone git@github.com:dolli17/TCMApp.git
cd TCMApp
pnpm install --frozen-lockfile
cd apps/mobile
eas login
```

### 1. Build

```bash
eas build --profile production --platform ios
```

EAS fragt beim ersten Mal nacheinander – so antworten:

| Frage | Antwort |
|---|---|
| Apple-Login (Apple-ID + Passwort, 2FA-Code) | dein Developer-Konto |
| Team auswählen | dein Team |
| Bundle Identifier `de.tcmuckensturm.app` bei Apple registrieren? | **Ja** |
| Distribution Certificate erzeugen? | **Ja** (EAS verwahrt es) |
| Provisioning Profile erzeugen? | **Ja** |
| Push Notifications einrichten / APNs-Key erzeugen? | **Ja** – sonst kommen keine Push-Nachrichten an |

Der Build dauert 10–20 Minuten; der Link zum Fortschritt steht im Terminal.

### 2. App in App Store Connect anlegen

Unter <https://appstoreconnect.apple.com> → *Meine Apps* → *+* → *Neue App*:

| Feld | Wert |
|---|---|
| Plattform | iOS |
| Name | TC Muckensturm |
| Primärsprache | Deutsch |
| Bundle-ID | `de.tcmuckensturm.app` (aus Schritt 1) |
| SKU | `tcm-app` |
| Zugriff | Vollzugriff |

Danach unter *App-Informationen* die **Datenschutz-URL** eintragen:
`https://app.tennisclub-muckensturm.de/datenschutz`.

### 3. Hochladen

```bash
eas submit --platform ios --latest
```

Fragt Apple-ID, App Store Connect App-ID (steht in App Store Connect unter
*App-Informationen → Apple-ID*) und Team. EAS schreibt die Werte in `eas.json`
unter `submit.production.ios` – **diese Änderung committen und pushen**, dann
fragt es beim nächsten Mal nicht mehr.

### 4. TestFlight

- Export-Compliance ist per `ITSAppUsesNonExemptEncryption = false` in der App
  beantwortet; Apple fragt nicht nach.
- **Interne Tester** (bis 100 Personen mit App-Store-Connect-Zugang): sofort
  verfügbar, keine Prüfung durch Apple.
- **Externe Tester** (per E-Mail-Einladung oder öffentlichem Link): Apple prüft
  den ersten Build (*Beta App Review*, meist 1–2 Tage). Dafür unter *Testinformationen*
  ein Testlogin hinterlegen – kommt von Lucas.

## Bei jedem weiteren Build

```bash
git pull
pnpm install --frozen-lockfile
cd apps/mobile
eas build --profile production --platform ios
eas submit --platform ios --latest
```

Die Build-Nummer zählt EAS automatisch hoch (`autoIncrement`). Die sichtbare
Versionsnummer steht in `app.json` unter `expo.version` und wird im Repo
gepflegt.

## Prüfen vor dem Freigeben

Die Logik in `src/lib` ist mit Vitest abgedeckt (`pnpm --filter @tcm/mobile test`).
Was nur auf einem echten Gerät sichtbar wird, prüft ein Mensch – einmal je
Build, bevor er an externe Tester geht. Mit einem Testkonto in Dev, nicht
mit einem echten Mitglied. Ein Haken nur, wenn es wirklich so war; was
abweicht, mit Build-Nummer an Lucas.

**Anmelden und Sitzung**

- [ ] Anmelden mit E-Mail und Passwort; falsches Passwort zeigt einen Satz, keinen Code
- [ ] App ganz schließen und neu öffnen: noch angemeldet (Schlüsselbund)
- [ ] Telefon sperren, nach einigen Minuten entsperren: App lädt ohne neue Anmeldung
- [ ] „Passwort vergessen“: Mail kommt an, der Link öffnet die App bzw. die Seite zum Passwortsetzen
- [ ] Abmelden: zurück auf der Anmeldeseite, nach Neustart nicht wieder angemeldet

**Onboarding** (frisch eingeladenes Konto)

- [ ] Einladungslink öffnen, Passwort setzen, Onboarding bis zum Ende; danach Startseite
- [ ] Minderjähriges Konto: Erziehungsberechtigte werden verlangt

**Plätze**

- [ ] Platz buchen, in „Meine“ sichtbar, wieder absagen
- [ ] Mitspieler hinzufügen und entfernen
- [ ] Offene Spiele: einem Spiel beitreten
- [ ] Herunterziehen lädt neu, ohne dass die Liste leer springt
- [ ] Die letzte Zeile langer Listen verschwindet nicht hinter der schwebenden Leiste

**Verein**

- [ ] Getränk buchen; Korb bleibt beim Reiterwechsel, fragt beim Verlassen
- [ ] Veranstaltung öffnen, anmelden, abmelden
- [ ] Der Tab „Verein“ öffnet nach Neustart den zuletzt gewählten Reiter

**Push** (nur echtes Gerät, nicht Simulator oder Expo Go)

- [ ] Schalter „Benachrichtigungen“ (Onboarding oder Konto) einschalten: Systemdialog erscheint, nach „Erlauben“ bleibt der Schalter an, auch nach Neustart
- [ ] Eine Testnachricht kommt an, bei offener App als Banner
- [ ] Tippen auf die Nachricht öffnet ihr Ziel, auch bei geschlossener App
- [ ] Schalter aus oder Abmelden: danach kommen keine Nachrichten mehr auf dieses Gerät

**Darstellung**

- [ ] Hell, Dunkel und System im Konto umschalten; die Wahl überlebt den Neustart
- [ ] Anmeldeseiten sind immer dunkel
- [ ] Große Schrift (Bedienungshilfen) schneidet keine Knöpfe ab
- [ ] Kleines Gerät (iPhone SE) und großes (Pro Max): nichts überlappt die Notch oder die Home-Leiste

**Verwaltung** (Konto mit Platzrechten)

- [ ] Tab „Admin“ ist nur mit Platzrechten sichtbar, für gewöhnliche Mitglieder nicht
- [ ] Plätze sperren und die Sperre wieder aufheben; Serie anlegen

## Was zurück an Lucas geht

Nichts Geheimes. Zertifikate, Provisioning Profile und APNs-Key liegen bei EAS
im Projekt des Vereins; Apple-Zugangsdaten bleiben bei dir. Melde nur:

- „Build N ist in TestFlight“
- welche E-Mail-Adressen als Tester eingeladen sind

## Bekannte Grenzen

- Das App-Icon ist ein Platzhalter (`assets/icon.svg`); das echte Logo liegt
  nur in kleiner Auflösung vor.
- Push-Nachrichten kommen erst an, wenn die Supabase-Seite dafür scharf
  geschaltet ist (`supabase/snippets/benachrichtigungs_pushes_zeitplan.sql`).
  Das macht Lucas, sobald der erste TestFlight-Build auf einem Gerät läuft.
- Simulator-Builds ohne Apple-Konto: `eas build --profile simulator --platform ios`
  – zum Ausprobieren der Cloud-Pipeline, braucht keine Zertifikate.
