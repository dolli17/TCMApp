"use client";

import { useState, useTransition } from "react";
import {
  CHARGE_KINDS, CHARGE_KIND_LABEL, parseAmountToCents, type ChargeKind,
} from "@tcm/core";
import { forderungAnlegen } from "@/app/admin/kasse/aktionen";

export interface MitgliedWahl {
  id: string;
  name: string;
}

/**
 * Eine Forderung von Hand anlegen - für alles, was keine eigene Abrechnung
 * hat: ein verlorener Schlüssel, Pfand für die Hallenkarte, eine
 * Nachberechnung. Die Aktion gab es schon, nur keinen Weg dorthin.
 *
 * Die Forderung entsteht offen; angekündigt und eingezogen wird sie wie jede
 * andere über „Zur Ankündigung bereit“ und den Lastschriftlauf.
 */
export function ForderungAnlegen({ mitglieder }: { mitglieder: MitgliedWahl[] }) {
  const [name, setName] = useState("");
  const [art, setArt] = useState<ChargeKind>("misc");
  const [betrag, setBetrag] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const mitglied = mitglieder.find((m) => m.name === name.trim());

  function anlegen() {
    let cents = 0;
    try {
      cents = parseAmountToCents(betrag);
    } catch {
      setMeldung({ ok: false, text: "Bitte einen Betrag in Euro angeben, etwa 25,00." });
      return;
    }
    if (!mitglied) {
      setMeldung({ ok: false, text: "Bitte ein Mitglied aus der Liste wählen." });
      return;
    }
    starte(async () => {
      const e = await forderungAnlegen({
        mitgliedId: mitglied.id, art, betragCents: cents, beschreibung, faelligAm: null,
      });
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) {
        setName(""); setBetrag(""); setBeschreibung("");
      }
    });
  }

  return (
    <section className="karte">
      <h2 className="dpl">Forderung von Hand</h2>
      <p className="unterzeile">
        Für alles ohne eigene Abrechnung. Die Forderung ist danach offen und wird wie jede andere
        angekündigt und eingezogen.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="formraster">
        <label>
          <span>Mitglied</span>
          <input list="forderung-mitglieder" value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id="forderung-mitglieder">
            {mitglieder.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Art</span>
          <select value={art} onChange={(e) => setArt(e.target.value as ChargeKind)}>
            {CHARGE_KINDS.map((k) => (
              <option key={k} value={k}>{CHARGE_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Betrag in Euro</span>
          <input inputMode="decimal" value={betrag} placeholder="25,00" onChange={(e) => setBetrag(e.target.value)} />
        </label>
        <label>
          <span>Beschreibung</span>
          <input value={beschreibung} placeholder="z. B. Ersatzschlüssel Clubhaus" onChange={(e) => setBeschreibung(e.target.value)} />
        </label>
      </div>

      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf gold"
          disabled={laeuft || name.trim() === "" || betrag.trim() === "" || beschreibung.trim() === ""}
          onClick={anlegen}
        >
          {laeuft ? "Wird angelegt…" : "Forderung anlegen"}
        </button>
      </div>
    </section>
  );
}
