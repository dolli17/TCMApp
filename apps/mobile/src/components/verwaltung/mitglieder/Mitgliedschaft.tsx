/**
 * Bereich Mitgliedschaft: Rolle und Zahler, Mannschaft, Verlauf
 *
 * Nachbau von ZugehoerigkeitKarte und MannschaftKarte aus
 * apps/web/src/components. Rolle und Zahler gehoeren zusammen, weil beides
 * eine Beziehung zum Rest des Vereins ist, die man leicht versehentlich
 * falsch setzt.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import {
  FormAuswahl, FormGruppe, FormSchalter, Karte, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { Personensuche } from "@/components/verwaltung/mitglieder/Personensuche";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import {
  ladeZugehoerigkeit, mannschaftSetzen, rolleSetzen, zahlerSetzen, type MitgliedDaten,
} from "@/lib/verwaltung/mitglieder";

export function Mitgliedschaft({ d, onGeaendert }: { d: MitgliedDaten; onGeaendert: () => Promise<void> }) {
  const { stil } = useTheme();
  const m = d.m;
  const zustand = useLaden(() => ladeZugehoerigkeit(m.id));
  const z = zustand.daten;

  async function geaendert() {
    await Promise.all([onGeaendert(), zustand.erneutHolen()]);
  }

  return (
    <>
      {zustand.fehler && <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>}
      <RolleUndZahler d={d} z={z} onGeaendert={geaendert} />
      {z && (
        <MannschaftKarte
          mitgliedId={m.id}
          mannschaften={z.mannschaften}
          mannschaftId={m.team_id}
          fuehrer={m.is_team_captain}
          archiviert={m.status === "archived"}
          onGeaendert={geaendert}
        />
      )}

      {d.mitgliedschaften.length > 1 && (
        <Abschnitt>
          <Gruppenkopf titel="Verlauf" />
          <ListenGruppe>
            {d.mitgliedschaften.map((s) => (
              <Listenzeile
                key={s.id}
                titel={`Nr. ${s.number}`}
                kontext={`${datum(s.started_on)} – ${s.ended_on ? datum(s.ended_on) : "heute"}${
                  s.cancellation_reason ? ` · ${s.cancellation_reason}` : ""
                }`}
                hinweis={s.ended_on ? "beendet" : "laufend"}
                hinweisTon={s.ended_on ? "leise" : "gruen"}
              />
            ))}
          </ListenGruppe>
        </Abschnitt>
      )}
    </>
  );
}

function RolleUndZahler({
  d,
  z,
  onGeaendert,
}: {
  d: MitgliedDaten;
  z: Awaited<ReturnType<typeof ladeZugehoerigkeit>> | null;
  onGeaendert: () => Promise<void>;
}) {
  const { stil, farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const m = d.m;
  const [zahlerWahl, setZahlerWahl] = useState<string | null>(m.billing_payer_id);
  const rolleGesperrt = d.istAdmin && d.einzigerAdmin;
  const titel = { fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink } as const;

  function rolle(erteilen: boolean) {
    void ausfuehren(() => rolleSetzen(m.id, erteilen), onGeaendert);
  }

  function zahler(id: string | null) {
    setZahlerWahl(id);
    void ausfuehren(() => zahlerSetzen(m.id, id), onGeaendert).then((e) => {
      if (!e?.ok) setZahlerWahl(m.billing_payer_id);
    });
  }

  return (
    <Karte titel="Rolle und Zahler">
      <Meldung meldung={meldung} />

      <View style={{ gap: 6 }}>
        <Text style={titel}>Verwaltungsrechte</Text>
        <Text style={stil.leise}>
          Ein Admin sieht und ändert alles: Mitglieder, Beiträge, Serien, Einstellungen und jede fremde
          Buchung. Zwischenstufen gibt es bewusst nicht.
        </Text>
        {rolleGesperrt ? (
          <Text style={[stil.text, { fontSize: 14 }]}>
            {d.selbst ? "Du bist" : "Diese Person ist"} derzeit der einzige Administrator. Bitte zuerst
            jemand anderen dazu machen, sonst kann niemand mehr verwalten.
          </Text>
        ) : !m.auth_user_id && !d.istAdmin ? (
          <Text style={[stil.text, { fontSize: 14 }]}>
            Ohne Login kann niemand Administrator werden. Zuerst einen Zugang einrichten.
          </Text>
        ) : d.istAdmin ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Statusmarke ton="gelb" text="Administrator" />
            <Knopf
              art="leise"
              klein
              text="Rechte entziehen"
              laeuft={laeuft}
              laeuftText="Wird entzogen…"
              onPress={() =>
                bestaetige(
                  "Rechte entziehen?",
                  `${m.first_name} ${m.last_name} kann danach nichts mehr verwalten.`,
                  "Wirklich entziehen",
                  () => rolle(false),
                )
              }
            />
          </View>
        ) : (
          <View style={{ alignSelf: "flex-start" }}>
            <Knopf klein text="Zum Administrator machen" laeuft={laeuft} laeuftText="Wird erteilt…" onPress={() => rolle(true)} />
          </View>
        )}
      </View>

      <View style={{ gap: 6, marginTop: 10 }}>
        <Text style={titel}>Wer bezahlt für dieses Mitglied?</Text>
        <Text style={stil.leise}>
          Leer bedeutet: zahlt selbst. Bei Kindern steht hier der Elternteil – Beiträge und Getränke werden
          dann dort eingezogen.
        </Text>
        {!z ? null : z.zahltFuer.length > 0 ? (
          <Text style={[stil.text, { fontSize: 14 }]}>
            Dieses Mitglied zahlt selbst für {z.zahltFuer.map((x) => x.name).join(", ")} und kann deshalb
            keinen eigenen Zahler bekommen.
          </Text>
        ) : (
          <Personensuche
            verzeichnis={z.verzeichnis}
            gewaehlt={zahlerWahl}
            onWahl={zahler}
            label="Zahler"
            ausschluss={[m.id]}
            deaktiviert={laeuft}
          />
        )}
      </View>
    </Karte>
  );
}

/**
 * In welcher Mannschaft spielt dieses Mitglied? Eine Auswahl statt einer
 * Suche: es gibt eine Handvoll Mannschaften, und "keine" ist der Normalfall.
 */
function MannschaftKarte(props: {
  mitgliedId: string;
  mannschaften: { id: string; name: string; active: boolean }[];
  mannschaftId: string | null;
  fuehrer: boolean;
  archiviert: boolean;
  onGeaendert: () => Promise<void>;
}) {
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [wahl, setWahl] = useState(props.mannschaftId ?? "");
  const [fuehrer, setFuehrer] = useState(props.fuehrer);

  // Stillgelegte bleiben waehlbar, wenn das Mitglied schon drin steht.
  const auswahl = props.mannschaften.filter((m) => m.active || m.id === props.mannschaftId);
  const unveraendert = wahl === (props.mannschaftId ?? "") && fuehrer === props.fuehrer;

  return (
    <Karte
      titel="Mannschaft"
      unterzeile="Ein Spieler steht in höchstens einer Mannschaft. Neue Mannschaften legt der Vorstand unter Mitglieder → Mannschaften an."
    >
      <Meldung meldung={meldung} />
      <FormGruppe>
        <FormAuswahl
          label="Spielt in"
          wert={wahl}
          leer="– keine –"
          optionen={[
            { wert: "", label: "– keine –" },
            ...auswahl.map((m) => ({ wert: m.id, label: `${m.name}${m.active ? "" : " (stillgelegt)"}` })),
          ]}
          onWahl={(w) => {
            if (props.archiviert) return;
            setWahl(w);
            if (!w) setFuehrer(false);
          }}
        />
        <FormSchalter
          label="Mannschaftsführer"
          beschreibung="Je Mannschaft nur einer. Steht dort schon jemand, wird das Speichern abgewiesen."
          an={fuehrer}
          onWechsel={setFuehrer}
          deaktiviert={laeuft || props.archiviert || !wahl}
        />
      </FormGruppe>
      <Knopf
        text="Speichern"
        laeuftText="Wird gespeichert…"
        laeuft={laeuft}
        deaktiviert={props.archiviert || unveraendert}
        onPress={() =>
          void ausfuehren(() => mannschaftSetzen(props.mitgliedId, wahl || null, fuehrer), props.onGeaendert).then((e) => {
            if (e && !e.ok) {
              setWahl(props.mannschaftId ?? "");
              setFuehrer(props.fuehrer);
            }
          })
        }
      />
    </Karte>
  );
}
