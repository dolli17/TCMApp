"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  jahrAbrechnen, sollStundenSetzen, stundenEintragen,
} from "@/app/admin/arbeitsdienst/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

export interface DienstZeile {
  member_id: string;
  member_name: string;
  arten: string;
  required_hours: number;
  completed_hours: number;
  missing_hours: number;
  eintraege: number;
  betrag_cents: number;
  abgerechnet: boolean;
}

export interface SollZeile {
  id: string;
  name: string;
  soll_stunden: number | null;
  mitglieder: number;
}

/**
 * Der Arbeitsdienst eines Jahres.
 *
 * Nur der Vorstand trägt ein — das Mitglied sieht seinen Stand im Konto, kann
 * ihn aber nicht selbst hochsetzen. Ein Meldeweg fürs Mitglied bräuchte eine
 * Bestätigungsliste, und was dort liegen bleibt, zählt nicht: gezählt werden
 * ausschließlich bestätigte Stunden.
 *
 * Die Liste ist nach fehlenden Stunden sortiert. Wer sein Soll erfüllt hat,
 * steht unten — die Arbeit des Vorstands beginnt oben.
 */
export function ArbeitsdienstListe({
  jahr, zeilen, arten, stundensatzCents, abrechenbar,
}: {
  jahr: number;
  zeilen: DienstZeile[];
  arten: SollZeile[];
  stundensatzCents: number;
  abrechenbar: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [erfassen, setErfassen] = useState<{ id: string; name: string } | null>(null);
  const [stunden, setStunden] = useState("2");
  const [amTag, setAmTag] = useState("");
  const [was, setWas] = useState("");
  const [gefragt, setGefragt] = useState(false);
  const [laeuft, starte] = useTransition();

  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const offen = zeilen.filter((z) => !z.abgerechnet);
  const summe = offen.reduce((s, z) => s + z.betrag_cents, 0);
  const schuldner = offen.filter((z) => z.missing_hours > 0);

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="kennzahlen drei">
        <div className="kennzahl">
          <span className="label">Dienstpflichtig</span>
          <span className="wert dpl tnum">{zeilen.length}</span>
          <span className="info">Mitglieder mit Soll-Stunden</span>
        </div>
        <div className="kennzahl">
          <span className="label">Noch offen</span>
          <span className="wert dpl tnum">{schuldner.length}</span>
          <span className="info">haben Stunden nachzuholen</span>
        </div>
        <div className="kennzahl">
          <span className="label">Käme zusammen</span>
          <span className="wert dpl tnum">{formatCents(summe)}</span>
          <span className="info">bei {formatCents(stundensatzCents)} je Stunde</span>
        </div>
      </div>

      <section className="liste-abschnitt" aria-labelledby="h-stand">
        <Gruppenkopf titel={`Stand ${jahr}`} id="h-stand" />
        <p className="unterzeile">
          Das Soll ist die höchste Regel über alle Beitragsarten des Mitglieds, nicht ihre Summe –
          wer Beitrag und Schlüsselpfand hat, arbeitet nicht doppelt.
        </p>

        {zeilen.length === 0 ? (
          <p className="leer-klein">
            Für {jahr} ist keine Beitragsart mit Soll-Stunden hinterlegt. Solange das so ist,
            schuldet niemand Arbeitsdienst.
          </p>
        ) : (
          <ul className="liste-gruppe" aria-label={`Arbeitsdienst ${jahr}`}>
            {zeilen.map((z) => {
              const fehlt = Number(z.missing_hours);
              return (
                <li key={z.member_id}>
                  <Listenzeile
                    titel={z.member_name}
                    kontext={`${z.arten} · ${Number(z.completed_hours)} von ${Number(z.required_hours)} h${
                      z.eintraege > 0 ? ` · ${z.eintraege} ${z.eintraege === 1 ? "Einsatz" : "Einsätze"}` : ""
                    }`}
                    neben={
                      <span className="neben">
                        {z.abgerechnet ? (
                          <span className="statusmarke gruen">abgerechnet</span>
                        ) : fehlt > 0 ? (
                          <>
                            <span className="betrag tnum">{fehlt} h</span>
                            <span className="hinweis-rechts gold">{formatCents(z.betrag_cents)}</span>
                          </>
                        ) : (
                          <span className="hinweis-rechts gruen">erledigt</span>
                        )}
                      </span>
                    }
                    label={`${z.member_name}: Einsatz eintragen`}
                    onClick={z.abgerechnet || laeuft ? undefined : () => {
                      setErfassen({ id: z.member_id, name: z.member_name });
                      setAmTag(heute);
                      setWas("");
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>


      {erfassen && (
        <FensterKnopf titel={`Einsatz von ${erfassen.name}`} offen onSchliessen={() => setErfassen(null)}>
          <p className="unterzeile">
            Das Jahr ergibt sich aus dem Einsatztag – ein im Januar nachgetragener
            Dezember-Einsatz zählt fürs alte Jahr.
          </p>
          <div className="formraster">
            <label>
              <span>Stunden</span>
              <input
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                value={stunden}
                onChange={(e) => setStunden(e.target.value)}
              />
            </label>
            <label>
              <span>Am</span>
              <input
                type="date"
                max={heute}
                value={amTag}
                onChange={(e) => setAmTag(e.target.value)}
              />
            </label>
            <label className="breit">
              <span>Was wurde gemacht</span>
              <input
                type="text"
                value={was}
                placeholder="z. B. Platzaufbau im Frühjahr"
                onChange={(e) => setWas(e.target.value)}
              />
            </label>
          </div>
          <div className="fenster-fuss">
            <button
              type="button"
              className="knopf"
              disabled={laeuft || amTag === "" || Number(stunden) <= 0}
              onClick={() =>
                starte(async () => {
                  const e = await stundenEintragen({
                    mitgliedId: erfassen.id,
                    stunden: Number(stunden),
                    amTag,
                    beschreibung: was,
                  });
                  melde(e);
                  if (e.ok) setErfassen(null);
                })
              }
            >
              Eintragen
            </button>
            <button type="button" className="knopf leise" onClick={() => setErfassen(null)}>
              Abbrechen
            </button>
          </div>
        </FensterKnopf>
      )}

      <SollKarte arten={arten} jahr={jahr} laeuft={laeuft} starte={starte} melde={melde} />

      <section className="karte">
        <h2 className="dpl">Jahresausgleich {jahr}</h2>
        <p className="unterzeile">
          Rechnet fehlende Stunden in Geld um und friert Soll, Ist und Stundensatz ein. Danach
          lässt sich für {jahr} nichts mehr nachtragen.
        </p>

        {!abrechenbar ? (
          <p className="mit">
            {jahr} läuft noch – bis zum Jahresende können Stunden dazukommen.
          </p>
        ) : offen.length === 0 ? (
          <p className="mit">Für {jahr} ist bereits alles abgerechnet.</p>
        ) : (
          <div className="fenster-fuss">
            {gefragt ? (
              <>
                <button
                  type="button"
                  className="knopf gefahr"
                  disabled={laeuft}
                  onClick={() =>
                    starte(async () => {
                      melde(await jahrAbrechnen(jahr, null));
                      setGefragt(false);
                    })
                  }
                >
                  {schuldner.length} {schuldner.length === 1 ? "Forderung" : "Forderungen"} über{" "}
                  {formatCents(summe)} erzeugen
                </button>
                <button type="button" className="knopf leise" onClick={() => setGefragt(false)}>
                  Doch nicht
                </button>
              </>
            ) : (
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => setGefragt(true)}
              >
                Jahr abrechnen
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

type Starter = (f: () => void | Promise<void>) => void;
type Melder = (e: { ok: boolean; meldung: string }) => void;

/**
 * Wer schuldet überhaupt Arbeitsdienst?
 *
 * Die Regel hängt an der Beitragsart, nicht am Mitglied: Erwachsene leisten
 * Dienst, Jugend und Passive nicht. Steht hier nichts, schuldet niemand etwas.
 */
function SollKarte({
  arten, jahr, laeuft, starte, melde,
}: {
  arten: SollZeile[];
  jahr: number;
  laeuft: boolean;
  starte: Starter;
  melde: Melder;
}) {
  const [gewaehlt, setGewaehlt] = useState<SollZeile | null>(null);
  const [wert, setWert] = useState("");

  return (
    <section className="liste-abschnitt" aria-labelledby="h-soll">
      <Gruppenkopf titel="Soll-Stunden je Beitragsart" id="h-soll" />
      <p className="unterzeile">
        Hier steht, wer überhaupt Arbeitsdienst schuldet. 0 bedeutet: diese Beitragsart leistet
        keinen.
      </p>

      <ul className="liste-gruppe" aria-label={`Soll-Stunden ${jahr}`}>
        {arten.map((a) => (
          <li key={a.id}>
            <Listenzeile
              titel={a.name}
              kontext={`${a.mitglieder} Mitglieder`}
              hinweis={a.soll_stunden === null ? "—" : `${Number(a.soll_stunden)} h`}
              hinweisTon={a.soll_stunden ? "gold" : "leise"}
              onClick={() => {
                setGewaehlt(a);
                setWert(String(a.soll_stunden ?? 0));
              }}
            />
          </li>
        ))}
      </ul>

      {gewaehlt && (
        <FensterKnopf titel={gewaehlt.name} unterzeile={`Soll-Stunden ${jahr}`} offen onSchliessen={() => setGewaehlt(null)}>
          <div className="formraster">
            <label>
              <span>Stunden</span>
              <input
                type="number"
                min={0}
                max={200}
                step={0.5}
                aria-label={`Soll-Stunden für ${gewaehlt.name}`}
                value={wert}
                onChange={(e) => setWert(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="knopf gold block gross"
            disabled={laeuft}
            onClick={() =>
              starte(async () => {
                const e = await sollStundenSetzen({ artId: gewaehlt.id, jahr, stunden: Number(wert) });
                melde(e);
                if (e.ok) setGewaehlt(null);
              })
            }
          >
            Setzen
          </button>
        </FensterKnopf>
      )}
    </section>
  );
}
