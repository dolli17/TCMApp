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
`https://<web-domain>/datenschutz` (Domain kommt von Lucas).

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

## Was zurück an Lucas geht

Nichts Geheimes. Zertifikate, Provisioning Profile und APNs-Key liegen bei EAS
im Projekt des Vereins; Apple-Zugangsdaten bleiben bei dir. Melde nur:

- „Build N ist in TestFlight“
- welche E-Mail-Adressen als Tester eingeladen sind

## Bekannte Grenzen

- Das App-Icon ist ein Platzhalter (`assets/icon.svg`); das echte Logo liegt
  nur in kleiner Auflösung vor.
- Die Links „Datenschutz“ und „Impressum“ im Konto-Tab erscheinen erst, wenn
  in `eas.json` unter `build.base.env` die Web-Adresse steht:
  `"EXPO_PUBLIC_SITE_URL": "https://<web-domain>"` (EAS lässt keinen leeren
  Wert zu, deshalb fehlt der Eintrag noch). Trägt Lucas ein, sobald die Domain
  feststeht.
- Push-Nachrichten kommen erst an, wenn die Supabase-Seite dafür scharf
  geschaltet ist (`supabase/snippets/benachrichtigungs_pushes_zeitplan.sql`).
  Das macht Lucas, sobald der erste TestFlight-Build auf einem Gerät läuft.
- Simulator-Builds ohne Apple-Konto: `eas build --profile simulator --platform ios`
  – zum Ausprobieren der Cloud-Pipeline, braucht keine Zertifikate.
