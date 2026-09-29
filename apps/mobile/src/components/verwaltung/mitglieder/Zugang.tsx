/**
 * Bereich Zugang zur App (Nachbau von apps/web/src/components/LoginKarte.tsx)
 *
 * Der Verein vergibt Logins selbst, sieht aber nie ein Passwort: eingeladen
 * wird per E-Mail, das Passwort setzt das Mitglied danach selbst. Die Arbeit
 * macht die Edge Function member-login (loginVerwalten).
 */

import { Text, View } from "react-native";
import { Karte, Knopf, Meldung, Wertzeile, bestaetige, useAktion } from "@/components/verwaltung/Formular";
import { Statusmarke } from "@/components/verwaltung/Liste";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { zeitstempel } from "@/lib/verwaltung/gemeinsam";
import { ladeLoginZustand, loginVerwalten, type LoginAktion } from "@/lib/verwaltung/mitglieder";

export function Zugang({
  mitgliedId,
  selbst,
  onGeaendert,
}: {
  mitgliedId: string;
  selbst: boolean;
  onGeaendert: () => Promise<void>;
}) {
  const { stil } = useTheme();
  const zustand = useLaden(() => ladeLoginZustand(mitgliedId));
  const { laeuft, meldung, ausfuehren } = useAktion();
  const z = zustand.daten;

  function fuehreAus(aktion: LoginAktion) {
    void ausfuehren(() => loginVerwalten(mitgliedId, aktion), async () => {
      await Promise.all([onGeaendert(), zustand.erneutHolen()]);
    });
  }

  if (zustand.fehler) return <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>;
  if (!z) return null;
  const gesperrt = Boolean(z.disabled_at);

  return (
    <Karte
      titel="Zugang zur App"
      unterzeile="Der Verein verschickt eine Einladung; das Passwort setzt das Mitglied selbst. Niemand im Vorstand kennt es."
    >
      <Meldung meldung={meldung} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>Status</Text>
        {z.hat_zugang ? (
          <Statusmarke ton={gesperrt ? "rot" : "gruen"} text={gesperrt ? "gesperrt" : "aktiv"} />
        ) : (
          <Statusmarke text="kein Zugang" />
        )}
      </View>
      <View>
        <Wertzeile name="E-Mail" wert={z.email ?? "Keine E-Mail-Adresse hinterlegt."} />
        {z.hat_zugang && (
          <>
            <Wertzeile name="Eingeladen" wert={zeitstempel(z.invited_at) || "—"} />
            <Wertzeile name="Zuletzt angemeldet" wert={zeitstempel(z.last_sign_in) || "—"} />
          </>
        )}
        {gesperrt && <Wertzeile name="Gesperrt seit" wert={zeitstempel(z.disabled_at)} />}
      </View>
      {z.grund ? <Text style={[stil.text, { fontSize: 14 }]}>{z.grund}</Text> : null}

      {!z.hat_zugang ? (
        <View style={{ gap: 8 }}>
          <Knopf
            text="Einladung verschicken"
            laeuftText="Wird verschickt…"
            laeuft={laeuft}
            deaktiviert={!z.einladbar}
            onPress={() => fuehreAus("einladen")}
          />
          <Knopf
            art="leise"
            text="Vorhandenen Zugang verbinden"
            deaktiviert={laeuft || !z.email}
            onPress={() => fuehreAus("login_verknuepfen")}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Knopf
            art="leise"
            text="Passwort zurücksetzen lassen"
            deaktiviert={laeuft}
            onPress={() => fuehreAus("passwort_zuruecksetzen")}
          />
          {selbst ? (
            <Text style={stil.leise}>Den eigenen Zugang kannst du hier nicht sperren oder entfernen.</Text>
          ) : (
            <>
              <Knopf
                art="leise"
                text={gesperrt ? "Sperre aufheben" : "Zugang sperren"}
                deaktiviert={laeuft}
                onPress={() => fuehreAus(gesperrt ? "login_aktivieren" : "login_deaktivieren")}
              />
              <Knopf
                art="leise"
                text="Zugang entfernen"
                deaktiviert={laeuft}
                onPress={() =>
                  bestaetige(
                    "Zugang entfernen?",
                    "Das Konto wird endgültig gelöscht; das Mitglied selbst bleibt bestehen.",
                    "Wirklich entfernen",
                    () => fuehreAus("login_entfernen"),
                  )
                }
              />
            </>
          )}
        </View>
      )}

      {z.hat_zugang && !selbst && (
        <Text style={stil.leise}>
          Sperren ist umkehrbar und lässt die Daten unberührt – das ist fast immer der richtige Weg. Entfernen
          löscht das Konto endgültig; das Mitglied selbst bleibt bestehen.
          {z.ist_admin ? " Mit dem Zugang enden auch die Verwaltungsrechte." : ""}
        </Text>
      )}
    </Karte>
  );
}
