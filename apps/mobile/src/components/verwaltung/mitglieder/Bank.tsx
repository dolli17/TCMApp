/**
 * Bereich Bankverbindung und SEPA-Mandat (Nachbau von
 * apps/web/src/components/BankUndMandatKarte.tsx)
 *
 * Die IBAN wird beim Tippen geprueft und formatiert - dieselbe
 * Pruefziffernrechnung wie in der Datenbank, damit der Kassenwart den Fehler
 * sofort sieht. Gespeicherte IBANs kommen nie wieder heraus: angezeigt
 * werden die letzten vier Stellen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatIban, isValidIban, normalizeIban } from "@tcm/core";
import {
  FormBlatt, FormFeld, FormGruppe, Karte, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import { ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import {
  bankverbindungAnlegen, bankverbindungStilllegen, ladeFinanzen, mandatErteilen, mandatWiderrufen,
  type FinanzZeile,
} from "@/lib/verwaltung/mitglieder";

const STATUS_TEXT: Record<string, string> = { active: "aktiv", revoked: "widerrufen", expired: "abgelaufen" };

interface Konto {
  id: string;
  last4: string;
  holder: string;
  bank: string | null;
  aktiv: boolean;
  mandate: FinanzZeile[];
}

function buendeln(zeilen: FinanzZeile[]): Konto[] {
  const map = new Map<string, Konto>();
  for (const z of zeilen) {
    let k = map.get(z.bank_account_id);
    if (!k) {
      k = { id: z.bank_account_id, last4: z.iban_last4, holder: z.holder, bank: z.bank_name, aktiv: z.konto_aktiv, mandate: [] };
      map.set(z.bank_account_id, k);
    }
    if (z.mandate_id) k.mandate.push(z);
  }
  return [...map.values()];
}

export function Bank({ mitgliedId, onGeaendert }: { mitgliedId: string; onGeaendert: () => Promise<void> }) {
  const { farben, stil } = useTheme();
  const zustand = useLaden(() => ladeFinanzen(mitgliedId));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [kontoOffen, setKontoOffen] = useState(false);
  const [mandatFuer, setMandatFuer] = useState<string | null>(null);
  const konten = buendeln(zustand.daten ?? []);

  async function geaendert() {
    await Promise.all([onGeaendert(), zustand.erneutHolen()]);
  }
  async function gespeichert(text: string) {
    setMeldung({ ok: true, text });
    await geaendert();
  }

  return (
    <>
      <Karte
        titel="Bankverbindung und SEPA-Mandat"
        unterzeile="Ohne gültiges Mandat erscheint das Mitglied nicht in der Lastschriftdatei und muss überweisen."
      >
        {zustand.fehler && <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>}
        <Meldung meldung={meldung} />
        {!zustand.laedt && !zustand.fehler && konten.length === 0 && (
          <Text style={stil.leise}>Keine Bankverbindung erfasst.</Text>
        )}

        {konten.map((k) => (
          <View key={k.id} style={{ gap: 8, marginTop: 6 }}>
            {/* Nur die vier Stellen, die wir wirklich haben. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16, fontFamily: "Barlow_700Bold", color: farben.ink }}>IBAN •••• {k.last4}</Text>
              <Statusmarke ton={k.aktiv ? "gruen" : "grau"} text={k.aktiv ? "aktiv" : "stillgelegt"} />
            </View>
            <Text style={stil.leise}>
              {k.holder}
              {k.bank ? ` · ${k.bank}` : ""}
            </Text>

            {k.mandate.length === 0 ? (
              <Text style={stil.leise}>Kein Mandat zu dieser Bankverbindung.</Text>
            ) : (
              <ListenGruppe>
                {k.mandate.map((m) => {
                  const aktiv = m.mandat_status === "active";
                  return (
                    <View key={m.mandate_id}>
                      <Listenzeile
                        titel={`${m.reference}${m.reference_conflict ? " · doppelt" : ""}`}
                        kontext={`unterschrieben ${datum(m.signed_on)} · zuletzt genutzt ${datum(m.last_used_on)}`}
                        hinweis={m.im_einzug && aktiv ? "im Einzug" : (STATUS_TEXT[m.mandat_status ?? ""] ?? m.mandat_status)}
                        hinweisTon={aktiv ? "gruen" : "leise"}
                      />
                      {/* Keine Knoepfe in der Zeile: Widerrufen als rote Zeile, mit Rueckfrage. */}
                      {aktiv && !m.im_einzug && (
                        <View style={{ borderTopWidth: 1, borderTopColor: farben.line }}>
                          <Listenzeile
                            titel="Widerrufen"
                            gefahr
                            pfeil={false}
                            onPress={() =>
                              !laeuft &&
                              bestaetige(
                                "Mandat widerrufen?",
                                `Mandat ${m.reference} wird widerrufen. Danach wird nicht mehr per Lastschrift eingezogen.`,
                                "Wirklich widerrufen",
                                () => void ausfuehren(() => mandatWiderrufen(m.mandate_id), geaendert),
                              )
                            }
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ListenGruppe>
            )}

            {k.aktiv && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Knopf klein text="Mandat erteilen" deaktiviert={laeuft} onPress={() => setMandatFuer(k.id)} />
                {k.mandate.every((m) => m.mandat_status !== "active") && (
                  <Knopf
                    art="leise"
                    klein
                    text="Bankverbindung stilllegen"
                    deaktiviert={laeuft}
                    onPress={() => void ausfuehren(() => bankverbindungStilllegen(k.id), geaendert)}
                  />
                )}
              </View>
            )}
          </View>
        ))}

        <View style={{ marginTop: 8 }}>
          <Knopf text="Bankverbindung hinzufügen" deaktiviert={laeuft} onPress={() => setKontoOffen(true)} />
        </View>
      </Karte>

      {kontoOffen && (
        <KontoBlatt mitgliedId={mitgliedId} onSchliessen={() => setKontoOffen(false)} onGespeichert={gespeichert} />
      )}
      {mandatFuer && (
        <MandatBlatt
          mitgliedId={mitgliedId}
          konto={konten.find((k) => k.id === mandatFuer)!}
          onSchliessen={() => setMandatFuer(null)}
          onGespeichert={gespeichert}
        />
      )}
    </>
  );
}

function KontoBlatt(props: { mitgliedId: string; onSchliessen: () => void; onGespeichert: (t: string) => Promise<void> }) {
  const { stil } = useTheme();
  const [iban, setIban] = useState("");
  const [inhaber, setInhaber] = useState("");
  const [bank, setBank] = useState("");
  const { laeuft, meldung, ausfuehren } = useAktion();

  const roh = normalizeIban(iban);
  const geprueft = roh.length === 0 ? null : isValidIban(roh);

  return (
    <FormBlatt titel="Bankverbindung hinzufügen" onSchliessen={props.onSchliessen}>
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe>
            <FormFeld
              label="IBAN"
              wert={iban}
              onAendern={setIban}
              platzhalter="DE00 0000 0000 0000 0000 00"
              gross="characters"
              beschreibung={geprueft === true ? `Prüfziffer stimmt: ${formatIban(roh)}` : undefined}
            />
            <FormFeld label="Kontoinhaber" wert={inhaber} onAendern={setInhaber} platzhalter="wie das Mitglied" gross="words" />
            <FormFeld label="Bank" wert={bank} onAendern={setBank} />
          </FormGruppe>
          {geprueft === false && (
            <Text style={stil.hinweisFehler}>Diese IBAN ist nicht gültig – bitte die Ziffern prüfen.</Text>
          )}
          <Text style={stil.leise}>
            Die IBAN wird verschlüsselt gespeichert und danach nur noch mit den letzten vier Stellen angezeigt –
            auch für den Vorstand.
          </Text>
          <Knopf
            art="gold"
            gross
            text="Speichern"
            laeuftText="Wird gespeichert…"
            laeuft={laeuft}
            deaktiviert={geprueft !== true}
            onPress={() =>
              void ausfuehren(
                () => bankverbindungAnlegen(props.mitgliedId, { iban, holder: inhaber, bank_name: bank }),
                async (e) => {
                  zu();
                  await props.onGespeichert(e.meldung);
                },
              )
            }
          />
        </>
      )}
    </FormBlatt>
  );
}

function MandatBlatt(props: {
  mitgliedId: string;
  konto: Konto;
  onSchliessen: () => void;
  onGespeichert: (t: string) => Promise<void>;
}) {
  const [unterschrieben, setUnterschrieben] = useState(isoZuDeutsch(heuteInBerlin()));
  const [referenz, setReferenz] = useState("");
  const { laeuft, meldung, ausfuehren } = useAktion();

  return (
    <FormBlatt titel="Mandat erteilen" kicker={`IBAN •••• ${props.konto.last4}`} onSchliessen={props.onSchliessen}>
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe>
            <FormFeld
              label="Unterschrieben"
              wert={unterschrieben}
              onAendern={setUnterschrieben}
              platzhalter="TT.MM.JJJJ"
              tastatur="numbers-and-punctuation"
            />
            <FormFeld
              label="Referenz"
              wert={referenz}
              onAendern={setReferenz}
              platzhalter="automatisch"
              gross="characters"
              beschreibung="Bestandsmandate aus eBuSy behalten ihre Referenz – nur dann bleiben sie gültig."
            />
          </FormGruppe>
          <Knopf
            art="gold"
            gross
            text="Mandat erteilen"
            laeuftText="Wird erteilt…"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () =>
                  mandatErteilen(props.mitgliedId, {
                    konto: props.konto.id,
                    reference: referenz,
                    signed_on: unterschrieben,
                  }),
                async (e) => {
                  zu();
                  await props.onGespeichert(e.meldung);
                },
              )
            }
          />
        </>
      )}
    </FormBlatt>
  );
}
