/**
 * Plaetze & Serien (Nachbau von apps/web/src/app/admin/plaetze/page.tsx)
 *
 * Alles zum Platz an einem Ort: Sperrungen, Serien, die Plaetze selbst, die
 * Buchungsarten und die Buchungsregeln. Zwei Segmente wie im Web; der gelbe
 * Knopf im Kopf passt zum Segment (Plaetze sperren / Serie anlegen).
 */

import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { Segmente } from "@/components/Segmente";
import { EinstellungsGruppe } from "@/components/verwaltung/EinstellungsGruppe";
import { FormBlatt, Meldung } from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf } from "@/components/verwaltung/Liste";
import { ArtenListe } from "@/components/verwaltung/plaetze/ArtenListe";
import { PlatzListe } from "@/components/verwaltung/plaetze/PlatzListe";
import { PlatzSperren } from "@/components/verwaltung/plaetze/PlatzSperren";
import { SerienFormular } from "@/components/verwaltung/plaetze/SerienFormular";
import { SerienListe } from "@/components/verwaltung/plaetze/SerienListe";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { useLaden } from "@/lib/laden";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ladePlaetze } from "@/lib/verwaltung/plaetze";

type Ansicht = "plaetze" | "serien";

export default function PlaetzeVerwaltung() {
  const params = useLocalSearchParams<{ ansicht?: string }>();
  const [ansicht, setAnsicht] = useState<Ansicht>(params.ansicht === "serien" ? "serien" : "plaetze");
  const [blatt, setBlatt] = useState<"sperren" | "serie" | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const zustand = useLaden(ladePlaetze);
  const d = zustand.daten;

  const melde = (e: Ergebnis) => setMeldung({ ok: e.ok, text: e.meldung });
  const neuLaden = zustand.erneutHolen;
  const serien = ansicht === "serien";

  if (!d) {
    return <Bildschirm laedt={zustand.laedt} fehler={zustand.fehler}>{null}</Bildschirm>;
  }

  const aktive = d.plaetze.filter((p) => p.active);

  return (
    <Bildschirm aktualisiert={zustand.aktualisiert} onAktualisieren={zustand.neuLaden} fehler={zustand.fehler}>
      <VerwaltungsKopf
        unterzeile="Sperrungen, Serien, die Plätze selbst und die Regeln, nach denen gebucht wird."
        aktion={{
          text: serien ? "Serie anlegen" : "Plätze sperren",
          onPress: () => setBlatt(serien ? "serie" : "sperren"),
        }}
      >
        <Segmente
          beschriftung="Plätze und Serien"
          optionen={[
            { wert: "plaetze", label: "Plätze" },
            { wert: "serien", label: "Serien" },
          ]}
          wert={ansicht}
          onWahl={(w) => {
            setAnsicht(w);
            setMeldung(null);
          }}
        />
      </VerwaltungsKopf>

      <Meldung meldung={meldung} />

      {serien ? (
        <Abschnitt>
          <Gruppenkopf titel="Laufend" neben={`${d.serien.length} Serien`} />
          <SerienListe serien={d.serien} melde={melde} neuLaden={neuLaden} />
        </Abschnitt>
      ) : (
        <>
          <PlatzListe plaetze={d.plaetze} zustand={d.zustand} melde={melde} neuLaden={neuLaden} />
          <ArtenListe arten={d.arten} melde={melde} neuLaden={neuLaden} />
          <EinstellungsGruppe
            titel="Buchungsregeln"
            text="Zeiten, Raster, Kontingent und Gastgebühr."
            eintraege={d.einstellungen}
            onGespeichert={() => void neuLaden()}
          />
        </>
      )}

      {blatt === "sperren" && (
        <FormBlatt
          titel="Plätze sperren"
          unterzeile="Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt."
          onSchliessen={() => setBlatt(null)}
        >
          {(zu) => (
            <PlatzSperren
              plaetze={aktive}
              arten={d.blockungsarten}
              oeffnung={d.oeffnung}
              schluss={d.schluss}
              onErfolg={(e) => {
                melde(e);
                zu();
                void neuLaden();
              }}
            />
          )}
        </FormBlatt>
      )}

      {blatt === "serie" && (
        <FormBlatt titel="Serie anlegen" onSchliessen={() => setBlatt(null)}>
          {(zu) => (
            <SerienFormular
              plaetze={aktive}
              arten={d.blockungsarten}
              onErfolg={(e) => {
                melde(e);
                zu();
                void neuLaden();
              }}
            />
          )}
        </FormBlatt>
      )}
    </Bildschirm>
  );
}
