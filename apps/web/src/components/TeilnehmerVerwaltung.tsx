"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eventTagKurz, formatCents, stundenText, type EventRegistrationStatus } from "@tcm/core";
import {
  anwesenheitSetzen, stundenGutschreiben, teilnahmeAbmelden, teilnahmeAendern, teilnehmerHinzufuegen,
} from "@/app/admin/veranstaltungen/aktionen";

export interface TeilnehmerZeileVoll {
  registration_id: string;
  member_id: string;
  member_name: string;
  companions: number;
  note: string | null;
  status: EventRegistrationStatus;
  attended: boolean;
  registered_at: string;
  waitlisted_at: string | null;
  cancelled_at: string | null;
  charge_cents: number | null;
  charge_gesperrt: boolean;
  gutgeschrieben: boolean;
}

/**
 * Die Teilnehmer einer Veranstaltung mit allem, was der Vorstand korrigiert
 * (Entwurf AdminDetail): Begleitpersonen und Bemerkung ändern, abmelden, von
 * der Warteliste holen, jemanden nachtragen, Anwesende abhaken und beim
 * Arbeitsdienst die Stunden gutschreiben.
 *
 * Jede Korrektur zieht die Forderung in der Kasse mit; steckt sie schon in
 * einem Einzug, lehnt die Datenbank ab und die Meldung sagt es.
 */
export function TeilnehmerVerwaltung({
  eventId, zeilen, mitglieder, begonnen, abgesagt, mitBegleitung, mitGebuehr, stunden,
}: {
  eventId: string;
  zeilen: TeilnehmerZeileVoll[];
  mitglieder: { id: string; name: string }[];
  begonnen: boolean;
  abgesagt: boolean;
  mitBegleitung: boolean;
  mitGebuehr: boolean;
  /** Stunden je Teilnahme beim Arbeitsdienst, sonst null */
  stunden: number | null;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [bearbeiten, setBearbeiten] = useState<{ id: string; begleitung: string; bemerkung: string } | null>(null);
  const [abmelden, setAbmelden] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [begleitung, setBegleitung] = useState("0");
  const [bemerkung, setBemerkung] = useState("");
  const [da, setDa] = useState<Record<string, boolean>>({});
  const [laeuft, starte] = useTransition();

  const angemeldet = zeilen.filter((z) => z.status === "registered");
  const offeneStunden = angemeldet.filter((z) => z.attended && !z.gutgeschrieben).length;
  const schon = new Set(zeilen.filter((z) => z.status !== "cancelled").map((z) => z.member_id));
  const waehlbar = mitglieder.filter((m) => !schon.has(m.id));

  function tue(
    aktion: () => Promise<{ ok: boolean; meldung: string }>,
    danach?: () => void,
    fehlgeschlagen?: () => void,
  ) {
    starte(async () => {
      const e = await aktion();
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) {
        danach?.();
        router.refresh();
      } else {
        fehlgeschlagen?.();
      }
    });
  }

  function hinzufuegen() {
    const m = waehlbar.find((x) => x.name === name.trim());
    if (!m) {
      setMeldung({ ok: false, text: "Bitte ein Mitglied aus der Liste wählen." });
      return;
    }
    tue(
      () => teilnehmerHinzufuegen({
        eventId, mitgliedId: m.id, begleitpersonen: Number(begleitung) || 0, bemerkung,
      }),
      () => { setName(""); setBegleitung("0"); setBemerkung(""); },
    );
  }

  function seit(z: TeilnehmerZeileVoll): string {
    if (z.status === "cancelled") return `abgemeldet ${z.cancelled_at ? eventTagKurz(z.cancelled_at) : ""}`;
    if (z.status === "waitlisted") return `Warteliste seit ${eventTagKurz(z.waitlisted_at ?? z.registered_at)}`;
    return eventTagKurz(z.registered_at);
  }

  function betrag(z: TeilnehmerZeileVoll): string {
    if (z.charge_cents != null) {
      return `${formatCents(z.charge_cents)}${z.charge_gesperrt ? " · im Einzug" : ""}`;
    }
    if (!mitGebuehr) return "–";
    if (z.status === "cancelled") return "Forderung gelöscht";
    if (z.status === "waitlisted") return "erst beim Nachrücken";
    return "–";
  }

  return (
    <section className="karte gross teilnehmer" aria-labelledby="h-tn">
      <div className="abschnittskopf">
        <h2 id="h-tn" className="dpl">Teilnehmer</h2>
        <span className="unterzeile">Mitglieder sehen nur die Anzahl, nicht die Namen.</span>
      </div>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">{meldung.text}</div>
      )}

      {zeilen.length === 0 ? (
        <p className="leer-klein">Noch niemand angemeldet.</p>
      ) : (
        <div className="tabellenhuelle">
          <table className="liste teilnehmer-tabelle">
            <thead>
              <tr>
                <th>Mitglied</th><th>Personen</th><th>Bemerkung</th><th>Angemeldet</th><th>Da</th>
                <th className="zahl">Betrag</th><th><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => {
                const imBearbeiten = bearbeiten?.id === z.registration_id;
                return (
                  <tr key={z.registration_id} className={z.status === "cancelled" ? "abgemeldet" : z.status === "waitlisted" ? "wartend" : undefined}>
                    <td><b>{z.member_name}</b></td>
                    <td className="tnum">
                      {imBearbeiten && mitBegleitung ? (
                        <>
                          <input
                            className="klein-zahl" inputMode="numeric" value={bearbeiten.begleitung}
                            aria-label={`Begleitpersonen von ${z.member_name}`}
                            onChange={(e) => setBearbeiten({ ...bearbeiten, begleitung: e.target.value })}
                          />
                          <small> Begl.</small>
                        </>
                      ) : (
                        1 + z.companions
                      )}
                    </td>
                    <td>
                      {imBearbeiten ? (
                        <input
                          value={bearbeiten.bemerkung} maxLength={500}
                          aria-label={`Bemerkung von ${z.member_name}`}
                          onChange={(e) => setBearbeiten({ ...bearbeiten, bemerkung: e.target.value })}
                        />
                      ) : (
                        z.note ?? <span className="leise">–</span>
                      )}
                    </td>
                    <td>{seit(z)}</td>
                    <td>
                      {z.status === "registered" && begonnen && !abgesagt ? (
                        <input
                          type="checkbox"
                          checked={da[z.registration_id] ?? z.attended}
                          disabled={laeuft || z.gutgeschrieben}
                          aria-label={`${z.member_name} war da`}
                          onChange={(e) => {
                            const an = e.target.checked;
                            // Der Haken steht sofort; schlaegt das Speichern fehl, springt er zurueck.
                            setDa((alt) => ({ ...alt, [z.registration_id]: an }));
                            tue(
                              () => anwesenheitSetzen(eventId, z.registration_id, an),
                              undefined,
                              () => setDa((alt) => ({ ...alt, [z.registration_id]: !an })),
                            );
                          }}
                        />
                      ) : z.attended ? "✓" : null}
                      {z.gutgeschrieben && <small className="leise"> Std. ✓</small>}
                    </td>
                    <td className="zahl">{betrag(z)}</td>
                    <td className="zeilen-knoepfe">
                      {abgesagt ? null : imBearbeiten ? (
                        <>
                          <button
                            type="button" className="knopf klein" disabled={laeuft}
                            onClick={() => tue(
                              () => teilnahmeAendern({
                                eventId, anmeldungId: z.registration_id,
                                begleitpersonen: Number(bearbeiten.begleitung) || 0, bemerkung: bearbeiten.bemerkung,
                              }),
                              () => setBearbeiten(null),
                            )}
                          >
                            Sichern
                          </button>
                          <button type="button" className="knopf leise klein" onClick={() => setBearbeiten(null)}>
                            Abbrechen
                          </button>
                        </>
                      ) : abmelden === z.registration_id ? (
                        <>
                          <button
                            type="button" className="knopf gefahr klein" disabled={laeuft}
                            onClick={() => tue(() => teilnahmeAbmelden(eventId, z.registration_id), () => setAbmelden(null))}
                          >
                            Ja, abmelden
                          </button>
                          <button type="button" className="knopf leise klein" onClick={() => setAbmelden(null)}>
                            Nein
                          </button>
                        </>
                      ) : z.status === "cancelled" ? null : (
                        <>
                          {z.status === "waitlisted" && (
                            <button
                              type="button" className="knopf leise klein" disabled={laeuft}
                              onClick={() => tue(() => teilnehmerHinzufuegen({
                                eventId, mitgliedId: z.member_id, begleitpersonen: z.companions, bemerkung: z.note ?? "",
                              }))}
                            >
                              Aufnehmen
                            </button>
                          )}
                          <button
                            type="button" className="knopf leise klein" disabled={laeuft}
                            aria-label={`${z.member_name} ändern`}
                            onClick={() => setBearbeiten({
                              id: z.registration_id, begleitung: String(z.companions), bemerkung: z.note ?? "",
                            })}
                          >
                            Ändern
                          </button>
                          <button
                            type="button" className="knopf gefahr-leise klein" disabled={laeuft}
                            aria-label={`${z.member_name} abmelden`}
                            onClick={() => setAbmelden(z.registration_id)}
                          >
                            Abmelden
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!abgesagt && (
        <form
          className="teilnehmer-hinzu"
          onSubmit={(e) => { e.preventDefault(); hinzufuegen(); }}
          aria-label="Teilnehmer nachtragen"
        >
          <label className="breit">
            <span>Mitglied nachtragen</span>
            <input list="event-mitglieder" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <datalist id="event-mitglieder">
              {waehlbar.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </label>
          {mitBegleitung && (
            <label>
              <span>Begleitpersonen</span>
              <input inputMode="numeric" value={begleitung} onChange={(e) => setBegleitung(e.target.value)} />
            </label>
          )}
          <label>
            <span>Bemerkung</span>
            <input value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} maxLength={500} />
          </label>
          <button type="submit" className="knopf leise" disabled={laeuft}>Anmelden</button>
          <small className="unterzeile">
            Der Vorstand darf auch nach dem Anmeldeschluss und über die Plätze hinaus nachtragen.
          </small>
        </form>
      )}

      {stunden != null && !abgesagt && (
        <div className="stunden-gutschreiben">
          <div>
            <b>Stunden gutschreiben</b>
            <span className="unterzeile">
              {begonnen
                ? offeneStunden > 0
                  ? `${offeneStunden} ${offeneStunden === 1 ? "Anwesender" : "Anwesende"} × ${stundenText(stunden)} Std. Die Stunden landen bestätigt im Arbeitsdienst.`
                  : angemeldet.some((z) => z.attended)
                    ? "Alle Anwesenden haben ihre Stunden. Wer noch abgehakt wird, kann danach gutgeschrieben werden."
                    : "Erst die Anwesenden in der Spalte „Da“ abhaken."
                : "Möglich, sobald der Arbeitsdienst begonnen hat."}
            </span>
          </div>
          <button
            type="button" className="knopf gold" disabled={laeuft || !begonnen || offeneStunden === 0}
            onClick={() => tue(() => stundenGutschreiben(eventId))}
          >
            Stunden gutschreiben
          </button>
        </div>
      )}
    </section>
  );
}
