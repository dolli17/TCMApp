"use client";

import { useState, useTransition } from "react";
import { formatCents, parseAmountToCents } from "@tcm/core";
import {
  beitragsartSpeichern, beitragsartUmschalten, beitragspreisSetzen,
} from "@/app/admin/kasse/aktionen";

export interface BeitragsartZeile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  preis_cents: number | null;
  preis_ab_jahr: number | null;
  naechster_preis_cents: number | null;
  naechster_preis_ab_jahr: number | null;
  mitglieder: number;
  soll_stunden: number | null;
}

const LEER = { id: null as string | null, code: "", name: "", beschreibung: "" };

const KEIN_BETRAG = { ok: false, meldung: "Das ist kein gültiger Betrag, z. B. 120,00." };

function inCents(eingabe: string): number | null {
  try {
    return parseAmountToCents(eingabe);
  } catch {
    return null;
  }
}

/**
 * Beitragsarten und ihre Preise.
 *
 * Bis hierher ließen sie sich überhaupt nicht pflegen – auf fee_types lag nur
 * ein Leserecht, und ohne Preis bricht der Beitragslauf ab. Der Preis des
 * Folgejahrs steht mit in der Tabelle: eine beschlossene Erhöhung wäre sonst
 * bis zum Jahreswechsel unsichtbar und würde ein zweites Mal eingetragen.
 */
export function BeitragsartenPflege({
  arten, jahr,
}: {
  arten: BeitragsartZeile[];
  jahr: number;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState(LEER);
  const [preisFuer, setPreisFuer] = useState<string | null>(null);
  const [preis, setPreis] = useState("");
  const [preisJahr, setPreisJahr] = useState(jahr + 1);
  const [laeuft, starte] = useTransition();

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  const neu = form.id === null;

  return (
    <section className="karte" style={{ marginBottom: 18 }}>
      <h2 className="dpl">Beitragsarten</h2>
      <p className="unterzeile">
        Der Code bleibt nach dem Anlegen fest – er steht in den Zuordnungen der Mitglieder. Ein
        Preis lässt sich nur für Jahre setzen, für die noch keine Forderungen erzeugt wurden.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th className="zahl">Preis {jahr}</th>
            <th>Ab dem Folgejahr</th>
            <th className="zahl">Mitglieder</th>
            <th className="zahl">Soll-Stunden</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {arten.map((a) => (
            <tr key={a.id}>
              <td>{a.code}</td>
              <td>
                {a.name}
                {a.description && <div className="mit">{a.description}</div>}
              </td>
              <td className="zahl tnum">
                {a.preis_cents === null ? "—" : formatCents(a.preis_cents)}
              </td>
              <td className="mit">
                {a.naechster_preis_cents === null
                  ? "—"
                  : `${formatCents(a.naechster_preis_cents)} ab ${a.naechster_preis_ab_jahr}`}
              </td>
              <td className="zahl tnum">{a.mitglieder}</td>
              <td className="zahl tnum">{a.soll_stunden ?? "—"}</td>
              <td><span className="marke-klein">{a.active ? "aktiv" : "still"}</span></td>
              <td>
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() => {
                    setPreisFuer(a.id);
                    setPreis("");
                  }}
                >
                  Preis
                </button>{" "}
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() =>
                    setForm({
                      id: a.id,
                      code: a.code,
                      name: a.name,
                      beschreibung: a.description ?? "",
                    })
                  }
                >
                  Bearbeiten
                </button>{" "}
                <button
                  type="button"
                  className="knopf leise klein"
                  disabled={laeuft}
                  onClick={() =>
                    starte(async () => melde(await beitragsartUmschalten(a.id, !a.active)))
                  }
                >
                  {a.active ? "Stilllegen" : "Anbieten"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {preisFuer && (
        <>
          <h3 className="dpl">
            Preis für „{arten.find((a) => a.id === preisFuer)?.name}"
          </h3>
          <div className="formraster">
            <label>
              <span>Gilt ab Jahr</span>
              <input
                type="number"
                min={jahr}
                max={jahr + 5}
                value={preisJahr}
                onChange={(e) => setPreisJahr(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Jahresbeitrag</span>
              <input
                type="text"
                inputMode="decimal"
                value={preis}
                placeholder="120,00"
                onChange={(e) => setPreis(e.target.value)}
              />
            </label>
          </div>
          <div className="fenster-fuss">
            <button
              type="button"
              className="knopf"
              disabled={laeuft || preis.trim() === ""}
              onClick={() => {
                const cents = inCents(preis);
                if (cents === null) {
                  melde(KEIN_BETRAG);
                  return;
                }
                starte(async () => {
                  const e = await beitragspreisSetzen({
                    artId: preisFuer,
                    jahr: preisJahr,
                    betragCents: cents,
                  });
                  melde(e);
                  if (e.ok) setPreisFuer(null);
                });
              }}
            >
              Preis setzen
            </button>
            <button type="button" className="knopf leise" onClick={() => setPreisFuer(null)}>
              Abbrechen
            </button>
          </div>
        </>
      )}

      <h3 className="dpl">{neu ? "Neue Beitragsart" : `„${form.name}" bearbeiten`}</h3>
      <div className="formraster">
        <label>
          <span>Code</span>
          <input
            type="text"
            value={form.code}
            disabled={!neu}
            placeholder="erwachsene"
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label>
          <span>Name</span>
          <input
            type="text"
            value={form.name}
            placeholder="Erwachsene"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="breit">
          <span>Beschreibung</span>
          <input
            type="text"
            value={form.beschreibung}
            onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
          />
        </label>
      </div>
      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf"
          disabled={laeuft || form.name.trim() === "" || (neu && form.code.trim() === "")}
          onClick={() =>
            starte(async () => {
              const e = await beitragsartSpeichern(form);
              melde(e);
              if (e.ok) setForm(LEER);
            })
          }
        >
          {neu ? "Beitragsart anlegen" : "Änderungen speichern"}
        </button>
        {!neu && (
          <button type="button" className="knopf leise" onClick={() => setForm(LEER)}>
            Abbrechen
          </button>
        )}
      </div>
    </section>
  );
}
