/**
 * Der Arbeitsdienst (Nachbau von apps/web/src/app/admin/arbeitsdienst und
 * ArbeitsdienstListe.tsx)
 *
 * Die taegliche Arbeit ist "wer war da, wie viele Stunden" - eine
 * Personenliste, sortiert nach fehlenden Stunden (die Datenbank liefert sie
 * so). Erst der Jahresausgleich macht daraus Geld; die Forderung taucht dann
 * in der Kasse auf. Das Jahr steht wie im Web in ?jahr=.
 */

import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatCents } from "@tcm/core";
import { Bildschirm } from "@/components/Bildschirm";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { Chipwahl, Karte, Knopf, Meldung, useAktion, bestaetige } from "@/components/verwaltung/Formular";
import {
  Abschnitt, Gruppenkopf, Kennzahl, Kennzahlen, LeereZeile, ListenGruppe, Listenzeile, Statusmarke,
  useHinweisFarbe,
} from "@/components/verwaltung/Liste";
import { EinsatzBlatt } from "@/components/verwaltung/arbeitsdienst/EinsatzBlatt";
import { SollBlatt } from "@/components/verwaltung/arbeitsdienst/SollBlatt";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { jahrAbrechnen, ladeArbeitsdienst, type SollZeile } from "@/lib/verwaltung/arbeitsdienst";
import { heuteInBerlin } from "@/lib/verwaltung/gemeinsam";

type Person = { id: string; name: string };

export default function ArbeitsdienstSeite() {
  const { farben, stil } = useTheme();
  const hinweisFarbe = useHinweisFarbe();
  const parameter = useLocalSearchParams<{ jahr?: string }>();
  const aktuell = Number(heuteInBerlin().slice(0, 4));
  const jahr = Number(parameter.jahr) || aktuell;

  const zustand = useLaden(() => ladeArbeitsdienst(jahr));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  // undefined: zu; null: offen, Mitglied noch zu waehlen
  const [erfassen, setErfassen] = useState<Person | null | undefined>(undefined);
  const [soll, setSoll] = useState<SollZeile | null>(null);

  // Beim Jahreswechsel neu laden - useLaden laedt von sich aus nur einmal.
  const erstesMal = useRef(true);
  const holen = useRef(zustand.erneutHolen);
  holen.current = zustand.erneutHolen;
  useEffect(() => {
    if (erstesMal.current) {
      erstesMal.current = false;
      return;
    }
    setMeldung(null);
    void holen.current();
  }, [jahr, setMeldung]);

  const d = zustand.daten;
  // Solange das neue Jahr laedt, nicht die Zahlen des alten zeigen.
  if (!d || d.jahr !== jahr) {
    const wartet = zustand.laedt || (d !== null && !zustand.fehler);
    return (
      <Bildschirm laedt={wartet} fehler={zustand.fehler} aktualisiert={zustand.aktualisiert} onAktualisieren={zustand.neuLaden}>
        {null}
      </Bildschirm>
    );
  }

  const offen = d.zeilen.filter((z) => !z.abgerechnet);
  const summe = offen.reduce((s, z) => s + z.betrag_cents, 0);
  const schuldner = offen.filter((z) => Number(z.missing_hours) > 0);
  const abrechenbar = jahr < aktuell;

  function erfolg(text: string) {
    setMeldung({ ok: true, text });
    void zustand.erneutHolen();
  }

  // Jahre als Chips: Vorjahr, dieses, Folgejahr - und der Rueckweg ins Heute.
  const jahre = [jahr - 1, jahr, jahr + 1];
  const chips = jahre.map((j) => ({
    wert: j,
    label: j === jahr - 1 ? `‹ ${j}` : j === jahr + 1 ? `${j} ›` : String(j),
  }));
  if (!jahre.includes(aktuell)) chips.push({ wert: aktuell, label: "Dieses Jahr" });

  const anzahlForderungen = `${schuldner.length} ${schuldner.length === 1 ? "Forderung" : "Forderungen"}`;

  return (
    <Bildschirm aktualisiert={zustand.aktualisiert} onAktualisieren={zustand.neuLaden} fehler={zustand.fehler}>
      <VerwaltungsKopf
        unterzeile="Wer wie viele Stunden schuldet, was geleistet wurde und was am Jahresende offen bleibt."
        aktion={{ text: "Einsatz eintragen", onPress: () => setErfassen(null) }}
      >
        <Chipwahl
          optionen={chips}
          wert={jahr}
          onWahl={(j) => router.setParams({ jahr: j === aktuell ? undefined : String(j) })}
        />
      </VerwaltungsKopf>

      <Meldung meldung={meldung} />

      <Kennzahlen>
        <Kennzahl label="Dienstpflichtig" wert={String(d.zeilen.length)} info="Mitglieder mit Soll-Stunden" />
        <Kennzahl label="Noch offen" wert={String(schuldner.length)} info="haben Stunden nachzuholen" />
        <Kennzahl
          label="Käme zusammen"
          wert={formatCents(summe)}
          info={`bei ${formatCents(d.stundensatzCents)} je Stunde`}
        />
      </Kennzahlen>

      {/* --- Stand ---------------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel={`Stand ${jahr}`} />
        <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
          Das Soll ist die höchste Regel über alle Beitragsarten des Mitglieds, nicht ihre Summe – wer Beitrag
          und Schlüsselpfand hat, arbeitet nicht doppelt.
        </Text>
        <ListenGruppe>
          {d.zeilen.length === 0 ? (
            <LeereZeile
              text={`Für ${jahr} ist keine Beitragsart mit Soll-Stunden hinterlegt. Solange das so ist, schuldet niemand Arbeitsdienst.`}
            />
          ) : (
            d.zeilen.map((z) => {
              const fehlt = Number(z.missing_hours);
              const einsaetze =
                z.eintraege > 0 ? ` · ${z.eintraege} ${z.eintraege === 1 ? "Einsatz" : "Einsätze"}` : "";
              return (
                <Listenzeile
                  key={z.member_id}
                  titel={z.member_name}
                  kontext={`${z.arten} · ${Number(z.completed_hours)} von ${Number(z.required_hours)} h${einsaetze}`}
                  label={`${z.member_name}: Einsatz eintragen`}
                  pfeil={!z.abgerechnet}
                  onPress={z.abgerechnet ? undefined : () => setErfassen({ id: z.member_id, name: z.member_name })}
                  neben={
                    z.abgerechnet ? (
                      <Statusmarke text="abgerechnet" ton="gruen" />
                    ) : fehlt > 0 ? (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                          {fehlt} h
                        </Text>
                        <Text style={{ fontSize: 13, fontFamily: "Barlow_700Bold", color: hinweisFarbe("gold") }}>
                          {formatCents(z.betrag_cents)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, fontFamily: "Barlow_700Bold", color: hinweisFarbe("gruen") }}>
                        erledigt
                      </Text>
                    )
                  }
                />
              );
            })
          )}
        </ListenGruppe>
      </Abschnitt>

      {/* --- Soll-Stunden ------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Soll-Stunden je Beitragsart" />
        <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
          Hier steht, wer überhaupt Arbeitsdienst schuldet. 0 bedeutet: diese Beitragsart leistet keinen.
        </Text>
        <ListenGruppe>
          {d.arten.length === 0 ? (
            <LeereZeile text="Keine Beitragsarten angelegt." />
          ) : (
            d.arten.map((a) => (
              <Listenzeile
                key={a.id}
                titel={a.name}
                kontext={`${a.mitglieder} Mitglieder`}
                hinweis={a.soll_stunden === null ? "—" : `${Number(a.soll_stunden)} h`}
                hinweisTon={a.soll_stunden ? "gold" : "leise"}
                label={`Soll-Stunden für ${a.name}`}
                onPress={() => setSoll(a)}
              />
            ))
          )}
        </ListenGruppe>
      </Abschnitt>

      {/* --- Jahresausgleich ---------------------------------------------- */}
      <Karte
        titel={`Jahresausgleich ${jahr}`}
        unterzeile={`Rechnet fehlende Stunden in Geld um und friert Soll, Ist und Stundensatz ein. Danach lässt sich für ${jahr} nichts mehr nachtragen.`}
      >
        {!abrechenbar ? (
          <Text style={[stil.text, { color: farben.ink2 }]}>
            {jahr} läuft noch – bis zum Jahresende können Stunden dazukommen.
          </Text>
        ) : offen.length === 0 ? (
          <Text style={[stil.text, { color: farben.ink2 }]}>Für {jahr} ist bereits alles abgerechnet.</Text>
        ) : (
          <Knopf
            text="Jahr abrechnen"
            laeuft={laeuft}
            onPress={() =>
              bestaetige(
                `${jahr} abrechnen?`,
                `${anzahlForderungen} über ${formatCents(summe)} entstehen. Danach lässt sich für ${jahr} nichts mehr nachtragen.`,
                `${anzahlForderungen} über ${formatCents(summe)} erzeugen`,
                () => void ausfuehren(() => jahrAbrechnen(jahr, null), () => zustand.erneutHolen()),
              )
            }
          />
        )}
      </Karte>

      {erfassen !== undefined && (
        <EinsatzBlatt person={erfassen} onSchliessen={() => setErfassen(undefined)} onErfolg={erfolg} />
      )}
      {soll && <SollBlatt art={soll} jahr={jahr} onSchliessen={() => setSoll(null)} onErfolg={erfolg} />}
    </Bildschirm>
  );
}
