"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  jahrAbrechnen, sollStundenSetzen, stundenEintragen,
} from "@/app/admin/mitglieder/arbeitsdienst/aktionen";

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

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Dienstpflichtig</div>
          <div className="wert">{zeilen.length}</div>
        </div>
        <div className="kachel">
          <div className="titel">Noch offen</div>
          <div className="wert">{schuldner.length}</div>
          <div className="titel">haben Stunden nachzuholen</div>
        </div>
        <div className="kachel">
          <div className="titel">Käme zusammen</div>
          <div className="wert">{formatCents(summe)}</div>
          <div className="titel">bei {formatCents(stundensatzCents)} je Stunde</div>
        </div>
      </div>

      <section className="karte" style={{ marginBottom: 18 }}>
        <h2 className="dpl">Stand {jahr}</h2>
        <p className="unterzeile">
          Das Soll ist die höchste Regel über alle Beitragsarten des Mitglieds, nicht ihre Summe –
          wer Beitrag und Schlüsselpfand hat, arbeitet nicht doppelt.
        </p>

        {zeilen.length === 0 ? (
          <p className="leer">
            Für {jahr} ist keine Beitragsart mit Soll-Stunden hinterlegt. Solange das so ist,
            schuldet niemand Arbeitsdienst.
          </p>
        ) : (
          <div className="tabellenhuelle"><table className="liste">
            <thead>
              <tr>
                <th>Mitglied</th>
                <th>Beitragsart</th>
                <th className="zahl">Soll</th>
                <th className="zahl">Geleistet</th>
                <th className="zahl">Fehlt</th>
                <th className="zahl">Wäre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.member_id}>
                  <td>
                    {z.member_name}
                    {z.abgerechnet && <div className="mit">abgerechnet</div>}
                  </td>
                  <td className="mit">{z.arten}</td>
                  <td className="zahl tnum">{Number(z.required_hours)} h</td>
                  <td className="zahl tnum">
                    {Number(z.completed_hours)} h
                    {z.eintraege > 0 && (
                      <div className="mit">
                        {z.eintraege} {z.eintraege === 1 ? "Einsatz" : "Einsätze"}
                      </div>
                    )}
                  </td>
                  <td className="zahl tnum">
                    {Number(z.missing_hours) > 0 ? (
                      <strong>{Number(z.missing_hours)} h</strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="zahl tnum">
                    {z.betrag_cents > 0 ? formatCents(z.betrag_cents) : "—"}
                  </td>
                  <td>
                    {!z.abgerechnet && (
                      <button
                        type="button"
                        className="knopf leise klein"
                        disabled={laeuft}
                        onClick={() => {
                          setErfassen({ id: z.member_id, name: z.member_name });
                          setAmTag(heute);
                          setWas("");
                        }}
                      >
                        Einsatz eintragen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {erfassen && (
          <>
            <h3 className="dpl">Einsatz von {erfassen.name}</h3>
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
          </>
        )}
      </section>

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
  const [werte, setWerte] = useState<Record<string, string>>({});

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Soll-Stunden je Beitragsart</h2>
      <p className="unterzeile">
        Hier steht, wer überhaupt Arbeitsdienst schuldet. 0 bedeutet: diese Beitragsart leistet
        keinen.
      </p>

      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Beitragsart</th>
            <th className="zahl">Mitglieder</th>
            <th className="zahl">Soll {jahr}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {arten.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td className="zahl tnum">{a.mitglieder}</td>
              <td className="zahl tnum">
                {a.soll_stunden === null ? "—" : `${Number(a.soll_stunden)} h`}
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  style={{ width: 80, marginRight: 8 }}
                  aria-label={`Soll-Stunden für ${a.name}`}
                  value={werte[a.id] ?? String(a.soll_stunden ?? 0)}
                  onChange={(e) => setWerte({ ...werte, [a.id]: e.target.value })}
                />
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() =>
                    starte(async () =>
                      melde(
                        await sollStundenSetzen({
                          artId: a.id,
                          jahr,
                          stunden: Number(werte[a.id] ?? a.soll_stunden ?? 0),
                        }),
                      ),
                    )
                  }
                >
                  Setzen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
