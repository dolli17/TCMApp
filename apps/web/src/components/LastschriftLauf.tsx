"use client";

import { useState, useTransition } from "react";
import { debitFlow, formatCents, isoDateLabel } from "@tcm/core";
import {
  dateiErzeugen, laufAbschliessen, laufEingereicht, postenAufnehmen, ruecklaeuferErfassen,
} from "@/app/admin/kasse/lastschriften/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Geldweg } from "@/components/Geldweg";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

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

/**
 * Ein Lastschriftlauf von der Auswahl bis zu den Ruecklaeufern
 * (Entwurf AdminKasse, docs/design/clubhaus)
 *
 * Oben der naechste Schritt auf brand, darunter der Weg des Geldes
 * (am Telefon senkrecht), dann je Zahler eine Zeile - eine Lastschrift je
 * Zahler, wie sie auf seinem Kontoauszug steht (docs/design/clubhaus/
 * verwaltung, VwLauf).
 *
 * Ob ein Zahler mitgehen darf, sagt allein die Datenbank
 * (debit_batch_candidates, guard_prenotification). Die Seite zeigt ihren
 * Grund woertlich an und rechnet keine Frist nach. Solange nichts im Lauf ist,
 * gibt es auch keine Datei - der Knopf bleibt mit Schloss gesperrt, daneben
 * steht, was die Datenbank dazu sagt. Nach dem Erzeugen ist der Lauf zu: die
 * Datei ist ein Buchungsbeleg und darf sich nicht mehr aendern.
 */
export function LastschriftLauf({
  lauf, kandidaten, posten, faelligAb, heute,
}: {
  lauf: LaufKopf;
  kandidaten: KandidatZeile[];
  posten: PostenZeile[];
  /** Der spaeteste angekuendigte Faelligkeitstag der Kandidaten, ISO */
  faelligAb: string | null;
  heute: string;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [zurueck, setZurueck] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, starte] = useTransition();

  const entwurf = lauf.status === "draft";
  const moeglich = kandidaten.filter((k) => k.einzugsfaehig);
  const draussen = kandidaten.filter((k) => !k.einzugsfaehig);
  const summeMoeglich = moeglich.reduce((s, k) => s + k.amount_cents, 0);
  const summeAlle = lauf.total_cents + kandidaten.reduce((s, k) => s + k.amount_cents, 0);
  const zurueckgebucht = posten.filter((p) => p.result === "returned").length;

  const weg = debitFlow({
    charges: {
      payers: posten.length + kandidaten.length,
      totalCents: summeAlle,
      unannounced: 0,
      dueDate: faelligAb,
    },
    batch: {
      status: lauf.status,
      collectionDate: lauf.collection_date,
      itemCount: lauf.item_count,
      readyPayers: moeglich.length,
      returned: zurueckgebucht,
    },
    today: heute,
  });

  // Die Saetze der Datenbank, jeder einmal - sie begruenden die Sperre.
  const gruende = [...new Set(draussen.map((k) => k.grund).filter((g): g is string => Boolean(g)))];

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  const aufnehmenKnopf = (
    <button
      type="button"
      className="knopf gold block"
      disabled={laeuft}
      onClick={() => starte(async () => melde(await postenAufnehmen(lauf.id, null)))}
    >
      {moeglich.length} {moeglich.length === 1 ? "Lastschrift" : "Lastschriften"} über{" "}
      {formatCents(summeMoeglich)} aufnehmen
    </button>
  );

  const [nurOhneMandat, setNurOhneMandat] = useState(false);
  const ohneMandat = kandidaten.filter((k) => !k.mandate_id);
  const zeigeKandidaten = nurOhneMandat ? ohneMandat : kandidaten;
  const zurueckPosten = posten.find((p) => p.end_to_end_id === zurueck) ?? null;

  return (
    <div className="verwaltung lastschriftlauf">
      <header className="lauf-titel">
        <div className="kicker">Lastschriftlauf</div>
        <div className="titelzeile">
          <h1 className="pagetitle">{lauf.title}</h1>
          <span className={`statusmarke gross ${weg.current === null ? "gruen" : "gelb"}`}>{weg.label}</span>
        </div>
      </header>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {/* Der nächste Schritt steht über allem (Regel 8) */}
      <section className="naechster-schritt" aria-labelledby="h-naechster">
        <svg className="linien" viewBox="0 0 350 196" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
          <path d="M170 196 L225 0 M350 55 L225 196 M200 95 H350 M218 36 H350" />
        </svg>
        <div className="kicker" id="h-naechster">Nächster Schritt</div>
        {entwurf && posten.length === 0 && (
          <>
            <b className="titel">
              {moeglich.length > 0
                ? "Zahler in den Lauf aufnehmen"
                : faelligAb
                  ? `Lastschriftlauf ab ${isoDateLabel(faelligAb)}`
                  : "Noch nichts einzugsfähig"}
            </b>
            <p>
              Die Frist der Vorabankündigung hängt an jeder Forderung und wird in der Datenbank
              geprüft. Vorher lässt sich keine Datei erzeugen.
            </p>
            {moeglich.length > 0 && aufnehmenKnopf}
            <button type="button" className="knopf gesperrt block" disabled aria-describedby="sperrgrund">
              <Schloss />
              pain.008 erzeugen
            </button>
            <ul className="sperrgrund" id="sperrgrund">
              {moeglich.length > 0 ? (
                <li>Im Lauf ist noch keine Lastschrift.</li>
              ) : gruende.length > 0 ? (
                gruende.map((g) => <li key={g}>{g}</li>)
              ) : (
                <li>Für diesen Fälligkeitstag liegt keine angekündigte Forderung vor.</li>
              )}
            </ul>
          </>
        )}

        {entwurf && posten.length > 0 && (
          <>
            <b className="titel">Datei erzeugen</b>
            <p>
              Die Datei wird einmal erzeugt und bleibt danach unverändert – sie ist der Beleg
              dessen, was die Bank bekommt. Danach lässt sich am Lauf nichts mehr ändern.
            </p>
            <button
              type="button"
              className="knopf gold block"
              disabled={laeuft}
              onClick={() => starte(async () => melde(await dateiErzeugen(lauf.id)))}
            >
              {laeuft ? "Wird erzeugt…" : "pain.008 erzeugen"}
            </button>
            {moeglich.length > 0 && (
              <button
                type="button"
                className="knopf auf-blau block"
                disabled={laeuft}
                onClick={() => starte(async () => melde(await postenAufnehmen(lauf.id, null)))}
              >
                Noch {moeglich.length} Zahler aufnehmen
              </button>
            )}
          </>
        )}

        {lauf.status === "generated" && (
          <>
            <b className="titel">Im Onlinebanking einreichen</b>
            <p>
              Hochgeladen wird die Datei im Onlinebanking; die App bekommt von dort keine
              Rückmeldung. Danach hier vermerken.
            </p>
            <button
              type="button"
              className="knopf gold block"
              disabled={laeuft}
              onClick={() => starte(async () => melde(await laufEingereicht(lauf.id, null)))}
            >
              Im Onlinebanking eingereicht
            </button>
          </>
        )}

        {lauf.status === "submitted" && (
          <>
            <b className="titel">Rückläufer eintragen</b>
            <p>
              Alles, was nicht als zurückgebucht vermerkt ist, gilt beim Abschließen als
              eingezogen. Eine Rücklastschrift kann bis zu acht Wochen nach dem Einzug kommen.
            </p>
            {/* Erst abschließen, wenn nichts mehr zurückkommt; wer zu früh
                abhakt, hält Geld für da, das noch unterwegs ist. */}
            <button
              type="button"
              className="knopf auf-blau block"
              disabled={laeuft}
              onClick={() => starte(async () => melde(await laufAbschliessen(lauf.id)))}
            >
              Lauf abschließen
            </button>
          </>
        )}

        {lauf.status === "completed" && (
          <>
            <b className="titel">Abgeschlossen</b>
            <p>Der Lauf ist erledigt. Die Datei bleibt als Beleg am Lauf.</p>
          </>
        )}

        {lauf.storage_path && (
          <a className="knopf auf-blau block" href={`/admin/kasse/lastschriften/${lauf.id}/datei`}>
            Datei herunterladen
          </a>
        )}
      </section>

      <section className="karte gross" aria-labelledby="h-weg">
        <h2 className="dpl" id="h-weg">Der Weg des Geldes</h2>
        <Geldweg schritte={weg.steps} />
      </section>

      <div className="verwaltung-raster">
        <section className="je-zahler" aria-labelledby="h-zahler">
          <Gruppenkopf
            titel="Je Zahler"
            id="h-zahler"
            neben={`${posten.length + kandidaten.length} · ${formatCents(summeAlle)}`}
          />
          <p className="unterzeile">Ein Elternteil mit zwei Kindern = eine Zeile, eine Buchung.</p>

          {kandidaten.length > 0 && (
            <div className="filterchips" role="group" aria-label="Zahler filtern">
              <button type="button" aria-pressed={!nurOhneMandat} onClick={() => setNurOhneMandat(false)}>Alle</button>
              <button type="button" aria-pressed={nurOhneMandat} onClick={() => setNurOhneMandat(true)}>
                Ohne Mandat · {ohneMandat.length}
              </button>
            </div>
          )}

          {posten.length + kandidaten.length === 0 ? (
            <p className="leer-klein">Für diesen Fälligkeitstag liegt keine angekündigte Forderung vor.</p>
          ) : (
            <ul className="liste-gruppe" aria-label="Je Zahler">
              {!nurOhneMandat && posten.map((p) => {
                // Erst nach dem Einreichen: vorher ist noch nichts unterwegs,
                // das zurückkommen könnte.
                const kannZurueck =
                  p.result === "pending" && (lauf.status === "submitted" || lauf.status === "completed");
                return (
                  <li key={p.end_to_end_id}>
                    <Listenzeile
                      titel={p.payer_name}
                      kontext={
                        <>
                          {p.mitglieder}
                          {p.positionen > 1 ? ` · ${p.positionen} Posten` : ""}
                          <br />
                          <span className="kennung">{p.end_to_end_id}</span>
                        </>
                      }
                      neben={
                        <span className="neben">
                          <span className="betrag tnum">{formatCents(p.amount_cents)}</span>
                          {p.result === "returned" ? (
                            <span className="statusmarke rot" title={p.return_reason ?? undefined}>zurückgebucht</span>
                          ) : (
                            <span className="statusmarke gruen">{p.result === "settled" ? "eingezogen" : "im Lauf"}</span>
                          )}
                        </span>
                      }
                      label={kannZurueck ? `${p.payer_name}: Rücklastschrift erfassen` : undefined}
                      onClick={kannZurueck && !laeuft ? () => { setZurueck(p.end_to_end_id); setGrund(""); } : undefined}
                    />
                  </li>
                );
              })}
              {zeigeKandidaten.map((k) => (
                <li key={k.payer_id}>
                  <Listenzeile
                    titel={k.payer_name}
                    kontext={
                      <>
                        {k.arten}
                        {k.positionen > 1 ? ` · ${k.positionen} Posten` : ""}
                        {!k.einzugsfaehig && k.grund && (
                          <>
                            <br />
                            <span className="grund">{k.grund}</span>
                          </>
                        )}
                      </>
                    }
                    neben={
                      <span className="neben">
                        <span className="betrag tnum">{formatCents(k.amount_cents)}</span>
                        {k.einzugsfaehig ? (
                          <span className="statusmarke gelb">angekündigt</span>
                        ) : (
                          <span className="statusmarke rot">{k.mandate_id ? "gesperrt" : "kein Mandat"}</span>
                        )}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <dl className="karte gross zusammenfassung">
          <div>
            <dt>Zahler</dt>
            <dd className="dpl tnum">{posten.length + kandidaten.length}</dd>
          </div>
          <div>
            <dt>Summe</dt>
            <dd className="dpl tnum">{formatCents(summeAlle)}</dd>
          </div>
          <div>
            <dt>Ohne Mandat</dt>
            <dd className="dpl tnum rot">{ohneMandat.length}</dd>
          </div>
          <div>
            <dt>Fällig am</dt>
            <dd className="dpl tnum">{isoDateLabel(lauf.collection_date)}</dd>
          </div>
        </dl>
      </div>

      {zurueckPosten && (
        <FensterKnopf
          titel="Rücklastschrift erfassen"
          unterzeile={`${zurueckPosten.payer_name} · ${formatCents(zurueckPosten.amount_cents)}`}
          offen
          onSchliessen={() => setZurueck(null)}
        >
          <p className="unterzeile">
            Der Grund geht unverändert an den Zahler – „Konto nicht gedeckt" und
            „Widerspruch" führen zu ganz verschiedenen nächsten Schritten.
          </p>
          <div className="formraster">
            <label>
              <span>Grund der Rückgabe</span>
              <input
                type="text"
                value={grund}
                placeholder="z. B. Konto nicht gedeckt"
                onChange={(e) => setGrund(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="knopf gefahr block gross"
            disabled={laeuft || grund.trim() === ""}
            onClick={() =>
              starte(async () => {
                const e = await ruecklaeuferErfassen({
                  kennung: zurueckPosten.end_to_end_id,
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
        </FensterKnopf>
      )}
    </div>
  );
}

function Schloss() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      />
    </svg>
  );
}
