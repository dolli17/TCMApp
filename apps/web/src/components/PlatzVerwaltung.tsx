"use client";

import { useState, useTransition } from "react";
import { berlinTime, timeToMinutes } from "@tcm/core";
import {
  buchungsartSpeichern, platzSpeichern, platzUmschalten, plaetzeSortieren, sperren,
} from "@/app/admin/plaetze/aktionen";

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
  /** Blockungsarten fuer die Sperrung, nach sort_order. */
  blockungsarten: { code: string; name: string }[];
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

      <Sperrformular
        plaetze={props.plaetze.filter((p) => p.active)}
        arten={props.blockungsarten}
        laeuft={laeuft}
        starte={starte}
        melde={melde}
      />

      <Platzliste plaetze={props.plaetze} laeuft={laeuft} starte={starte} melde={melde} />

      <Artenliste arten={props.arten} laeuft={laeuft} starte={starte} melde={melde} />
    </>
  );
}

type Starter = (f: () => void | Promise<void>) => void;
type Melder = (e: { ok: boolean; meldung: string }) => void;

/**
 * Platz sperren.
 *
 * Bis jetzt ging das nur, indem der Vorstand eine Serie ueber einen einzigen
 * Tag legte. Der zweistufige Ablauf ist derselbe wie bei den Serien: erst
 * zaehlen, dann fragen, dann verdraengen.
 */
function Sperrformular({
  plaetze, arten, laeuft, starte, melde,
}: {
  plaetze: PlatzZeile[];
  arten: { code: string; name: string }[];
  laeuft: boolean;
  starte: Starter;
  melde: Melder;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [von, setVon] = useState("08:00");
  const [bis, setBis] = useState("21:00");
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
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Plätze sperren</h2>
      <p className="unterzeile">
        Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt.
      </p>

      <fieldset className="platzwahl">
        <legend>Plätze</legend>
        {plaetze.map((p) => {
          const an = gewaehlt.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`slotknopf ${an ? "aktiv" : ""}`}
              aria-pressed={an}
              onClick={() =>
                setGewaehlt(an ? gewaehlt.filter((x) => x !== p.id) : [...gewaehlt, p.id])
              }
            >
              {p.short_name}
            </button>
          );
        })}
        <button
          type="button"
          className="knopf leise klein"
          onClick={() =>
            setGewaehlt(gewaehlt.length === plaetze.length ? [] : plaetze.map((p) => p.id))
          }
        >
          {gewaehlt.length === plaetze.length ? "Keinen" : "Alle"}
        </button>
      </fieldset>

      <div className="formraster">
        <label>
          <span>Tag</span>
          <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
        <label>
          <span>Von</span>
          <input type="time" step={1800} value={von} onChange={(e) => setVon(e.target.value)} />
        </label>
        <label>
          <span>Bis</span>
          <input type="time" step={1800} value={bis} onChange={(e) => setBis(e.target.value)} />
        </label>
        <label>
          <span>Art</span>
          <select value={artCode} onChange={(e) => setArtCode(e.target.value)}>
            {arten.map((a) => (
              <option key={a.code} value={a.code}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="breit">
          <span>Grund</span>
          <input
            type="text"
            value={grund}
            placeholder="z. B. Platzpflege nach Regen"
            onChange={(e) => setGrund(e.target.value)}
          />
        </label>
      </div>

      <div className="fenster-fuss">
        {kollisionen === null ? (
          <button
            type="button"
            className="knopf"
            disabled={laeuft || !vollstaendig}
            onClick={() => absenden(false)}
          >
            {laeuft ? "Wird gesperrt…" : "Sperren"}
          </button>
        ) : (
          <button
            type="button"
            className="knopf gefahr"
            disabled={laeuft}
            onClick={() => absenden(true)}
          >
            {kollisionen} {kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen
          </button>
        )}
        {kollisionen !== null && (
          <button type="button" className="knopf leise" onClick={() => setKollisionen(null)}>
            Doch nicht
          </button>
        )}
      </div>
    </section>
  );
}

function Platzliste({
  plaetze, laeuft, starte, melde,
}: { plaetze: PlatzZeile[]; laeuft: boolean; starte: Starter; melde: Melder }) {
  const [form, setForm] = useState(LEERER_PLATZ);

  function speichern() {
    starte(async () => {
      const e = await platzSpeichern(form);
      melde(e);
      if (e.ok) setForm(LEERER_PLATZ);
    });
  }

  function verschieben(index: number, richtung: -1 | 1) {
    const neu = [...plaetze];
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= neu.length) return;
    [neu[index], neu[ziel]] = [neu[ziel]!, neu[index]!];
    starte(async () => melde(await plaetzeSortieren(neu.map((p) => p.id))));
  }

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Plätze</h2>
      <p className="unterzeile">
        Die Reihenfolge bestimmt, wie die Spalten im Belegungsplan stehen. Ein stillgelegter
        Platz verschwindet aus dem Plan; seine bisherigen Buchungen bleiben erhalten.
      </p>

      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kurz</th>
            <th>Zusatz</th>
            <th className="zahl">Offen</th>
            <th>Status</th>
            <th>Reihenfolge</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plaetze.map((p, i) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.short_name}</td>
              <td>{p.subline ?? "—"}</td>
              <td className="zahl tnum">{p.offene_buchungen}</td>
              <td>
                <span className="marke-klein">{p.active ? "im Plan" : "stillgelegt"}</span>
              </td>
              <td>
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft || i === 0}
                  aria-label={`${p.name} nach vorne`}
                  onClick={() => verschieben(i, -1)}
                >
                  ↑
                </button>{" "}
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft || i === plaetze.length - 1}
                  aria-label={`${p.name} nach hinten`}
                  onClick={() => verschieben(i, 1)}
                >
                  ↓
                </button>
              </td>
              <td>
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() =>
                    setForm({
                      id: p.id,
                      name: p.name,
                      kurzname: p.short_name,
                      zusatz: p.subline ?? "",
                    })
                  }
                >
                  Bearbeiten
                </button>{" "}
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() => starte(async () => melde(await platzUmschalten(p.id, !p.active)))}
                >
                  {p.active ? "Stilllegen" : "Aktivieren"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <h3 className="dpl">{form.id ? "Platz bearbeiten" : "Neuen Platz anlegen"}</h3>
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
      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf"
          disabled={laeuft || form.name.trim() === "" || form.kurzname.trim() === ""}
          onClick={speichern}
        >
          {form.id ? "Änderungen speichern" : "Platz anlegen"}
        </button>
        {form.id && (
          <button type="button" className="knopf leise" onClick={() => setForm(LEERER_PLATZ)}>
            Abbrechen
          </button>
        )}
      </div>
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

  return (
    <section className="karte">
      <h2 className="dpl">Buchungsarten</h2>
      <p className="unterzeile">
        Der Code bleibt nach dem Anlegen fest – er steht in bestehenden Buchungen. Wer ihn ändern
        will, legt eine neue Art an und stellt die alte still.
      </p>

      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Wofür</th>
            <th className="zahl">Dauer</th>
            <th className="zahl">Spieler</th>
            <th>Kontingent</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {arten.map((a) => (
            <tr key={a.code}>
              <td>{a.code}</td>
              <td>{a.name}</td>
              <td>{a.applies_to === "booking" ? "Buchung" : "Blockung"}</td>
              <td className="zahl tnum">{a.duration_minutes} min</td>
              <td className="zahl tnum">{a.min_players}–{a.max_players}</td>
              <td>{a.counts_towards_quota ? "zählt" : "zählt nicht"}</td>
              <td><span className="marke-klein">{a.active ? "aktiv" : "still"}</span></td>
              <td>
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() =>
                    setForm({
                      code: a.code,
                      name: a.name,
                      art: a.applies_to,
                      dauer: a.duration_minutes,
                      minSpieler: a.min_players,
                      maxSpieler: a.max_players,
                      brauchtPartner: a.requires_partner,
                      zaehltAufKontingent: a.counts_towards_quota,
                      aktiv: a.active,
                    })
                  }
                >
                  Bearbeiten
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <h3 className="dpl">{form.code ? `„${form.code}" bearbeiten` : "Neue Buchungsart"}</h3>
      <div className="formraster">
        <label>
          <span>Code</span>
          <input
            type="text"
            value={form.code}
            disabled={arten.some((a) => a.code === form.code)}
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
      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf"
          disabled={laeuft || form.code.trim() === "" || form.name.trim() === ""}
          onClick={() =>
            starte(async () => {
              const e = await buchungsartSpeichern(form);
              melde(e);
              if (e.ok) setForm(LEERE_ART);
            })
          }
        >
          Speichern
        </button>
        <button type="button" className="knopf leise" onClick={() => setForm(LEERE_ART)}>
          Zurücksetzen
        </button>
      </div>
    </section>
  );
}
