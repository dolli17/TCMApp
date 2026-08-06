"use client";

import { useState, useTransition } from "react";
import { formatIban, isValidIban, normalizeIban } from "@tcm/core";
import {
  bankverbindungAnlegen,
  bankverbindungStilllegen,
  mandatErteilen,
  mandatWiderrufen,
} from "@/app/admin/mitglieder/[id]/finanz-aktionen";

export interface FinanzZeile {
  bank_account_id: string;
  iban_last4: string;
  holder: string;
  bank_name: string | null;
  konto_aktiv: boolean;
  mandate_id: string | null;
  reference: string | null;
  signed_on: string | null;
  last_used_on: string | null;
  scope: "fees_only" | "all_payments" | null;
  sequence_type: string | null;
  mandat_status: "active" | "revoked" | "expired" | null;
  revoked_on: string | null;
  reference_conflict: boolean | null;
  im_einzug: boolean;
}

interface Konto {
  id: string;
  last4: string;
  holder: string;
  bank: string | null;
  aktiv: boolean;
  mandate: FinanzZeile[];
}

const UMFANG_TEXT: Record<string, string> = {
  fees_only: "nur Beiträge",
  all_payments: "alle Zahlungen",
};

const STATUS_TEXT: Record<string, string> = {
  active: "aktiv",
  revoked: "widerrufen",
  expired: "abgelaufen",
};

function datum(wert: string | null): string {
  return wert ? new Intl.DateTimeFormat("de-DE").format(new Date(wert)) : "—";
}

function buendeln(zeilen: FinanzZeile[]): Konto[] {
  const map = new Map<string, Konto>();
  for (const z of zeilen) {
    let k = map.get(z.bank_account_id);
    if (!k) {
      k = {
        id: z.bank_account_id,
        last4: z.iban_last4,
        holder: z.holder,
        bank: z.bank_name,
        aktiv: z.konto_aktiv,
        mandate: [],
      };
      map.set(z.bank_account_id, k);
    }
    if (z.mandate_id) k.mandate.push(z);
  }
  return [...map.values()];
}

/**
 * Bankverbindungen und SEPA-Mandate.
 *
 * Die IBAN wird beim Tippen geprüft und formatiert – dieselbe Prüfziffer-
 * rechnung, die auch die Datenbank anwendet. Sie doppelt zu haben ist Absicht:
 * so sieht der Kassenwart den Fehler sofort im Feld, statt nach dem Absenden.
 *
 * Gespeicherte IBANs kommen nie wieder heraus: angezeigt werden die letzten
 * vier Ziffern, mehr gibt die Datenbank auch dem Vorstand nicht heraus. Der
 * Klartext existiert dort nur verschlüsselt.
 */
export function BankUndMandatKarte({
  mitgliedId,
  zeilen,
}: {
  mitgliedId: string;
  zeilen: FinanzZeile[];
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [iban, setIban] = useState("");
  const [kontoOffen, setKontoOffen] = useState(false);
  const [mandatFuer, setMandatFuer] = useState<string | null>(null);
  const [widerrufOffen, setWiderrufOffen] = useState<string | null>(null);

  const konten = buendeln(zeilen);

  const ibanRoh = normalizeIban(iban);
  const ibanGeprueft = ibanRoh.length === 0 ? null : isValidIban(ibanRoh);

  function abschicken(fd: FormData, was: (fd: FormData) => Promise<{ ok: boolean; meldung: string }>) {
    starte(async () => {
      const e = await was(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) {
        setKontoOffen(false);
        setMandatFuer(null);
        setIban("");
      }
    });
  }

  function fuehreAus(auf: () => Promise<{ ok: boolean; meldung: string }>) {
    starte(async () => {
      const e = await auf();
      setMeldung({ ok: e.ok, text: e.meldung });
      setWiderrufOffen(null);
    });
  }

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <section className="karte einstellungen" aria-label="Bankverbindung und Mandat">
      <h2 className="dpl">Bankverbindung und SEPA-Mandat</h2>
      <p className="unterzeile">
        Ohne gültiges Mandat erscheint das Mitglied nicht in der Lastschriftdatei und muss
        überweisen.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {konten.length === 0 && (
        <p className="leer">Keine Bankverbindung erfasst.</p>
      )}

      {konten.map((k) => (
        <div key={k.id} className="einstellung">
          {/* Nur die vier Stellen, die wir wirklich haben. Ein erfundenes
              Länderkürzel davorzusetzen wäre bequemer zu lesen und trotzdem
              falsch – die gespeicherte IBAN kommt nie wieder heraus. */}
          <span className="titel">
            IBAN •••• {k.last4}{" "}
            {k.aktiv ? (
              <span className="marke-klein gruen">aktiv</span>
            ) : (
              <span className="marke-klein grau">stillgelegt</span>
            )}
          </span>
          <span className="beschreibung">
            {k.holder}
            {k.bank ? ` · ${k.bank}` : ""}
          </span>

          {k.mandate.length === 0 ? (
            <p className="beschreibung">Kein Mandat zu dieser Bankverbindung.</p>
          ) : (
            <div className="tabellenhuelle">
              <table className="liste">
                <thead>
                  <tr>
                    <th>Referenz</th>
                    <th>Unterschrieben</th>
                    <th>Zuletzt genutzt</th>
                    <th>Umfang</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {k.mandate.map((m) => (
                    <tr key={m.mandate_id}>
                      <td>
                        {m.reference}
                        {m.reference_conflict && (
                          <span className="marke-klein rot" title="Aus eBuSy mit mehrfach vergebener Referenz">
                            doppelt
                          </span>
                        )}
                      </td>
                      <td>{datum(m.signed_on)}</td>
                      <td>{datum(m.last_used_on)}</td>
                      <td>{UMFANG_TEXT[m.scope ?? ""] ?? m.scope}</td>
                      <td>
                        <span
                          className={`marke-klein ${m.mandat_status === "active" ? "gruen" : "grau"}`}
                        >
                          {STATUS_TEXT[m.mandat_status ?? ""] ?? m.mandat_status}
                        </span>
                      </td>
                      <td>
                        {m.mandat_status === "active" &&
                          (m.im_einzug ? (
                            <span className="beschreibung">im Einzug</span>
                          ) : widerrufOffen === m.mandate_id ? (
                            <>
                              <button
                                className="knopf leise klein"
                                disabled={laeuft}
                                onClick={() => setWiderrufOffen(null)}
                              >
                                Abbrechen
                              </button>{" "}
                              <button
                                className="knopf gefahr klein"
                                disabled={laeuft}
                                onClick={() => fuehreAus(() => mandatWiderrufen(mitgliedId, m.mandate_id!))}
                              >
                                Wirklich widerrufen
                              </button>
                            </>
                          ) : (
                            <button
                              className="knopf leise klein"
                              disabled={laeuft}
                              onClick={() => setWiderrufOffen(m.mandate_id)}
                            >
                              Widerrufen
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {k.aktiv && (
            <div className="detailkopf aktionen" style={{ marginTop: 10 }}>
              {mandatFuer === k.id ? null : (
                <button
                  className="knopf klein"
                  disabled={laeuft}
                  onClick={() => setMandatFuer(k.id)}
                >
                  Mandat erteilen
                </button>
              )}
              {k.mandate.every((m) => m.mandat_status !== "active") && (
                <button
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() => fuehreAus(() => bankverbindungStilllegen(mitgliedId, k.id))}
                >
                  Bankverbindung stilllegen
                </button>
              )}
            </div>
          )}

          {mandatFuer === k.id && (
            <form action={(fd) => abschicken(fd, mandatErteilen)} style={{ marginTop: 10 }}>
              <input type="hidden" name="mitglied" value={mitgliedId} />
              <input type="hidden" name="konto" value={k.id} />
              <div className="formraster eng">
                <label>
                  <span>Unterschrieben am</span>
                  <input type="date" name="signed_on" defaultValue={heute} max={heute} />
                </label>
                <label>
                  <span>Umfang</span>
                  <select name="scope" defaultValue="fees_only">
                    <option value="fees_only">nur Beiträge</option>
                    <option value="all_payments">alle Zahlungen</option>
                  </select>
                </label>
                <label>
                  <span>Referenz</span>
                  <input name="reference" placeholder="automatisch" />
                  <span className="beschreibung">
                    Bestandsmandate aus eBuSy behalten ihre Referenz – nur dann bleiben sie gültig.
                  </span>
                </label>
              </div>
              <div className="detailkopf aktionen">
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() => setMandatFuer(null)}
                >
                  Abbrechen
                </button>
                <button className="knopf klein" disabled={laeuft}>
                  {laeuft ? "Wird erteilt…" : "Mandat erteilen"}
                </button>
              </div>
            </form>
          )}
        </div>
      ))}

      {!kontoOffen ? (
        <button className="knopf" disabled={laeuft} onClick={() => setKontoOffen(true)}>
          Bankverbindung hinzufügen
        </button>
      ) : (
        <form action={(fd) => abschicken(fd, bankverbindungAnlegen)}>
          <input type="hidden" name="mitglied" value={mitgliedId} />
          <div className="formraster">
            <label className="breit">
              <span>IBAN</span>
              <input
                name="iban"
                value={iban}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={ibanGeprueft === false}
                placeholder="DE00 0000 0000 0000 0000 00"
                onChange={(e) => setIban(e.target.value)}
                onBlur={() => ibanGeprueft && setIban(formatIban(ibanRoh))}
              />
              {ibanGeprueft === false && (
                <span className="feldfehler">
                  Diese IBAN ist nicht gültig – bitte die Ziffern prüfen.
                </span>
              )}
              {ibanGeprueft === true && (
                <span className="beschreibung">Prüfziffer stimmt: {formatIban(ibanRoh)}</span>
              )}
            </label>
            <label>
              <span>Kontoinhaber</span>
              <input name="holder" placeholder="wie das Mitglied" autoComplete="off" />
            </label>
            <label>
              <span>Bank</span>
              <input name="bank_name" autoComplete="off" />
            </label>
          </div>

          <p className="beschreibung">
            Die IBAN wird verschlüsselt gespeichert und danach nur noch mit den letzten vier
            Stellen angezeigt – auch für den Vorstand.
          </p>

          <div className="detailkopf aktionen">
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => {
                setKontoOffen(false);
                setIban("");
              }}
            >
              Abbrechen
            </button>
            <button className="knopf" disabled={laeuft || ibanGeprueft !== true}>
              {laeuft ? "Wird gespeichert…" : "Speichern"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
