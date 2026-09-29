"use client";

import { useState, useTransition } from "react";
import { berlinTime, timeToMinutes } from "@tcm/core";
import {
  buchungsartSpeichern, platzSpeichern, platzUmschalten, plaetzeSortieren, sperren,
} from "@/app/admin/plaetze/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

export interface PlatzZeile {
  id: string;
  name: string;
  short_name: string;
  subline: string | null;
  sort_position: number;
  active: boolean;
  offene_buchungen: number;
}

export interface ArtZeile {
  code: string;
  name: string;
  applies_to: "booking" | "blocking";
  duration_minutes: number;
  min_players: number;
  max_players: number;
  requires_partner: boolean;
  counts_towards_quota: boolean;
  active: boolean;
}

interface Props {
  plaetze: PlatzZeile[];
  arten: ArtZeile[];
  /** Was heute gerade auf dem Platz liegt, etwa "gesperrt bis 14:00" */
  zustand: Record<string, { text: string; art: "gesperrt" | "serie" }>;
}

const LEERER_PLATZ = { id: null as string | null, name: "", kurzname: "", zusatz: "" };

export function PlatzVerwaltung(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

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

      <Platzliste
        plaetze={props.plaetze}
        zustand={props.zustand}
        laeuft={laeuft}
        starte={starte}
        melde={melde}
      />

      <Artenliste arten={props.arten} laeuft={laeuft} starte={starte} melde={melde} />
    </>
  );
}

type Starter = (f: () => void | Promise<void>) => void;
type Melder = (e: { ok: boolean; meldung: string }) => void;

/**
 * Das Sperrformular fuer sich, mit eigener Rueckmeldung - es steht im
 * Fenster hinter dem Kopfknopf "Plätze sperren".
 */
export function PlatzSperren(props: {
  plaetze: PlatzZeile[];
  /** Blockungsarten fuer die Sperrung, nach sort_order. */
  arten: { code: string; name: string }[];
  /** Oeffnungs- und Schliesszeit aus den Einstellungen, als "HH:MM". */
  oeffnung: string;
  schluss: string;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}
      <Sperrformular
        {...props}
        plaetze={props.plaetze.filter((p) => p.active)}
        laeuft={laeuft}
        starte={starte}
        melde={(e) => setMeldung({ ok: e.ok, text: e.meldung })}
      />
    </>
  );
}

/**
 * Platz sperren.
 *
 * Bis jetzt ging das nur, indem der Vorstand eine Serie ueber einen einzigen
 * Tag legte. Der zweistufige Ablauf ist derselbe wie bei den Serien: erst
 * zaehlen, dann fragen, dann verdraengen.
 */
function Sperrformular({
  plaetze, arten, oeffnung, schluss, laeuft, starte, melde,
}: {
  plaetze: PlatzZeile[];
  arten: { code: string; name: string }[];
  oeffnung: string;
  schluss: string;
  laeuft: boolean;
  starte: Starter;
  melde: Melder;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  // Vorgabe aus den Einstellungen, nicht aus zwei fest eingetippten Zeiten:
  // sonst schlaegt das Formular weiter 08:00 bis 21:00 vor, nachdem der
  // Vorstand die Oeffnungszeiten geaendert hat.
  const [von, setVon] = useState(oeffnung);
  const [bis, setBis] = useState(schluss);
  const [artCode, setArtCode] = useState(arten[0]?.code ?? "platzpflege");
  const [grund, setGrund] = useState("");
  const [kollisionen, setKollisionen] = useState<number | null>(null);

  const vollstaendig = gewaehlt.length > 0 && tag !== "" && grund.trim() !== "";

  function absenden(verdraengen: boolean) {
    starte(async () => {
      // Ueber berlinTime, nicht als "2026-08-11T08:00:00": ein Zeitstempel ohne
      // Zonenangabe wird von Postgres in der Zeitzone der Verbindung gelesen -
      // und die steht auf UTC. Die Sperrung landete dadurch zwei Stunden
      // spaeter, und der Vormittag blieb buchbar.
      const e = await sperren({
        platzIds: gewaehlt,
        von: berlinTime(tag, timeToMinutes(von)).toISOString(),
        bis: berlinTime(tag, timeToMinutes(bis)).toISOString(),
        artCode,
        grund,
        verdraengen,
      });
      melde(e);
      setKollisionen(e.kollisionen ?? null);
      if (e.ok) {
        setGewaehlt([]);
        setGrund("");
        setKollisionen(null);
      }
    });
  }

  return (
    <section className="karte sperrformular">
      <h2 className="dpl">Plätze sperren</h2>
      <p className="unterzeile">
        Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt.
      </p>

      {/* Aufbau wie "Serie anlegen" (VwBlatt): Chips, grosse Tippfelder, Folgen vor dem Absenden */}
      <fieldset className="chipwahl" style={{ ["--spalten" as string]: Math.min(plaetze.length + 1, 9) }}>
        <legend>Plätze</legend>
        <div>
          {plaetze.map((p) => {
            const an = gewaehlt.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="dpl"
                aria-pressed={an}
                aria-label={p.name}
                onClick={() => {
                  setGewaehlt(an ? gewaehlt.filter((x) => x !== p.id) : [...gewaehlt, p.id]);
                  setKollisionen(null);
                }}
              >
                {p.short_name.replace(/^P/, "")}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={gewaehlt.length === plaetze.length}
            onClick={() => {
              setGewaehlt(gewaehlt.length === plaetze.length ? [] : plaetze.map((p) => p.id));
              setKollisionen(null);
            }}
          >
            {gewaehlt.length === plaetze.length ? "Keinen" : "Alle"}
          </button>
        </div>
      </fieldset>

      <label className="tippfeld klein">
        <span>Tag</span>
        <input type="date" value={tag} onChange={(e) => { setTag(e.target.value); setKollisionen(null); }} />
      </label>
      <div className="tippfelder">
        <label className="tippfeld">
          <span>Von</span>
          <input type="time" step={1800} value={von} onChange={(e) => { setVon(e.target.value); setKollisionen(null); }} />
        </label>
        <label className="tippfeld">
          <span>Bis</span>
          <input type="time" step={1800} value={bis} onChange={(e) => { setBis(e.target.value); setKollisionen(null); }} />
        </label>
      </div>

      <div className="formraster">
        <label>
          <span>Art</span>
          <select value={artCode} onChange={(e) => setArtCode(e.target.value)}>
            {arten.map((a) => (
              <option key={a.code} value={a.code}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Grund</span>
          <input
            type="text"
            value={grund}
            placeholder="z. B. Platzpflege nach Regen"
            onChange={(e) => setGrund(e.target.value)}
          />
        </label>
      </div>

      {kollisionen !== null && (
        <div className="folgen" role="status">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M12 3 2 20h20zM12 10v4M12 17.5v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <b>{kollisionen} {kollisionen === 1 ? "Buchung liegt" : "Buchungen liegen"} im Weg.</b>{" "}
            Sie werden abgesagt, die Mitglieder bekommen Bescheid.
          </div>
        </div>
      )}

      {kollisionen === null ? (
        <button
          type="button"
          className="knopf gold block gross"
          disabled={laeuft || !vollstaendig}
          onClick={() => absenden(false)}
        >
          {laeuft ? "Wird gesperrt…" : "Sperren"}
        </button>
      ) : (
        <div className="fenster-fuss">
          <button type="button" className="knopf gefahr" disabled={laeuft} onClick={() => absenden(true)}>
            {kollisionen} {kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen
          </button>
          <button type="button" className="knopf leise" onClick={() => setKollisionen(null)}>
            Doch nicht
          </button>
        </div>
      )}
    </section>
  );
}

function Platzliste({
  plaetze, zustand, laeuft, starte, melde,
}: {
  plaetze: PlatzZeile[];
  zustand: Props["zustand"];
  laeuft: boolean;
  starte: Starter;
  melde: Melder;
}) {
  const [form, setForm] = useState(LEERER_PLATZ);
  const [offen, setOffen] = useState(false);
  const index = plaetze.findIndex((p) => p.id === form.id);
  const bearbeitet = index >= 0 ? plaetze[index]! : null;

  function speichern() {
    starte(async () => {
      const e = await platzSpeichern(form);
      melde(e);
      if (e.ok) {
        setForm(LEERER_PLATZ);
        setOffen(false);
      }
    });
  }

  function verschieben(i: number, richtung: -1 | 1) {
    const neu = [...plaetze];
    const ziel = i + richtung;
    if (ziel < 0 || ziel >= neu.length) return;
    [neu[i], neu[ziel]] = [neu[ziel]!, neu[i]!];
    starte(async () => melde(await plaetzeSortieren(neu.map((p) => p.id))));
  }

  function oeffnen(p: PlatzZeile | null) {
    setForm(p ? { id: p.id, name: p.name, kurzname: p.short_name, zusatz: p.subline ?? "" } : LEERER_PLATZ);
    setOffen(true);
  }

  return (
    <section className="liste-abschnitt" aria-labelledby="h-plaetze">
      <Gruppenkopf titel="Plätze" id="h-plaetze" />
      <p className="unterzeile">
        Die Reihenfolge bestimmt, wie die Spalten im Belegungsplan stehen. Ein stillgelegter
        Platz verschwindet aus dem Plan; seine bisherigen Buchungen bleiben erhalten.
      </p>

      <ul className="liste-gruppe" aria-label="Plätze">
        {plaetze.map((p) => {
          const heute = zustand[p.id];
          return (
            <li key={p.id}>
              <Listenzeile
                symbol={p.short_name}
                titel={p.name}
                kontext={[p.subline, p.offene_buchungen > 0 ? `${p.offene_buchungen} offene Buchungen` : null]
                  .filter(Boolean).join(" · ") || undefined}
                hinweis={!p.active ? "stillgelegt" : heute ? heute.text : "im Plan"}
                hinweisTon={!p.active ? "leise" : heute ? (heute.art === "gesperrt" ? "rot" : "gold") : "gruen"}
                onClick={() => oeffnen(p)}
              />
            </li>
          );
        })}
        <li>
          <Listenzeile titel="Neuen Platz anlegen" onClick={() => oeffnen(null)} />
        </li>
      </ul>

      {offen && (
        <FensterKnopf
          titel={bearbeitet ? bearbeitet.name : "Neuen Platz anlegen"}
          offen
          onSchliessen={() => setOffen(false)}
        >
          <div className="formraster">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              <span>Kurzname</span>
              <input
                type="text"
                value={form.kurzname}
                onChange={(e) => setForm({ ...form, kurzname: e.target.value })}
              />
            </label>
            <label>
              <span>Zusatz</span>
              <input
                type="text"
                value={form.zusatz}
                placeholder="z. B. Sandplatz"
                onChange={(e) => setForm({ ...form, zusatz: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="knopf gold block gross"
            disabled={laeuft || form.name.trim() === "" || form.kurzname.trim() === ""}
            onClick={speichern}
          >
            {form.id ? "Änderungen speichern" : "Platz anlegen"}
          </button>

          {bearbeitet && (
            <div className="liste-gruppe">
              <Listenzeile
                titel="Im Plan weiter nach vorne"
                pfeil={false}
                onClick={laeuft || index <= 0 ? undefined : () => verschieben(index, -1)}
              />
              <Listenzeile
                titel="Im Plan weiter nach hinten"
                pfeil={false}
                onClick={laeuft || index >= plaetze.length - 1 ? undefined : () => verschieben(index, 1)}
              />
              <Listenzeile
                titel={bearbeitet.active ? "Stilllegen" : "Aktivieren"}
                gefahr={bearbeitet.active}
                pfeil={false}
                onClick={laeuft ? undefined : () =>
                  starte(async () => {
                    melde(await platzUmschalten(bearbeitet.id, !bearbeitet.active));
                    setOffen(false);
                  })
                }
              />
            </div>
          )}
        </FensterKnopf>
      )}
    </section>
  );
}

const LEERE_ART = {
  code: "",
  name: "",
  art: "booking" as "booking" | "blocking",
  dauer: 60,
  minSpieler: 2,
  maxSpieler: 2,
  brauchtPartner: true,
  zaehltAufKontingent: true,
  aktiv: true,
};

function Artenliste({
  arten, laeuft, starte, melde,
}: { arten: ArtZeile[]; laeuft: boolean; starte: Starter; melde: Melder }) {
  const [form, setForm] = useState(LEERE_ART);
  const [offen, setOffen] = useState(false);
  const vorhanden = arten.some((a) => a.code === form.code);

  function oeffnen(a: ArtZeile | null) {
    setForm(
      a
        ? {
            code: a.code,
            name: a.name,
            art: a.applies_to,
            dauer: a.duration_minutes,
            minSpieler: a.min_players,
            maxSpieler: a.max_players,
            brauchtPartner: a.requires_partner,
            zaehltAufKontingent: a.counts_towards_quota,
            aktiv: a.active,
          }
        : LEERE_ART,
    );
    setOffen(true);
  }

  return (
    <section className="liste-abschnitt" aria-labelledby="h-arten">
      <Gruppenkopf titel="Buchungsarten" id="h-arten" />
      <p className="unterzeile">
        Der Code bleibt nach dem Anlegen fest – er steht in bestehenden Buchungen. Wer ihn ändern
        will, legt eine neue Art an und stellt die alte still.
      </p>

      <ul className="liste-gruppe" aria-label="Buchungsarten">
        {arten.map((a) => (
          <li key={a.code}>
            <Listenzeile
              titel={a.name}
              kontext={`${a.code} · ${a.applies_to === "booking" ? "Buchung" : "Blockung"} · ${a.duration_minutes} min · ${a.min_players}–${a.max_players} Spieler · ${a.counts_towards_quota ? "zählt aufs Kontingent" : "zählt nicht"}`}
              hinweis={a.active ? undefined : "still"}
              onClick={() => oeffnen(a)}
            />
          </li>
        ))}
        <li>
          <Listenzeile titel="Neue Buchungsart" onClick={() => oeffnen(null)} />
        </li>
      </ul>

      {offen && (
        <FensterKnopf
          titel={vorhanden ? `„${form.code}" bearbeiten` : "Neue Buchungsart"}
          offen
          onSchliessen={() => setOffen(false)}
        >
          <div className="formraster">
            <label>
              <span>Code</span>
              <input
                type="text"
                value={form.code}
                disabled={vorhanden}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              <span>Wofür</span>
              <select
                value={form.art}
                onChange={(e) => setForm({ ...form, art: e.target.value as "booking" | "blocking" })}
              >
                <option value="booking">Buchung durch Mitglieder</option>
                <option value="blocking">Blockung durch den Vorstand</option>
              </select>
            </label>
            <label>
              <span>Dauer in Minuten</span>
              <input
                type="number"
                min={15}
                max={1440}
                value={form.dauer}
                onChange={(e) => setForm({ ...form, dauer: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Spieler mindestens</span>
              <input
                type="number"
                min={0}
                value={form.minSpieler}
                onChange={(e) => setForm({ ...form, minSpieler: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Spieler höchstens</span>
              <input
                type="number"
                min={0}
                value={form.maxSpieler}
                onChange={(e) => setForm({ ...form, maxSpieler: Number(e.target.value) })}
              />
            </label>
            <label className="breit schalter">
              <input
                type="checkbox"
                checked={form.zaehltAufKontingent}
                onChange={(e) => setForm({ ...form, zaehltAufKontingent: e.target.checked })}
              />
              <span>Zählt auf das Buchungskontingent</span>
            </label>
            <label className="breit schalter">
              <input
                type="checkbox"
                checked={form.brauchtPartner}
                onChange={(e) => setForm({ ...form, brauchtPartner: e.target.checked })}
              />
              <span>Mindestens ein Mitspieler ist Pflicht</span>
            </label>
            <label className="breit schalter">
              <input
                type="checkbox"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              <span>Aktiv – wird zur Auswahl angeboten</span>
            </label>
          </div>
          <button
            type="button"
            className="knopf gold block gross"
            disabled={laeuft || form.code.trim() === "" || form.name.trim() === ""}
            onClick={() =>
              starte(async () => {
                const e = await buchungsartSpeichern(form);
                melde(e);
                if (e.ok) setOffen(false);
              })
            }
          >
            Speichern
          </button>
        </FensterKnopf>
      )}
    </section>
  );
}
