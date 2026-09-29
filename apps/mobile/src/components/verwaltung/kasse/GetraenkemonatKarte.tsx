/**
 * Der Getraenkemonat in zwei Schritten (Nachbau von
 * apps/web/src/components/GetraenkemonatKarte.tsx)
 *
 * Schliessen und Abrechnen sind bewusst getrennt: das Schliessen friert die
 * Summe ein (ab da nimmt die Theke fuer diesen Monat nichts mehr an), erst
 * das Abrechnen macht Forderungen daraus. Danach steht noch die
 * Vorabankuendigung an. Der eine Schritt eines Monats steht im Blatt, nicht in
 * der Zeile (Regel 4).
 *
 * Wird auch von der Getraenke-Seite benutzt: Props bleiben monate +
 * onGeaendert; die Frist ist optional und wird sonst bei Bedarf geladen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  FormBlatt, Knopf, Meldung, Wertzeile, useAktion,
} from "@/components/verwaltung/Formular";
import {
  Abschnitt, Gruppenkopf, LeereZeile, ListenGruppe, Listenzeile, Statusmarke, type MarkenTon,
} from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin } from "@/lib/verwaltung/gemeinsam";
import {
  forderungenAnkuendigen, ladeAnkuendigungsfrist, monatAbrechnen, monatSchliessen, plusTage,
  type MonatZeile,
} from "@/lib/verwaltung/kasse";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

const STAND: Record<MonatZeile["status"], string> = {
  open: "offen",
  closed: "geschlossen",
  charged: "abgerechnet",
};
const STAND_TON: Record<MonatZeile["status"], MarkenTon> = { open: "grau", closed: "gelb", charged: "gruen" };

type Schritt = { marke: string; knopf: string; text: string };

/**
 * Was bei einem Monat als Naechstes zu tun ist: erst schliessen, dann
 * abrechnen, dann ankuendigen. Der laufende Monat hat noch nichts zu tun.
 */
function naechsterSchritt(m: MonatZeile, jetzt: number): Schritt | null {
  if (m.status === "open") {
    return m.year * 12 + m.month >= jetzt
      ? null
      : { marke: "schließen", knopf: "Monat schließen", text: "Schließen friert die Summe ein; danach nimmt die Theke für diesen Monat nichts mehr an." };
  }
  if (m.status === "closed") {
    return { marke: "abrechnen", knopf: "Forderungen erzeugen", text: "Die Summe steht fest. Das Abrechnen macht daraus Forderungen je Mitglied." };
  }
  if (m.offen > 0) {
    return { marke: "ankündigen", knopf: `${m.offen} ankündigen`, text: "Ohne Vorabankündigung darf nicht eingezogen werden." };
  }
  return null;
}

function monatsname(m: MonatZeile): string {
  return MONAT.format(new Date(m.year, m.month - 1, 1));
}

export function GetraenkemonatKarte({
  monate,
  onGeaendert,
  fristTage,
}: {
  monate: MonatZeile[];
  /** Nach jeder erfolgreichen Aktion - der Aufrufer laedt neu. */
  onGeaendert: () => void | Promise<void>;
  /** Vorabankuendigungsfrist; fehlt sie, wird sie beim Ankuendigen geladen. */
  fristTage?: number;
}) {
  const { stil, farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [gewaehlt, setGewaehlt] = useState<MonatZeile | null>(null);

  // Numerisch vergleichen statt ueber Date - der laufende Monat in Berlin.
  const heute = heuteInBerlin();
  const jetzt = Number(heute.slice(0, 4)) * 12 + Number(heute.slice(5, 7));

  async function schrittAusfuehren(m: MonatZeile, schliessen: () => void) {
    await ausfuehren(
      async () => {
        if (m.status === "open") return monatSchliessen(m.year, m.month);
        if (m.status === "closed") return monatAbrechnen(m.year, m.month, null);
        // Der frueheste Tag, an dem eingezogen werden darf.
        const frist = fristTage ?? (await ladeAnkuendigungsfrist());
        return forderungenAnkuendigen({
          faelligAm: plusTage(heuteInBerlin(), frist + 1),
          art: "drinks",
          zeitraum: `${m.year}-${String(m.month).padStart(2, "0")}`,
        });
      },
      async () => {
        schliessen();
        await onGeaendert();
      },
    );
  }

  const schritt = gewaehlt ? naechsterSchritt(gewaehlt, jetzt) : null;

  return (
    <Abschnitt>
      <Gruppenkopf titel="Getränkemonate" />
      <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
        Erst schließen, dann abrechnen. Ein geschlossener Monat lässt sich an der Theke nicht
        mehr verändern – nur so steht der Betrag fest, bevor er angekündigt wird.
      </Text>

      <Meldung meldung={meldung} />

      <ListenGruppe>
        {monate.length === 0 ? (
          <LeereZeile text="Es gibt noch keine Abrechnungszeiträume." />
        ) : (
          monate.map((m) => {
            const s = naechsterSchritt(m, jetzt);
            return (
              <Listenzeile
                key={m.id}
                symbol={String(m.month).padStart(2, "0")}
                titel={monatsname(m)}
                kontext={`${m.buchungen} Entnahmen · ${m.mitglieder} Mitglieder${m.forderungen ? ` · ${m.forderungen} Forderungen` : ""}`}
                neben={
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                      {formatCents(m.summe_cents)}
                    </Text>
                    <Statusmarke text={s?.marke ?? STAND[m.status]} ton={s ? "gelb" : STAND_TON[m.status]} />
                  </View>
                }
                onPress={s ? () => setGewaehlt(m) : undefined}
                pfeil={Boolean(s)}
              />
            );
          })
        )}
      </ListenGruppe>

      {gewaehlt && (
        <FormBlatt titel={monatsname(gewaehlt)} unterzeile={STAND[gewaehlt.status]} onSchliessen={() => setGewaehlt(null)}>
          {(schliessen) => (
            <>
              <View style={{ backgroundColor: farben.surf2, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 16 }}>
                <Wertzeile name="Entnahmen" wert={String(gewaehlt.buchungen)} />
                <Wertzeile name="Mitglieder" wert={String(gewaehlt.mitglieder)} />
                <Wertzeile name="Summe" wert={formatCents(gewaehlt.summe_cents)} />
                <Wertzeile name="Forderungen" wert={gewaehlt.forderungen ? String(gewaehlt.forderungen) : "—"} />
              </View>
              {schritt && <Text style={[stil.leise, { fontSize: 14 }]}>{schritt.text}</Text>}
              <Meldung meldung={meldung && !meldung.ok ? meldung : null} />
              {schritt && (
                <Knopf
                  art="gold"
                  gross
                  text={schritt.knopf}
                  laeuft={laeuft}
                  onPress={() => void schrittAusfuehren(gewaehlt, schliessen)}
                />
              )}
            </>
          )}
        </FormBlatt>
      )}
    </Abschnitt>
  );
}
