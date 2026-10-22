"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CHARGE_KIND_LABEL, einzugGruppeAuswahl, einzugGruppeSchluessel, einzugGruppeTitel, einzugTitel, formatCents, isoDateLabel,
  type EinzugGruppe,
} from "@tcm/core";
import {
  einzugVorbereiten, einzugVorschau, type VorschauZeile,
} from "@/app/admin/kasse/lastschriften/aktionen";
import { ArtMarke } from "@/components/ArtMarke";
import { Listenzeile } from "@/components/Listenzeile";
import { SperrGrund } from "@/components/SperrGrund";

export interface GruppeZeile extends EinzugGruppe {
  anzahl: number;
  mitglieder: number;
  summe_cents: number;
}

/**
 * Das Formular zu "Einzug vorbereiten" (Entwurf Kasse neu, Ansicht 2).
 *
 * Drei Fragen untereinander: was, wann, wer. Die Vorschau kommt aus derselben
 * Prüfung, die der Einzug nimmt (einzug_vorschau) - wer hier als Ausnahme
 * steht, bekommt keine Ankündigung.
 *
 * Ankündigen schickt jedem Mitglied eine Nachricht, auch per E-Mail. Deshalb
 * erst nach einer Rückfrage mit Anzahl, Summe und Abbuchungstag (U10).
 */
export function EinzugVorbereiten({
  gruppen, vorgewaehlt, frueheste, fristTage,
}: {
  gruppen: GruppeZeile[];
  vorgewaehlt: string[];
  /** Frühester Abbuchungstag, ISO */
  frueheste: string;
  fristTage: number;
}) {
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(
    () => new Set(vorgewaehlt.length > 0 ? vorgewaehlt : []),
  );
  const [abbuchung, setAbbuchung] = useState(frueheste);
  const [titelSelbst, setTitelSelbst] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<VorschauZeile[] | null>(null);
  const [vorschauFehler, setVorschauFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [frage, setFrage] = useState(false);
  const [laedt, starteLaden] = useTransition();
  const [sendet, starteSenden] = useTransition();
  const anfrage = useRef(0);

  const auswahl = gruppen.filter((g) => gewaehlt.has(einzugGruppeSchluessel(g)));
  const datumOk = abbuchung !== "" && abbuchung >= frueheste;
  const titel = titelSelbst ?? (auswahl.length > 0 ? einzugTitel(auswahl, abbuchung || frueheste) : "");

  // Die Vorschau folgt Auswahl und Tag. Eine ältere Antwort, die nach einer
  // neueren ankommt, wird verworfen.
  const schluessel = [...gewaehlt].sort().join(",");
  useEffect(() => {
    if (auswahl.length === 0 || !datumOk) {
      setVorschau(null);
      return;
    }
    const nr = ++anfrage.current;
    starteLaden(async () => {
      const e = await einzugVorschau(
        abbuchung,
        auswahl.map(einzugGruppeAuswahl),
      );
      if (nr !== anfrage.current) return;
      if (e.ok) {
        setVorschau(e.zeilen);
        setVorschauFehler(null);
      } else {
        setVorschau(null);
        setVorschauFehler(e.meldung);
      }
    });
    // auswahl haengt allein an schluessel
  }, [schluessel, abbuchung, datumOk]);

  function umschalten(k: string) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(k)) neu.delete(k);
      else neu.add(k);
      return neu;
    });
  }

  const dabei = (vorschau ?? []).filter((z) => z.einzugsfaehig);
  const ausnahmen = (vorschau ?? []).filter((z) => !z.einzugsfaehig);
  const summe = dabei.reduce((s, z) => s + z.amount_cents, 0);
  const beispiel = dabei[0];
  const bereit = auswahl.length > 0 && datumOk && dabei.length > 0 && !laedt && titel.trim() !== "";

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <section className="karte gross einzug-schritt" aria-labelledby="h-was">
        <div className="einzug-kopf">
          <span className="nr" aria-hidden="true">1</span>
          <h2 className="dpl" id="h-was">Was wird eingezogen?</h2>
        </div>
        {gruppen.length === 0 ? (
          <p className="leer-klein">
            Gerade ist nichts einzuziehen. Neue Forderungen entstehen unter Kasse → Abrechnen.
          </p>
        ) : (
          <fieldset className="einzug-gruppen">
            <legend className="sr-only">Forderungen</legend>
            {gruppen.map((g) => {
              const k = einzugGruppeSchluessel(g);
              const an = gewaehlt.has(k);
              return (
                <label key={k} className={`einzug-gruppe${an ? " an" : ""}`}>
                  <input type="checkbox" checked={an} onChange={() => umschalten(k)} />
                  <span className="text">
                    <span className="zeile">
                      {/* Die Marke nur, wenn der Titel die Art nicht schon nennt */}
                      {g.ruecklaeufer ? (
                        <span className="marke-klein rot">Rückläufer</span>
                      ) : einzugGruppeTitel(g) !== CHARGE_KIND_LABEL[g.kind] ? (
                        <ArtMarke art={g.kind} />
                      ) : null}
                      <b>{einzugGruppeTitel(g)}</b>
                    </span>
                    <small>
                      {g.anzahl} {g.anzahl === 1 ? "Forderung" : "Forderungen"} · {g.mitglieder}{" "}
                      {g.mitglieder === 1 ? "Mitglied" : "Mitglieder"}
                    </small>
                  </span>
                  <b className="betrag dpl tnum">{formatCents(g.summe_cents)}</b>
                </label>
              );
            })}
          </fieldset>
        )}
      </section>

      <section className="karte gross einzug-schritt" aria-labelledby="h-wann">
        <div className="einzug-kopf">
          <span className="nr" aria-hidden="true">2</span>
          <h2 className="dpl" id="h-wann">Wann wird abgebucht?</h2>
        </div>
        <div className="formraster einzug-wann">
          <label>
            <span>Abbuchungstag</span>
            <input
              type="date"
              min={frueheste}
              value={abbuchung}
              onChange={(e) => setAbbuchung(e.target.value)}
            />
          </label>
          <label>
            <span>Bezeichnung</span>
            <input
              type="text"
              value={titel}
              placeholder="z. B. Jahresbeiträge 2027"
              onChange={(e) => setTitelSelbst(e.target.value)}
            />
          </label>
        </div>
        <p className="unterzeile">
          Frühestens am <b>{isoDateLabel(frueheste)}</b>: Zwischen Ankündigung und Abbuchung müssen{" "}
          {fristTage} Tage liegen. Diesen Tag legst du nur hier fest – er gilt für Ankündigung und
          Datei.
        </p>
        {!datumOk && abbuchung !== "" && (
          <div className="hinweis fehler" role="status">
            Der Abbuchungstag liegt zu früh. Frühestens am {isoDateLabel(frueheste)}.
          </div>
        )}
      </section>

      <section className="karte gross einzug-schritt" aria-labelledby="h-wer" aria-busy={laedt}>
        <div className="einzug-kopf">
          <span className="nr" aria-hidden="true">3</span>
          <h2 className="dpl" id="h-wer">Wer ist dabei?</h2>
        </div>
        {vorschauFehler && <div className="hinweis fehler">{vorschauFehler}</div>}
        {auswahl.length === 0 ? (
          <p className="leer-klein">Wähle oben aus, was eingezogen wird.</p>
        ) : vorschau === null ? (
          <p className="leer-klein">{laedt ? "Wird geprüft…" : "Bitte einen gültigen Abbuchungstag wählen."}</p>
        ) : (
          <>
            <div className="einzug-wer">
              <div className="kachel gruen">
                <b className="dpl tnum">{dabei.length}</b>
                <span>{dabei.length === 1 ? "Lastschrift" : "Lastschriften"}</span>
                <small className="tnum">{formatCents(summe)}</small>
              </div>
              <div className={`kachel ${ausnahmen.length > 0 ? "gelb" : "grau"}`}>
                <b className="dpl tnum">{ausnahmen.length}</b>
                <span>{ausnahmen.length === 1 ? "Ausnahme" : "Ausnahmen"}</span>
                <small>Mandat fehlt, widerrufen oder erloschen – geht nicht mit und bekommt keine Ankündigung</small>
              </div>
            </div>
            {ausnahmen.length > 0 && (
              <ul className="liste-gruppe" aria-label="Ausnahmen">
                {ausnahmen.map((z) => (
                  <li key={z.member_id}>
                    {/* Zum Mandat des Mitglieds: dort wird die Ausnahme behoben. */}
                    <Listenzeile
                      href={`/admin/mitglieder/${z.member_id}?teil=bank`}
                      titel={z.member_name}
                      kontext={z.grund}
                      neben={<span className="neben"><span className="betrag tnum">{formatCents(z.amount_cents)}</span></span>}
                    />
                  </li>
                ))}
              </ul>
            )}
            {beispiel && (
              <details className="einzug-beispiel">
                <summary>So sieht die Ankündigung aus</summary>
                <div className="nachricht">
                  <b>Lastschrift am {isoDateLabel(abbuchung)}</b>
                  <p>
                    Am {isoDateLabel(abbuchung)} ziehen wir {formatCents(beispiel.amount_cents)} von
                    deinem Konto ein: {beispiel.arten}. Bitte sorge für Deckung.
                  </p>
                </div>
              </details>
            )}
          </>
        )}
      </section>

      <section className="naechster-schritt quer" aria-label="Ankündigen">
        <div>
          <b className="titel">
            {dabei.length > 0
              ? `${dabei.length} ${dabei.length === 1 ? "Ankündigung" : "Ankündigungen"} · ${formatCents(summe)} · Abbuchung ${isoDateLabel(abbuchung)}`
              : "Noch nichts ausgewählt"}
          </b>
          <p>Danach kannst du die Datei sofort erzeugen.</p>
        </div>
        {!frage && (
          <button type="button" className="knopf gold" disabled={!bereit || sendet} onClick={() => setFrage(true)}>
            Ankündigen und Einzug anlegen
          </button>
        )}
        {!frage && !sendet && (
          <SperrGrund
            grund={
              auswahl.length === 0
                ? "Erst eine Gruppe auswählen."
                : !datumOk
                  ? "Erst einen gültigen Abbuchungstag wählen."
                  : titel.trim() === ""
                    ? "Erst eine Bezeichnung eingeben."
                    : !laedt && dabei.length === 0
                      ? "Niemand in der Auswahl kann eingezogen werden."
                      : null
            }
          />
        )}
        {frage && (
          <div className="hinweis rueckfrage" role="group" aria-label="Rückfrage">
            <span>
              {dabei.length} {dabei.length === 1 ? "Lastschrift" : "Lastschriften"}, {formatCents(summe)}, Abbuchung
              am {isoDateLabel(abbuchung)} – wirklich ankündigen? Jedes Mitglied bekommt eine Nachricht, auch per
              E-Mail.
            </span>
            <span className="knopfreihe">
              <button
                type="button"
                className="knopf gold klein"
                disabled={!bereit || sendet}
                onClick={() =>
                  starteSenden(async () => {
                    const e = await einzugVorbereiten({
                      abbuchung,
                      titel,
                      gruppen: auswahl.map(einzugGruppeAuswahl),
                    });
                    setMeldung({ ok: e.ok, text: e.meldung });
                    setFrage(false);
                    if (e.ok && e.id) router.push(`/admin/kasse/lastschriften/${e.id}`);
                  })
                }
              >
                {sendet ? "Wird angekündigt…" : "Ja, ankündigen"}
              </button>
              <button type="button" className="knopf leise klein" disabled={sendet} onClick={() => setFrage(false)}>
                Abbrechen
              </button>
            </span>
          </div>
        )}
      </section>
    </>
  );
}
