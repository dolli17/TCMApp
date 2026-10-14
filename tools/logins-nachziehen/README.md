# Logins nachziehen

Jedes Mitglied hat einen Login. Dieses Skript gibt ihn allen nicht archivierten
Mitgliedern, die noch keinen haben. Das sind die Bestandsmitglieder aus der Zeit,
als Mitglied und Login getrennt waren, und später der Bestand aus dem eBuSy-Import
(O17).

> **Gegen Dev und Prod startet nur der Nutzer das Skript, nie Claude.** Mit
> `--ausfuehren` gehen echte Einladungsmails raus.

## Was passiert

Das Skript teilt jedes Mitglied ohne Login in genau eine Gruppe ein:

| Gruppe | Bedingung | Mit `--ausfuehren` |
| --- | --- | --- |
| Einladung per Mail | echte Adresse, kein Konto in `auth.users` | `inviteUserByEmail`, danach `link_auth_user` |
| Testadresse, still anlegen | `public.ist_testadresse` trifft zu, kein Konto | `createUser` ohne Mail und ohne Passwort, danach `link_auth_user` |
| Konto schon vorhanden | ein Konto mit derselben Adresse, keinem Mitglied zugeordnet (z. B. verwaist nach O4) | nur `link_auth_user` |
| Adresse vergeben | das Konto zur Adresse gehört schon einem anderen Mitglied | nichts, steht im Bericht |
| ohne E-Mail | keine Adresse eingetragen | nichts, steht im Bericht |

Die Regeln sind dieselben wie in der Edge Function `member-login`: Testadressen
erkennt `public.ist_testadresse`, Adressen werden ohne Rücksicht auf
Groß- und Kleinschreibung verglichen, und schlägt eine Einladung fehl, weil es das
Konto schon gibt, wird es verknüpft.

**Standard ist der Probelauf.** Er listet die Gruppen auf und schreibt nichts.

Das Skript lässt sich gefahrlos wiederholen. Wer verknüpft ist, fällt beim nächsten
Lauf heraus. Bricht ein Lauf ab (Ratenlimit, `--max`, Fehler), macht der nächste
dort weiter.

Den Bericht am Ende braucht der Vorstand. Bei Mitgliedern **ohne E-Mail** oder mit
einer **vergebenen Adresse** trägt er in der Verwaltung eine eigene Adresse ein.
Danach das Skript erneut laufen lassen.

## Umgebung

| Variable | Wofür |
| --- | --- |
| `SUPABASE_URL` | Projekt-URL (lokal `http://127.0.0.1:54321`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Dienstschlüssel für die Admin-API und `link_auth_user` |
| `SUPABASE_DB_URL` | Postgres-Verbindung zum Lesen der Mitglieder |
| `SITE_URL` | Nur bei Einladungen. Basis für den Link `…/passwort-setzen`, dieselbe wie `NEXT_PUBLIC_SITE_URL` der Web-App |

Die Datenbankverbindung braucht das Skript, weil der Dienstschlüssel auf
`public.members` bewusst kein `SELECT` hat (siehe `member_for_login_admin`).
Gelesen wird darüber, geschrieben wird nur über Admin-API und RPC. Vor jedem Lauf
prüft das Skript, ob `SUPABASE_URL` und `SUPABASE_DB_URL` zum selben Projekt
gehören.

Die Schlüssel kommen aus dem Passwortmanager in die Shell und nie in eine Datei im
Repo.

## Aufruf

```bash
# Lokal: Werte aus dem laufenden Stack
eval "$(supabase status -o env | grep -E 'API_URL|SERVICE_ROLE_KEY|DB_URL')"
export SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_DB_URL=$DB_URL

pnpm --filter @tcm/logins-nachziehen start                # Probelauf
pnpm --filter @tcm/logins-nachziehen start --ausfuehren   # anlegen und einladen
```

Optionen für `--ausfuehren`:

| Option | Standard | Bedeutung |
| --- | --- | --- |
| `--pause <ms>` | `2000` | Pause nach jeder Einladungsmail, damit Resend nicht drosselt |
| `--max <n>` | unbegrenzt | höchstens so viele Einladungsmails in diesem Lauf |
| `--ja` | aus | ohne Rückfrage ausführen, sonst fragt das Skript bei einem Cloud-Ziel nach |

**Ratenlimit:** Supabase Auth begrenzt die Mails je Stunde (Dashboard →
Authentication → Rate Limits, „Rate limit for sending emails“). Vor dem Lauf
diesen Wert prüfen und `--max` darunter setzen, oder das Limit für den Lauf
anheben. Meldet Supabase trotzdem 429, hält das Skript an und führt den Rest als
„liegen geblieben“. Ein späterer Lauf schickt ihn.

## Ablauf gegen Dev bzw. Prod (nur der Nutzer)

1. Probelauf und Bericht lesen. Bei Testadressen geht keine Mail raus, bei
   „Einladung per Mail“ schon.
2. Das Mail-Limit in Supabase prüfen und `--max` passend wählen.
3. `--ausfuehren` mit `SITE_URL` der jeweiligen Web-App.
4. Mitglieder ohne E-Mail oder mit vergebener Adresse an den Vorstand geben und
   nach dem Nachpflegen erneut laufen lassen.
