/**
 * Eine Serie anlegen (Nachbau von apps/web/src/components/SerienFormular.tsx)
 *
 * Wochentag und Platz als Chips, Uhrzeit und Datum getippt. Die Folgen
 * stehen vor dem Absenden: erst "Vorschau", dann nennt der Knopf das
 * Ergebnis ("Serie anlegen · [n] Termine"). Wer danach etwas aendert, muss
 * neu pruefen - sonst gaelte eine alte Vorschau.
 *
 * Eine Serie gilt fuer einen Platz; so legt sie die Datenbank an.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import {
  Chipwahl, Folgen, FormAuswahl, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch, type Ergebnis } from "@/lib/verwaltung/gemeinsam";
import {
  legeSerieAn, vorschauSerie, type Kollision, type SerienFormular as Formular,
} from "@/lib/verwaltung/plaetze";

export const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const TAGE = [
  { wert: 1, label: "Mo" }, { wert: 2, label: "Di" }, { wert: 3, label: "Mi" }, { wert: 4, label: "Do" },
  { wert: 5, label: "Fr" }, { wert: 6, label: "Sa" }, { wert: 0, label: "So" },
];

const TERMIN = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export function SerienFormular({
  plaetze,
  arten,
  onErfolg,
}: {
  /** Nur die aktiven */
  plaetze: { id: string; name: string }[];
  arten: { code: string; name: string }[];
  onErfolg: (e: Ergebnis) => void;
}) {
  const { farben } = useTheme();
  const heute = isoZuDeutsch(heuteInBerlin());
  const [form, setFormRoh] = useState<Formular>({
    courtId: plaetze[0]?.id ?? "",
    bookingTypeCode: arten[0]?.code ?? "training",
    weekday: 2,
    startTime: "18:30",
    endTime: "20:00",
    validFrom: heute,
    validTo: heute,
    title: "",
  });
  const [vorschau, setVorschau] = useState<Kollision[] | null>(null);
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  const kollisionen = (vorschau ?? []).filter((t) => t.conflict_booking_id);

  function setForm(teil: Partial<Formular>) {
    setFormRoh({ ...form, ...teil });
    setVorschau(null);
  }

  async function pruefen() {
    // Die Vorschau ist kein Ergebnis mit Meldung; bei Erfolg bleibt die Zeile leer.
    const r = await ausfuehren(async () => {
      const v = await vorschauSerie(form);
      setVorschau(v.ok ? v.termine : null);
      return { ok: v.ok, meldung: v.meldung ?? "" };
    });
    if (r?.ok) setMeldung(null);
  }

  async function anlegen(verdraengen: boolean) {
    const e = await ausfuehren(() => legeSerieAn({ ...form, verdraengen }));
    if (e?.ok) {
      setVorschau(null);
      onErfolg(e);
    }
  }

  const text = { fontSize: 14, lineHeight: 19.5, color: farben.ink, fontFamily: "Barlow_400Regular" } as const;

  return (
    <View style={{ gap: 14 }}>
      <FormGruppe>
        <FormFeld label="Titel" wert={form.title} onAendern={(w) => setForm({ title: w })} platzhalter="z. B. Training Herren" />
        <FormAuswahl
          label="Art"
          wert={form.bookingTypeCode}
          optionen={arten.map((a) => ({ wert: a.code, label: a.name }))}
          onWahl={(w) => setForm({ bookingTypeCode: w })}
        />
      </FormGruppe>

      <Chipwahl label="Wochentag" optionen={TAGE} wert={form.weekday} onWahl={(w) => setForm({ weekday: w })} />

      <FormGruppe>
        <FormFeld label="Von" wert={form.startTime} onAendern={(w) => setForm({ startTime: w })} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
        <FormFeld label="Bis" wert={form.endTime} onAendern={(w) => setForm({ endTime: w })} platzhalter="HH:MM" tastatur="numbers-and-punctuation" />
      </FormGruppe>

      <Chipwahl
        label="Platz"
        optionen={plaetze.map((p) => ({ wert: p.id, label: p.name.replace(/^Platz\s*/i, "") }))}
        wert={form.courtId}
        onWahl={(w) => setForm({ courtId: w })}
      />

      <FormGruppe>
        <FormFeld label="Ab" wert={form.validFrom} onAendern={(w) => setForm({ validFrom: w })} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
        <FormFeld label="Bis" wert={form.validTo} onAendern={(w) => setForm({ validTo: w })} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
      </FormGruppe>

      <Meldung meldung={meldung} />

      {vorschau && (
        <Folgen>
          {kollisionen.length === 0 ? (
            <Text style={text}>
              <Text style={{ fontFamily: "Barlow_700Bold" }}>{vorschau.length} Termine, nichts im Weg.</Text> Die
              Serie kann so angelegt werden.
            </Text>
          ) : (
            <>
              <Text style={text}>
                <Text style={{ fontFamily: "Barlow_700Bold" }}>
                  {kollisionen.length} {kollisionen.length === 1 ? "Buchung liegt" : "Buchungen liegen"} im Weg.
                </Text>{" "}
                Sie werden abgesagt, die Mitglieder bekommen Bescheid.
              </Text>
              {kollisionen.map((k, i) => (
                <Text key={i} style={[text, { fontSize: 13.5 }]}>
                  • {TERMIN.format(new Date(k.starts_at))} ·{" "}
                  {k.conflict_member_name ?? (k.conflict_kind === "blocking" ? "andere Blockung" : "unbekannt")}
                </Text>
              ))}
            </>
          )}
        </Folgen>
      )}

      {!vorschau ? (
        <Knopf
          art="gold"
          gross
          text="Vorschau"
          laeuftText="Wird geprüft…"
          laeuft={laeuft}
          deaktiviert={!form.title.trim()}
          onPress={() => void pruefen()}
        />
      ) : (
        <Knopf
          art="gold"
          gross
          laeuft={laeuft}
          text={
            kollisionen.length === 0
              ? `Serie anlegen · ${vorschau.length} Termine`
              : `Anlegen und ${kollisionen.length} ${kollisionen.length === 1 ? "Buchung" : "Buchungen"} verdrängen`
          }
          onPress={() => void anlegen(kollisionen.length > 0)}
        />
      )}
    </View>
  );
}
