/**
 * Bereich Mitgliedschaft: Rollen und Zahler, Mannschaft, Verlauf
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
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { Personensuche } from "@/components/verwaltung/mitglieder/Personensuche";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { ROLLEN, hatVolleRechte, type RollenInfo } from "@tcm/core";
import {
  ladeZugehoerigkeit, mannschaftSetzen, rolleSetzen, trainerSetzen, zahlerSetzen, type MitgliedDaten,
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
  const titel = { fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink } as const;

  // Die letzte Rolle mit vollen Rechten im Verein bleibt gesperrt. Wer
  // Vorstand und App Admin zugleich ist, darf eine davon abgeben.
  const volleRollen = d.rollen.filter((r) => hatVolleRechte([r]));
  const gesperrt = (r: RollenInfo) =>
    r.vollRechte && d.einzigeVolleRechte && volleRollen.length === 1 && volleRollen[0] === r.rolle;

  function rolle(r: RollenInfo, erteilen: boolean) {
    const los = () => void ausfuehren(() => rolleSetzen(m.id, r.rolle, erteilen), onGeaendert);
    // Volle Rechte zu entziehen sperrt womoeglich jemanden aus, deshalb mit Rueckfrage.
    if (!erteilen && r.vollRechte) {
      bestaetige(
        `${r.label} entziehen?`,
        `${m.first_name} ${m.last_name} kann danach nichts mehr verwalten, sofern keine andere Rolle volle Rechte gibt.`,
        "Wirklich entziehen",
        los,
      );
    } else los();
  }

  function zahler(id: string | null) {
    setZahlerWahl(id);
    void ausfuehren(() => zahlerSetzen(m.id, id), onGeaendert).then((e) => {
      if (!e?.ok) setZahlerWahl(m.billing_payer_id);
    });
  }

  return (
    <Karte titel="Rollen und Zahler">
      <Meldung meldung={meldung} />

      <View style={{ gap: 6 }}>
        <Text style={titel}>Rollen</Text>
        <Text style={stil.leise}>
          Jedes Mitglied ist Spieler: bucht Plätze und sieht seine eigenen Daten. Vorstand und App Admin
          sehen und ändern alles. Platzwart und Trainer bekommen ihre eigenen Rechte später.
        </Text>
        <FormGruppe>
          {ROLLEN.map((r) => {
            const hat = d.rollen.includes(r.rolle);
            const ohneLogin = r.brauchtLogin && !m.auth_user_id && !hat;
            const sperre = gesperrt(r);
            return (
              <FormSchalter
                key={r.rolle}
                label={r.label}
                beschreibung={
                  sperre
                    ? `${d.selbst ? "Du hast" : "Diese Person hat"} als einzige volle Rechte. Bitte zuerst jemand anderen zum Vorstand oder App Admin machen.`
                    : ohneLogin
                      ? "Braucht einen Login. Zuerst einen Zugang einrichten."
                      : r.beschreibung
                }
                an={hat}
                onWechsel={(an) => rolle(r, an)}
                deaktiviert={laeuft || sperre || ohneLogin}
              />
            );
          })}
          <FormSchalter
            label="Trainer"
            beschreibung="Gibt Training. Eigene Rechte folgen."
            an={m.is_trainer}
            onWechsel={(an) => void ausfuehren(() => trainerSetzen(m.id, an), onGeaendert)}
            deaktiviert={laeuft}
          />
        </FormGruppe>
        <Text style={stil.leise}>
          {m.is_team_captain && m.teams
            ? `Mannschaftsführer von ${m.teams.name}. Gesetzt wird das in der Karte Mannschaft.`
            : "Mannschaftsführer wird in der Karte Mannschaft gesetzt, höchstens einer je Mannschaft."}
        </Text>
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
