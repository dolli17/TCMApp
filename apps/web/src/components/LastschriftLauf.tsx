"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CHARGE_KIND_LABEL, einzugStand, formatCents, isoDateLabel, isoPlusTage, sortChargeKinds,
} from "@tcm/core";
import {
  dateiErzeugen, einzugLoeschen, einzugMitgliedEntfernen, laufAbschliessen, laufEingereicht, ruecklaeuferErfassen,
} from "@/app/admin/kasse/lastschriften/aktionen";
import { ArtMarken } from "@/components/ArtMarke";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Geldweg } from "@/components/Geldweg";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

export interface PostenZeile {
  end_to_end_id: string;
  payer_name: string;
  mitglieder: string;
  positionen: number;
  kinds: string[];
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
  /** Die Arten, die der Einzug enthält; null = alle */
  kinds: string[] | null;
  status: "draft" | "generated" | "submitted" | "completed";
  total_cents: number;
  item_count: number;
  storage_path: string | null;
}

/** Summe je Art im Einzug (debit_batch_kinds) */
export interface ArtSumme {
  kind: string;
  positionen: number;
  summe_cents: number;
}

const AUSSCHNITT = 25;

/**
 * Ein Einzug (Entwurf Kasse neu, Ansicht 3).
 *
 * Oben der nächste Schritt auf Vereinsblau, darunter die vier Stände mit den
 * Terminen, dann je Mitglied eine Zeile - eine Lastschrift je Mitglied, wie
 * sie auf dem Kontoauszug steht.
 *
 * Ein Einzug entsteht angekündigt (einzug_vorbereiten). Die Datei darf sofort
 * erzeugt werden: der Abbuchungstag steht in ihr, und die Bank bucht erst dann
 * ab. Früher stand hier "Vorabankündigung läuft", obwohl längst etwas zu tun
 * war. Nach dem Erzeugen ist der Einzug zu: die Datei ist ein Buchungsbeleg.
 *
 * Datei und "eingereicht" gehen erst nach einer Rückfrage mit Anzahl, Summe
 * und Abbuchungstag (U10). Abschließen lässt sich erst nach der
 * Rückbuchungsfrist; Rückläufer lassen sich auch danach noch erfassen (U9).
 */
export function LastschriftLauf({
  lauf, posten, jeArt, angekuendigtAm, fristTage, heute,
}: {
  lauf: LaufKopf;
  posten: PostenZeile[];
  jeArt: ArtSumme[];
  /** Wann die Mitglieder informiert wurden, ISO */
  angekuendigtAm: string | null;
  fristTage: number;
  heute: string;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [alle, setAlle] = useState(false);
  const [frage, setFrage] = useState<"datei" | "eingereicht" | null>(null);
  const [laeuft, starte] = useTransition();

  const zurueckgebucht = posten.filter((p) => p.result === "returned").length;
  const stand = einzugStand({
    status: lauf.status,
    collectionDate: lauf.collection_date,
    itemCount: lauf.item_count,
    returned: zurueckgebucht,
    announcedOn: angekuendigtAm,
    today: heute,
  });
  const offen = lauf.status === "draft";
  const nachFrist = heute >= stand.abschliessbarAb;
  const eckdaten = `${posten.length} ${posten.length === 1 ? "Lastschrift" : "Lastschriften"}, ${formatCents(
    lauf.total_cents,
  )}, Abbuchung am ${isoDateLabel(lauf.collection_date)}`;
  const zeige = alle ? posten : posten.slice(0, AUSSCHNITT);
  const auswahl = posten.find((p) => p.end_to_end_id === gewaehlt) ?? null;

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  function bestaetigt(f: "datei" | "eingereicht") {
    starte(async () => {
      melde(f === "datei" ? await dateiErzeugen(lauf.id) : await laufEingereicht(lauf.id, null));
      setFrage(null);
    });
  }

  return (
    <div className="verwaltung lastschriftlauf">
      <header className="lauf-titel">
        <div className="kicker">Einzug</div>
        <div className="titelzeile">
          <h1 className="pagetitle">{lauf.title}</h1>
          <span className={`statusmarke gross ${stand.ton}`}>{stand.label}</span>
        </div>
        <p className="unterzeile lauf-arten">
          <ArtMarken arten={lauf.kinds ?? jeArt.map((a) => a.kind)} />{" "}
          <span className="tnum">
            {lauf.item_count} {lauf.item_count === 1 ? "Mitglied" : "Mitglieder"} ·{" "}
            {formatCents(lauf.total_cents)} · Abbuchung am <b>{isoDateLabel(lauf.collection_date)}</b>
          </span>
        </p>
      </header>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {stand.naechster && (
        <section className="naechster-schritt" aria-labelledby="h-naechster">
          <svg className="linien" viewBox="0 0 350 196" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
            <path d="M170 196 L225 0 M350 55 L225 196 M200 95 H350 M218 36 H350" />
          </svg>
          <div className="kicker" id="h-naechster">Nächster Schritt</div>
          <b className="titel">{stand.naechster.titel}</b>
          <p>{stand.naechster.text}</p>
          <div className="knopfreihe">
            {offen && lauf.item_count > 0 && frage !== "datei" && (
              <button type="button" className="knopf gold" disabled={laeuft} onClick={() => setFrage("datei")}>
                Bankdatei erzeugen
              </button>
            )}
            {offen && lauf.item_count === 0 && (
              <button
                type="button"
                className="knopf auf-blau"
                disabled={laeuft}
                onClick={() =>
                  starte(async () => {
                    const e = await einzugLoeschen(lauf.id);
                    melde(e);
                    if (e.ok) router.push("/admin/kasse?abschnitt=lastschriften");
                  })
                }
              >
                Leeren Einzug löschen
              </button>
            )}
            {lauf.status === "generated" && frage !== "eingereicht" && (
              <button type="button" className="knopf gold" disabled={laeuft} onClick={() => setFrage("eingereicht")}>
                Im Onlinebanking eingereicht
              </button>
            )}
            {lauf.status === "submitted" && (
              // Erst abschließen, wenn nichts mehr zurückkommt; wer zu früh
              // abhakt, hält Geld für da, das noch unterwegs ist. Der Server
              // prüft dieselbe Frist.
              <button
                type="button"
                className={`knopf ${nachFrist ? "gold" : "auf-blau"}`}
                disabled={laeuft || !nachFrist}
                onClick={() => starte(async () => melde(await laufAbschliessen(lauf.id)))}
              >
                {nachFrist ? "Einzug abschließen" : `Abschließen ab ${isoDateLabel(stand.abschliessbarAb)}`}
              </button>
            )}
            {lauf.storage_path && (
              <a className="knopf auf-blau" href={`/admin/kasse/lastschriften/${lauf.id}/datei`}>
                Bankdatei herunterladen
              </a>
            )}
          </div>
          {frage && (
            <div className="hinweis rueckfrage" role="group" aria-label="Rückfrage">
              <span>
                {frage === "datei"
                  ? `${eckdaten} – Bankdatei jetzt erzeugen? Danach ist der Einzug zu, niemand lässt sich mehr herausnehmen.`
                  : `${eckdaten} – wirklich als eingereicht vermerken? Erst bestätigen, wenn die Bankdatei im Onlinebanking hochgeladen ist.`}
              </span>
              <span className="knopfreihe">
                <button type="button" className="knopf gold klein" disabled={laeuft} onClick={() => bestaetigt(frage)}>
                  {laeuft
                    ? frage === "datei" ? "Wird erzeugt…" : "Wird vermerkt…"
                    : frage === "datei" ? "Ja, Bankdatei erzeugen" : "Ja, eingereicht"}
                </button>
                <button type="button" className="knopf leise klein" disabled={laeuft} onClick={() => setFrage(null)}>
                  Abbrechen
                </button>
              </span>
            </div>
          )}
        </section>
      )}
      {!stand.naechster && lauf.storage_path && (
        <p className="mit">
          Abgeschlossen. Die Bankdatei bleibt als Beleg am Einzug:{" "}
          <a href={`/admin/kasse/lastschriften/${lauf.id}/datei`}>herunterladen</a>.
        </p>
      )}

      <section className="karte gross" aria-labelledby="h-stand">
        <h2 className="dpl" id="h-stand">Stand</h2>
        <Geldweg schritte={stand.schritte} />
        <dl className="einzug-termine">
          {angekuendigtAm && (
            <>
              <div><dt>Informiert</dt><dd className="tnum">{isoDateLabel(angekuendigtAm)}</dd></div>
              <div><dt>Frühestens abbuchbar</dt><dd className="tnum">{isoDateLabel(isoPlusTage(angekuendigtAm, fristTage))}</dd></div>
            </>
          )}
          <div><dt>Abbuchung</dt><dd className="tnum">{isoDateLabel(lauf.collection_date)}</dd></div>
          <div><dt>Rückläufer möglich bis</dt><dd className="tnum">{isoDateLabel(stand.ruecklaeuferBis)}</dd></div>
        </dl>
      </section>

      <div className="verwaltung-raster">
        <section className="je-zahler" aria-labelledby="h-zahler">
          <Gruppenkopf
            titel="Je Mitglied"
            id="h-zahler"
            neben={`${posten.length} · ${formatCents(lauf.total_cents)}`}
          />
          <p className="unterzeile">
            Eine Lastschrift je Mitglied, jedes mit eigenem Mandat.
            {offen ? " Bis zur Bankdatei lässt sich ein Mitglied noch herausnehmen." : ""}
          </p>

          {posten.length === 0 ? (
            <p className="leer-klein">In diesem Einzug steht keine Lastschrift.</p>
          ) : (
            <ul className="liste-gruppe" aria-label="Je Mitglied">
              {zeige.map((p) => {
                // Rückläufer erst nach dem Einreichen: vorher ist noch nichts
                // unterwegs, das zurückkommen könnte. Auch nach dem Abschluss
                // noch - eine Bank meldet manches erst spät (U9).
                const kannZurueck =
                  p.result !== "returned" && (lauf.status === "submitted" || lauf.status === "completed");
                const klickbar = (offen || kannZurueck) && !laeuft;
                return (
                  <li key={p.end_to_end_id}>
                    <Listenzeile
                      titel={p.payer_name}
                      kontext={
                        <>
                          <ArtMarken arten={p.kinds} />{" "}
                          {p.positionen > 1 ? `${p.positionen} Posten · ` : ""}Mandat {p.mandate_reference}
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
                            <span className="statusmarke gruen">{p.result === "settled" ? "eingezogen" : "Lastschrift"}</span>
                          )}
                        </span>
                      }
                      label={
                        offen
                          ? `${p.payer_name}: aus dem Einzug nehmen`
                          : kannZurueck ? `${p.payer_name}: Rücklastschrift erfassen` : undefined
                      }
                      onClick={klickbar ? () => { setGewaehlt(p.end_to_end_id); setGrund(""); } : undefined}
                    />
                  </li>
                );
              })}
              {posten.length > zeige.length && (
                <li>
                  <Listenzeile
                    titel={`Alle ${posten.length} zeigen`}
                    hinweis={`${posten.length - zeige.length} weitere`}
                    onClick={() => setAlle(true)}
                  />
                </li>
              )}
            </ul>
          )}
        </section>

        <dl className="karte gross zusammenfassung">
          <div><dt>Mitglieder</dt><dd className="dpl tnum">{posten.length}</dd></div>
          <div><dt>Summe</dt><dd className="dpl tnum">{formatCents(lauf.total_cents)}</dd></div>
          <div><dt>Abbuchung</dt><dd className="dpl tnum">{isoDateLabel(lauf.collection_date)}</dd></div>
          {/* Aufschlüsselung: was davon Beitrag, was Getränke, was Arbeitsdienst ist */}
          {sortChargeKinds(jeArt.map((a) => a.kind)).map((k) => {
            const a = jeArt.find((x) => x.kind === k)!;
            return (
              <div key={k}>
                <dt>{CHARGE_KIND_LABEL[k]}</dt>
                <dd className="dpl tnum">{formatCents(a.summe_cents)}</dd>
              </div>
            );
          })}
        </dl>
      </div>

      {auswahl && offen && (
        <FensterKnopf
          titel="Aus dem Einzug nehmen"
          unterzeile={`${auswahl.payer_name} · ${formatCents(auswahl.amount_cents)}`}
          offen
          onSchliessen={() => setGewaehlt(null)}
        >
          <p className="unterzeile">
            Die Forderungen werden wieder offen. Angekündigt war der{" "}
            {isoDateLabel(lauf.collection_date)} – ein späterer Einzug kündigt neu an.
          </p>
          <button
            type="button"
            className="knopf gefahr block gross"
            disabled={laeuft}
            onClick={() =>
              starte(async () => {
                const e = await einzugMitgliedEntfernen(lauf.id, auswahl.end_to_end_id);
                melde(e);
                if (e.ok) setGewaehlt(null);
              })
            }
          >
            Aus dem Einzug nehmen
          </button>
        </FensterKnopf>
      )}

      {auswahl && !offen && (
        <FensterKnopf
          titel="Rücklastschrift erfassen"
          unterzeile={`${auswahl.payer_name} · ${formatCents(auswahl.amount_cents)}`}
          offen
          onSchliessen={() => setGewaehlt(null)}
        >
          <p className="unterzeile">
            Der Grund geht unverändert an das Mitglied – „Konto nicht gedeckt" und
            „Widerspruch" führen zu ganz verschiedenen nächsten Schritten.
            {auswahl.result === "settled" ? " Der Einzug ist abgeschlossen; die Forderungen stehen danach wieder offen." : ""}
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
                  kennung: auswahl.end_to_end_id,
                  grund,
                  am: null,
                  batchId: lauf.id,
                });
                melde(e);
                if (e.ok) setGewaehlt(null);
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
