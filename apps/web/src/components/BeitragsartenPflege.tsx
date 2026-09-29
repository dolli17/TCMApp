"use client";

import { useState, useTransition } from "react";
import { formatCents, parseAmountToCents } from "@tcm/core";
import {
  beitragsartSpeichern, beitragsartUmschalten, beitragspreisSetzen,
} from "@/app/admin/kasse/aktionen";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

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
  const [blattOffen, setBlattOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function melde(e: { ok: boolean; meldung: string }) {
    setMeldung({ ok: e.ok, text: e.meldung });
  }

  const neu = form.id === null;
  const bearbeitet = arten.find((a) => a.id === form.id) ?? null;

  function oeffnen(a: BeitragsartZeile | null) {
    setForm(a ? { id: a.id, code: a.code, name: a.name, beschreibung: a.description ?? "" } : LEER);
    setPreisFuer(a?.id ?? null);
    setPreis("");
    setBlattOffen(true);
  }

  return (
    <section className="liste-abschnitt" aria-labelledby="h-beitragsarten">
      <Gruppenkopf titel="Beitragsarten" id="h-beitragsarten" />
      <p className="unterzeile">
        Der Code bleibt nach dem Anlegen fest – er steht in den Zuordnungen der Mitglieder. Ein
        Preis lässt sich nur für Jahre setzen, für die noch keine Forderungen erzeugt wurden.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <ul className="liste-gruppe" aria-label="Beitragsarten">
        {arten.map((a) => (
          <li key={a.id}>
            <Listenzeile
              titel={a.name}
              kontext={[
                a.code,
                `${a.mitglieder} Mitglieder`,
                a.soll_stunden !== null ? `${a.soll_stunden} h Arbeitsdienst` : null,
                a.naechster_preis_cents !== null
                  ? `${formatCents(a.naechster_preis_cents)} ab ${a.naechster_preis_ab_jahr}`
                  : null,
              ].filter(Boolean).join(" · ")}
              neben={
                <span className="neben">
                  <span className="betrag tnum">{a.preis_cents === null ? "—" : formatCents(a.preis_cents)}</span>
                  {!a.active && <span className="statusmarke">still</span>}
                </span>
              }
              onClick={() => oeffnen(a)}
            />
          </li>
        ))}
        <li>
          <Listenzeile titel="Neue Beitragsart" onClick={() => oeffnen(null)} />
        </li>
      </ul>

      {/* Name, Preis und Stilllegen stehen im Blatt (Regeln 4 und 5) */}
      {blattOffen && (
        <FensterKnopf
          titel={bearbeitet ? bearbeitet.name : "Neue Beitragsart"}
          unterzeile={bearbeitet ? `Code ${bearbeitet.code}` : undefined}
          offen
          onSchliessen={() => setBlattOffen(false)}
        >
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
          <button
            type="button"
            className="knopf gold block gross"
            disabled={laeuft || form.name.trim() === "" || (neu && form.code.trim() === "")}
            onClick={() =>
              starte(async () => {
                const e = await beitragsartSpeichern(form);
                melde(e);
                if (e.ok) setBlattOffen(false);
              })
            }
          >
            {neu ? "Beitragsart anlegen" : "Änderungen speichern"}
          </button>

          {preisFuer && (
            <>
              <h3 className="dpl">Preis</h3>
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
              <button
                type="button"
                className="knopf leise block"
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
                    if (e.ok) setBlattOffen(false);
                  });
                }}
              >
                Preis setzen
              </button>
            </>
          )}

          {bearbeitet && (
            <div className="liste-gruppe">
              <Listenzeile
                titel={bearbeitet.active ? "Stilllegen" : "Wieder anbieten"}
                gefahr={bearbeitet.active}
                pfeil={false}
                onClick={laeuft ? undefined : () =>
                  starte(async () => {
                    melde(await beitragsartUmschalten(bearbeitet.id, !bearbeitet.active));
                    setBlattOffen(false);
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
