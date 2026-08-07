"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  dateiErzeugen, laufAbschliessen, laufEingereicht, postenAufnehmen, ruecklaeuferErfassen,
} from "@/app/admin/kasse/lastschriften/aktionen";

export interface KandidatZeile {
  payer_id: string;
  payer_name: string;
  charge_ids: string[];
  positionen: number;
  arten: string;
  amount_cents: number;
  mandate_id: string | null;
  mandate_reference: string | null;
  mandate_scope: "fees_only" | "all_payments" | null;
  einzugsfaehig: boolean;
  grund: string | null;
}

export interface PostenZeile {
  end_to_end_id: string;
  payer_name: string;
  mitglieder: string;
  positionen: number;
  amount_cents: number;
  mandate_reference: string;
  result: "pending" | "settled" | "returned";
  return_reason: string | null;
  returned_on: string | null;
}

export interface LaufKopf {
  id: string;
  title: string;
  collection_date: string;
  status: "draft" | "generated" | "submitted" | "completed";
  total_cents: number;
  item_count: number;
  storage_path: string | null;
}

const DATUM = new Intl.DateTimeFormat("de-DE");

const STAND: Record<LaufKopf["status"], string> = {
  draft: "Entwurf",
  generated: "Datei erzeugt",
  submitted: "eingereicht",
  completed: "abgeschlossen",
};

/**
 * Ein Lastschriftlauf von der Auswahl bis zur Datei.
 *
 * Der Ablauf steht als Reihenfolge auf der Seite: wer kommt in Frage, wer
 * nicht und warum, dann aufnehmen, dann die Datei, dann einreichen. Nach dem
 * Erzeugen ist der Lauf zu — die Datei ist ein Buchungsbeleg und darf sich
 * nicht mehr ändern.
 */
export function LastschriftLauf({
  lauf, kandidaten, posten,
}: {
  lauf: LaufKopf;
  kandidaten: KandidatZeile[];
  posten: PostenZeile[];
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [zurueck, setZurueck] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, starte] = useTransition();

  const moeglich = kandidaten.filter((k) => k.einzugsfaehig);
  const draussen = kandidaten.filter((k) => !k.einzugsfaehig);
  const summeMoeglich = moeglich.reduce((s, k) => s + k.amount_cents, 0);

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  return (
    <>
      <h1 className="pagetitle">{lauf.title}</h1>
      <p className="unterzeile">
        Fällig am {DATUM.format(new Date(lauf.collection_date))} ·{" "}
        <span className="marke-klein">{STAND[lauf.status]}</span>
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Lastschriften</div>
          <div className="wert">{lauf.item_count}</div>
        </div>
        <div className="kachel">
          <div className="titel">Summe</div>
          <div className="wert">{formatCents(lauf.total_cents)}</div>
        </div>
        <div className="kachel">
          <div className="titel">Bleiben außen vor</div>
          <div className="wert">{draussen.length}</div>
          <div className="titel">brauchen Handarbeit</div>
        </div>
      </div>

      {lauf.status === "draft" && (
        <section className="karte" style={{ marginBottom: 18 }}>
          <h2 className="dpl">Wer geht mit?</h2>
          <p className="unterzeile">
            Eine Zeile je späterer Lastschrift. Mehrere Forderungen desselben Zahlers werden zu
            einer Buchung zusammengefasst – so steht es auch auf seinem Kontoauszug.
          </p>

          <div className="tabellenhuelle"><table className="liste">
            <thead>
              <tr>
                <th>Zahler</th>
                <th className="zahl">Posten</th>
                <th className="zahl">Betrag</th>
                <th>Mandat</th>
                <th>Steht dem etwas entgegen?</th>
              </tr>
            </thead>
            <tbody>
              {kandidaten.map((k) => (
                <tr key={k.payer_id}>
                  <td>
                    {k.payer_name}
                    <div className="mit">{k.arten}</div>
                  </td>
                  <td className="zahl tnum">{k.positionen}</td>
                  <td className="zahl tnum">{formatCents(k.amount_cents)}</td>
                  <td className="mit">{k.mandate_reference ?? "—"}</td>
                  <td>
                    {k.einzugsfaehig ? (
                      <span className="marke-klein">geht mit</span>
                    ) : (
                      <span style={{ color: "var(--red)" }}>{k.grund}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <div className="fenster-fuss">
            <button
              type="button"
              className="knopf"
              disabled={laeuft || moeglich.length === 0}
              onClick={() => starte(async () => melde(await postenAufnehmen(lauf.id, null)))}
            >
              {moeglich.length} {moeglich.length === 1 ? "Lastschrift" : "Lastschriften"} über{" "}
              {formatCents(summeMoeglich)} aufnehmen
            </button>
          </div>
        </section>
      )}

      {posten.length > 0 && (
        <section className="karte" style={{ marginBottom: 18 }}>
          <h2 className="dpl">Im Lauf</h2>
          <div className="tabellenhuelle"><table className="liste">
            <thead>
              <tr>
                <th>Zahler</th>
                <th>Für</th>
                <th className="zahl">Betrag</th>
                <th>Mandat</th>
                <th>Ergebnis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posten.map((p) => (
                <tr key={p.end_to_end_id}>
                  <td>{p.payer_name}</td>
                  <td className="mit">{p.mitglieder}</td>
                  <td className="zahl tnum">{formatCents(p.amount_cents)}</td>
                  <td className="mit">{p.mandate_reference}</td>
                  <td>
                    {p.result === "returned" ? (
                      <span style={{ color: "var(--red)" }}>
                        zurückgebucht{p.return_reason ? ` – ${p.return_reason}` : ""}
                      </span>
                    ) : (
                      <span className="marke-klein">
                        {p.result === "settled" ? "eingezogen" : "offen"}
                      </span>
                    )}
                  </td>
                  <td>
                    {/* Erst nach dem Einreichen: vorher ist noch nichts
                        unterwegs, das zurückkommen könnte. */}
                    {p.result === "pending" &&
                      (lauf.status === "submitted" || lauf.status === "completed") && (
                        <button
                          type="button"
                          className="knopf leise klein"
                          disabled={laeuft}
                          onClick={() => {
                            setZurueck(p.end_to_end_id);
                            setGrund("");
                          }}
                        >
                          Kam zurück
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {zurueck && (
            <>
              <h3 className="dpl">Rücklastschrift erfassen</h3>
              <p className="unterzeile">
                Der Grund geht unverändert an den Zahler – „Konto nicht gedeckt" und
                „Widerspruch" führen zu ganz verschiedenen nächsten Schritten.
              </p>
              <div className="formraster">
                <label className="breit">
                  <span>Grund der Rückgabe</span>
                  <input
                    type="text"
                    value={grund}
                    placeholder="z. B. Konto nicht gedeckt"
                    onChange={(e) => setGrund(e.target.value)}
                  />
                </label>
              </div>
              <div className="fenster-fuss">
                <button
                  type="button"
                  className="knopf gefahr"
                  disabled={laeuft || grund.trim() === ""}
                  onClick={() =>
                    starte(async () => {
                      const e = await ruecklaeuferErfassen({
                        kennung: zurueck,
                        grund,
                        am: null,
                        batchId: lauf.id,
                      });
                      melde(e);
                      if (e.ok) setZurueck(null);
                    })
                  }
                >
                  Als zurückgebucht vermerken
                </button>
                <button type="button" className="knopf leise" onClick={() => setZurueck(null)}>
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="karte">
        <h2 className="dpl">Datei und Einreichung</h2>
        <p className="unterzeile">
          Die Datei wird einmal erzeugt und bleibt danach unverändert – sie ist der Beleg dessen,
          was die Bank bekommen hat. Hochgeladen wird sie im Onlinebanking; die App bekommt von
          dort keine Rückmeldung.
        </p>

        <div className="fenster-fuss">
          {lauf.status === "draft" && (
            <button
              type="button"
              className="knopf"
              disabled={laeuft || posten.length === 0}
              onClick={() => starte(async () => melde(await dateiErzeugen(lauf.id)))}
            >
              {laeuft ? "Wird erzeugt…" : "Lastschriftdatei erzeugen"}
            </button>
          )}

          {lauf.storage_path && (
            <a className="knopf leise" href={`/admin/kasse/lastschriften/${lauf.id}/datei`}>
              Datei herunterladen
            </a>
          )}

          {lauf.status === "generated" && (
            <button
              type="button"
              className="knopf"
              disabled={laeuft}
              onClick={() => starte(async () => melde(await laufEingereicht(lauf.id, null)))}
            >
              Im Onlinebanking eingereicht
            </button>
          )}

          {/* Erst abschließen, wenn nichts mehr zurückkommt. Eine
              Rücklastschrift kann acht Wochen nach dem Einzug eintreffen; wer
              zu früh abhakt, hält Geld für da, das noch unterwegs ist. */}
          {lauf.status === "submitted" && (
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => starte(async () => melde(await laufAbschliessen(lauf.id)))}
            >
              Lauf abschließen
            </button>
          )}
        </div>

        {lauf.status === "submitted" && (
          <p className="mit">
            Alles, was nicht als zurückgebucht vermerkt ist, gilt beim Abschließen als
            eingezogen. Eine Rücklastschrift kann bis zu acht Wochen nach dem Einzug kommen.
          </p>
        )}
      </section>
    </>
  );
}
