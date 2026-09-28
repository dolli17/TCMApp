"use client";

import { useState, useTransition } from "react";
import { formatCents, parseAmountToCents } from "@tcm/core";
import {
  geplantenPreisEntfernen, getraenkSpeichern, getraenkUmschalten, getraenkeSortieren,
  preisSetzen,
} from "@/app/admin/getraenke/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Listenzeile } from "@/components/Listenzeile";

export interface GetraenkZeile {
  id: string;
  name: string;
  description: string | null;
  category: "drink" | "food" | "other";
  sort_order: number;
  active: boolean;
  price_cents: number | null;
  price_valid_from: string | null;
  naechster_preis_cents: number | null;
  naechster_preis_ab: string | null;
  buchungen: number;
  buchungen_offen: number;
}

const ART_TEXT: Record<GetraenkZeile["category"], string> = {
  drink: "Getränk",
  food: "Essen",
  other: "Sonstiges",
};

const DATUM = new Intl.DateTimeFormat("de-DE");

const LEER = {
  id: null as string | null,
  name: "",
  beschreibung: "",
  art: "drink" as GetraenkZeile["category"],
  preis: "",
};

/**
 * Eingetippter Eurobetrag in Cent.
 *
 * `parseAmountToCents` wirft bei allem, was kein Betrag ist – bei Geld wird
 * nicht stillschweigend gerundet. Hier wird der Wurf in eine Meldung
 * übersetzt, statt die Oberfläche mit einem Fehler stehen zu lassen.
 */
function inCents(eingabe: string): number | null {
  try {
    return parseAmountToCents(eingabe);
  } catch {
    return null;
  }
}

const KEIN_BETRAG = { ok: false, meldung: "Das ist kein gültiger Betrag, z. B. 2,50." };

/**
 * Die Karte an der Theke.
 *
 * Zwei Karten untereinander, wie bei den Plätzen: oben die Liste mit ihrem
 * Formular, darunter die Preisänderung. Getrennt, weil eine Preisänderung
 * etwas anderes ist als eine Namensänderung — sie legt eine neue Zeile in der
 * Historie an und lässt alle bisherigen Buchungen unberührt. Das soll man
 * sehen, nicht nebenbei in einem Feld erledigen.
 */
export function GetraenkeVerwaltung({ getraenke }: { getraenke: GetraenkZeile[] }) {
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

      <Kartenliste getraenke={getraenke} laeuft={laeuft} starte={starte} melde={melde} />
      <Preisbereich getraenke={getraenke} laeuft={laeuft} starte={starte} melde={melde} />
    </>
  );
}

type Starter = (f: () => void | Promise<void>) => void;
type Melder = (e: { ok: boolean; meldung: string }) => void;

function Kartenliste({
  getraenke, laeuft, starte, melde,
}: { getraenke: GetraenkZeile[]; laeuft: boolean; starte: Starter; melde: Melder }) {
  const [gewaehlt, setGewaehlt] = useState<GetraenkZeile | null>(null);

  function verschieben(index: number, richtung: -1 | 1) {
    const neu = [...getraenke];
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= neu.length) return;
    [neu[index], neu[ziel]] = [neu[ziel]!, neu[index]!];
    starte(async () => melde(await getraenkeSortieren(neu.map((g) => g.id))));
  }

  const index = gewaehlt ? getraenke.findIndex((g) => g.id === gewaehlt.id) : -1;

  return (
    <section className="karte" aria-labelledby="h-getraenkekarte">
      <h2 className="dpl" id="h-getraenkekarte">Getränkekarte</h2>
      <p className="unterzeile">
        Was an der Theke angeboten wird, in der Reihenfolge, in der es dort erscheint. Ein
        stillgelegtes Getränk verschwindet aus der Karte; seine bisherigen Buchungen bleiben.
      </p>

      <ul className="liste-gruppe" aria-label="Getränke">
        {getraenke.map((g) => (
          <li key={g.id}>
            <Listenzeile
              titel={g.name}
              kontext={[
                g.description,
                ART_TEXT[g.category],
                `${g.buchungen} Buchungen`,
                g.naechster_preis_cents !== null && g.naechster_preis_ab !== null
                  ? `${formatCents(g.naechster_preis_cents)} ab ${DATUM.format(new Date(g.naechster_preis_ab))}`
                  : null,
              ].filter(Boolean).join(" · ")}
              neben={
                <span className="neben">
                  <span className="betrag tnum">{g.price_cents === null ? "—" : formatCents(g.price_cents)}</span>
                  {!g.active && <span className="statusmarke">stillgelegt</span>}
                </span>
              }
              onClick={() => setGewaehlt(g)}
            />
          </li>
        ))}
      </ul>

      {/* Bearbeiten, Reihenfolge und Stilllegen stehen im Blatt (Regel 4) */}
      {gewaehlt && (
        <FensterKnopf titel={gewaehlt.name} unterzeile="Getränk bearbeiten" offen onSchliessen={() => setGewaehlt(null)}>
          <GetraenkFormular key={gewaehlt.id} vorhanden={gewaehlt} onFertig={() => setGewaehlt(null)} />
          <div className="liste-gruppe">
            <Listenzeile
              titel="Weiter nach oben"
              pfeil={false}
              onClick={laeuft || index <= 0 ? undefined : () => verschieben(index, -1)}
            />
            <Listenzeile
              titel="Weiter nach unten"
              pfeil={false}
              onClick={laeuft || index >= getraenke.length - 1 ? undefined : () => verschieben(index, 1)}
            />
            <Listenzeile
              titel={gewaehlt.active ? "Stilllegen" : "Wieder anbieten"}
              gefahr={gewaehlt.active}
              pfeil={false}
              onClick={laeuft ? undefined : () =>
                starte(async () => {
                  melde(await getraenkUmschalten(gewaehlt.id, !gewaehlt.active));
                  setGewaehlt(null);
                })
              }
            />
          </div>
        </FensterKnopf>
      )}
    </section>
  );
}

/**
 * Ein Getränk anlegen oder umbenennen - im Blatt, mit eigener Rückmeldung.
 * Ohne Preis taucht ein neues Getränk in der Karte gar nicht auf, deshalb
 * bleibt der Knopf bis dahin gesperrt.
 */
export function GetraenkFormular({
  vorhanden,
  onFertig,
}: {
  vorhanden?: GetraenkZeile;
  onFertig?: () => void;
}) {
  const [form, setForm] = useState(
    vorhanden
      ? { id: vorhanden.id, name: vorhanden.name, beschreibung: vorhanden.description ?? "", art: vorhanden.category, preis: "" }
      : LEER,
  );
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const neu = form.id === null;

  function speichern() {
    const preis = form.preis.trim() === "" ? null : inCents(form.preis);
    if (form.preis.trim() !== "" && preis === null) {
      setMeldung({ ok: false, text: KEIN_BETRAG.meldung });
      return;
    }
    starte(async () => {
      const e = await getraenkSpeichern({
        id: form.id,
        name: form.name,
        beschreibung: form.beschreibung,
        art: form.art,
        preisCents: preis,
      });
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) {
        if (neu) setForm(LEER);
        onFertig?.();
      }
    });
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}
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
          <span>Art</span>
          <select
            value={form.art}
            onChange={(e) =>
              setForm({ ...form, art: e.target.value as GetraenkZeile["category"] })
            }
          >
            <option value="drink">Getränk</option>
            <option value="food">Essen</option>
            <option value="other">Sonstiges</option>
          </select>
        </label>
        <label>
          <span>{neu ? "Preis" : "Preis (leer = unverändert)"}</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.preis}
            placeholder="2,50"
            onChange={(e) => setForm({ ...form, preis: e.target.value })}
          />
        </label>
        <label className="breit">
          <span>Beschreibung</span>
          <input
            type="text"
            value={form.beschreibung}
            placeholder="z. B. 0,5 Liter"
            onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
          />
        </label>
      </div>
      {neu && (
        <p className="mit">
          Ein neues Getränk braucht einen Preis – ohne ihn taucht es in der Karte gar nicht auf.
        </p>
      )}
      <button
        type="button"
        className="knopf gold block gross"
        disabled={laeuft || form.name.trim() === "" || (neu && form.preis.trim() === "")}
        onClick={speichern}
      >
        {neu ? "Getränk anlegen" : "Änderungen speichern"}
      </button>
    </>
  );
}

/**
 * Preise ändern und geplante Erhöhungen zurücknehmen.
 *
 * „Gültig ab" kann in der Zukunft liegen: die Preishistorie kennt kein
 * Enddatum, ein späterer Eintrag löst den früheren von selbst ab. Damit lässt
 * sich eine Erhöhung zum Monatsersten heute schon eintragen.
 */
function Preisbereich({
  getraenke, laeuft, starte, melde,
}: { getraenke: GetraenkZeile[]; laeuft: boolean; starte: Starter; melde: Melder }) {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [itemId, setItemId] = useState(getraenke[0]?.id ?? "");
  const [preis, setPreis] = useState("");
  const [ab, setAb] = useState(heute);

  const geplante = getraenke.filter(
    (g) => g.naechster_preis_cents !== null && g.naechster_preis_ab !== null,
  );

  return (
    <section className="karte">
      <h2 className="dpl">Preis ändern</h2>
      <p className="unterzeile">
        Bereits gebuchte Getränke behalten ihren Preis – er wird beim Buchen festgehalten. Eine
        Änderung wirkt nur auf das, was danach über die Theke geht.
      </p>

      <div className="formraster">
        <label>
          <span>Getränk</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {getraenke.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.price_cents !== null ? ` (${formatCents(g.price_cents)})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Neuer Preis</span>
          <input
            type="text"
            inputMode="decimal"
            value={preis}
            placeholder="2,80"
            onChange={(e) => setPreis(e.target.value)}
          />
        </label>
        <label>
          <span>Gültig ab</span>
          <input type="date" min={heute} value={ab} onChange={(e) => setAb(e.target.value)} />
        </label>
      </div>

      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf"
          disabled={laeuft || itemId === "" || preis.trim() === ""}
          onClick={() => {
            const cents = inCents(preis);
            if (cents === null) {
              melde(KEIN_BETRAG);
              return;
            }
            starte(async () => {
              const e = await preisSetzen({ itemId, preisCents: cents, gueltigAb: ab });
              melde(e);
              if (e.ok) setPreis("");
            });
          }}
        >
          Preis setzen
        </button>
      </div>

      {geplante.length > 0 && (
        <>
          <h3 className="dpl">Geplante Preise</h3>
          <ul className="terminliste">
            {geplante.map((g) => (
              <li key={g.id} className="mcard termin">
                <div className="termin-text">
                  <strong>{g.name}</strong>{" "}
                  <span className="tnum">{formatCents(g.naechster_preis_cents!)}</span>
                  <div className="mit">ab {DATUM.format(new Date(g.naechster_preis_ab!))}</div>
                </div>
                <div className="termin-tat">
                  <button
                    type="button"
                    className="knopf leise klein"
                    disabled={laeuft}
                    onClick={() =>
                      starte(async () =>
                        melde(await geplantenPreisEntfernen(g.id, g.naechster_preis_ab!)),
                      )
                    }
                  >
                    Zurücknehmen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
