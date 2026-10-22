/**
 * Die Verwaltung in der App: Plaetze & Serien
 *
 * Verwaltet wird am PC (apps/web/src/app/admin). Am Handy bleibt, was
 * kurzfristig an den Plaetzen passiert: Plaetze sperren und Serien pflegen.
 * Zwei Segmente wie im Web; der gelbe Knopf passt zum Segment (Plaetze
 * sperren / Serie anlegen). Die Plaetze selbst stehen hier nur zum Lesen,
 * mit dem, was gerade auf ihnen liegt. Alles andere verweist die Fusskarte
 * ins Web: Admins auf /admin, den Platzwart, der dort nur die Plaetze sieht,
 * auf /admin/plaetze.
 */

import { useEffect, useState } from "react";
import { Linking, Pressable, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Segmente } from "@/components/Segmente";
import { FormBlatt, Meldung } from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { PlatzSperren } from "@/components/verwaltung/plaetze/PlatzSperren";
import { SerienFormular } from "@/components/verwaltung/plaetze/SerienFormular";
import { SerienListe } from "@/components/verwaltung/plaetze/SerienListe";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { ladeIchSelbst } from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ladePlaetze } from "@/lib/verwaltung/plaetze";
import { webLink } from "@/lib/web";

type Ansicht = "plaetze" | "serien";

const ADMIN = webLink("/admin");
const PLAETZE = webLink("/admin/plaetze");

export default function PlaetzeVerwaltung() {
  const params = useLocalSearchParams<{ ansicht?: string }>();
  const [ansicht, setAnsicht] = useState<Ansicht>(params.ansicht === "serien" ? "serien" : "plaetze");
  const [blatt, setBlatt] = useState<"sperren" | "serie" | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const zustand = useLaden(ladePlaetze);
  // Volle Rechte oder nur Platzrechte? Bis es feststeht, bleibt der Hinweis weg.
  const [admin, setAdmin] = useState<boolean | null>(null);
  const d = zustand.daten;

  useEffect(() => {
    let aktiv = true;
    ladeIchSelbst()
      .then((ich) => aktiv && setAdmin(ich.admin))
      .catch(() => aktiv && setAdmin(false));
    return () => {
      aktiv = false;
    };
  }, []);

  const melde = (e: Ergebnis) => setMeldung({ ok: e.ok, text: e.meldung });
  const neuLaden = zustand.erneutHolen;
  const serien = ansicht === "serien";
  const kopf = <GrosserKopf titel="Plätze" kicker="Verwaltung" />;

  if (!d) {
    return (
      <Bildschirm
        kopf={kopf}
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        {null}
      </Bildschirm>
    );
  }

  const aktive = d.plaetze.filter((p) => p.active);

  return (
    <Bildschirm
      kopf={kopf}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      <VerwaltungsKopf
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
        <Abschnitt>
          <Gruppenkopf titel="Jetzt" />
          <ListenGruppe>
            {d.plaetze.map((p) => {
              const jetzt = d.zustand[p.id];
              return (
                <Listenzeile
                  key={p.id}
                  symbol={p.short_name}
                  titel={p.name}
                  kontext={p.subline ?? undefined}
                  hinweis={!p.active ? "stillgelegt" : jetzt ? jetzt.text : "frei"}
                  hinweisTon={!p.active ? "leise" : jetzt ? (jetzt.art === "gesperrt" ? "rot" : "gold") : "gruen"}
                  // Bearbeitet und aufgehoben wird eine Sperrung im Platzplan.
                  href={jetzt?.art === "gesperrt" ? "/plaetze" : undefined}
                />
              );
            })}
          </ListenGruppe>
        </Abschnitt>
      )}

      {admin !== null && <WebHinweis admin={admin} />}

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

/**
 * Mitglieder, Kasse, Getraenke, System und die Plaetze selbst gibt es nur im
 * Web. Der Platzwart sieht dort nur Plaetze & Serien und wird direkt dorthin
 * geschickt.
 */
function WebHinweis({ admin }: { admin: boolean }) {
  const { farben, stil } = useTheme();
  const link = admin ? ADMIN : PLAETZE;
  const adresse = link ? link.replace(/^https?:\/\//, "") : admin ? "/admin" : "/admin/plaetze";
  return (
    <Pressable
      disabled={!link}
      onPress={() => link && void Linking.openURL(link)}
      accessibilityRole={link ? "link" : undefined}
      style={({ pressed }) => [stil.karte, { gap: 4 }, pressed && { borderColor: farben.line2 }]}
    >
      <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink }}>
        {admin ? "Weitere Verwaltung am PC" : "Plätze & Serien am PC"}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>
        {admin
          ? "Mitglieder, Kasse, Getränke, Plätze und Buchungsregeln pflegst du im Web unter "
          : "Sperren und Serien pflegst du bequemer im Web unter "}
        <Text style={{ fontFamily: "Barlow_600SemiBold", color: link ? farben.blueInk : farben.ink2 }}>{adresse}</Text>.
      </Text>
    </Pressable>
  );
}
