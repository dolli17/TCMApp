"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import {
  beitragsartLoesen,
  beitragsartZuordnen,
} from "@/app/admin/mitglieder/[id]/finanz-aktionen";

export interface BeitragsZeile {
  fee_type_id: string;
  code: string;
  name: string;
  zugeordnet: boolean;
  override_amount_cents: number | null;
  note: string | null;
  preis_cents: number | null;
  effektiv_cents: number | null;
}

/**
 * Beitragsarten je Jahr.
 *
 * Ein Mitglied kann mehrere haben – Beitrag plus Schlüsselpfand ist der
 * häufigste Fall. Der Sonderbetrag überschreibt den Preis der Beitragsart,
 * etwa bei Ehrenmitgliedern oder anteiligem Beitrag bei Eintritt mitten im
 * Jahr; die Notiz daneben hält fest, warum.
 */
export function BeitragsartenKarte({
  mitgliedId,
  jahr,
  zeilen,
}: {
  mitgliedId: string;
  jahr: number;
  zeilen: BeitragsZeile[];
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [offen, setOffen] = useState(false);

  const zugeordnet = zeilen.filter((z) => z.zugeordnet);
  const verfuegbar = zeilen.filter((z) => !z.zugeordnet);
  const summe = zugeordnet.reduce((s, z) => s + (z.effektiv_cents ?? 0), 0);

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await beitragsartZuordnen(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setOffen(false);
    });
  }

  function loesen(feeTypeId: string) {
    starte(async () => {
      const e = await beitragsartLoesen(mitgliedId, feeTypeId, jahr);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  return (
    <section className="karte einstellungen" aria-label="Beitragsarten">
      <div className="detailkopf">
        <div>
          <h2 className="dpl">Beiträge {jahr}</h2>
          <p className="unterzeile">
            {zugeordnet.length === 0
              ? "Noch keine Beitragsart zugeordnet – dieses Mitglied bliebe beim Beitragslauf außen vor."
              : `Zusammen ${formatCents(summe)} im Jahr.`}
          </p>
        </div>
        <div className="aktionen">
          {/* Der Jahreswechsel läuft über die Adresse, damit er sich verlinken
              und mit dem Zurück des Browsers zurücknehmen lässt. */}
          <select
            aria-label="Jahr"
            value={jahr}
            onChange={(e) => router.push(`?abschnitt=finanzen&jahr=${e.target.value}`)}
          >
            {[jahr + 1, jahr, jahr - 1, jahr - 2].map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
      </div>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {zugeordnet.length > 0 && (
        <div className="tabellenhuelle">
          <table className="liste">
            <thead>
              <tr>
                <th>Beitragsart</th>
                <th className="zahl">Preis</th>
                <th className="zahl">Sonderbetrag</th>
                <th>Notiz</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zugeordnet.map((z) => (
                <tr key={z.fee_type_id}>
                  <td>{z.name}</td>
                  <td className="zahl">
                    {z.preis_cents === null ? "—" : formatCents(z.preis_cents)}
                  </td>
                  <td className="zahl">
                    {z.override_amount_cents === null ? (
                      "—"
                    ) : (
                      <strong>{formatCents(z.override_amount_cents)}</strong>
                    )}
                  </td>
                  <td>{z.note ?? "—"}</td>
                  <td>
                    <button
                      className="knopf leise klein"
                      disabled={laeuft}
                      onClick={() => loesen(z.fee_type_id)}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!offen ? (
        <button
          className="knopf"
          disabled={laeuft || verfuegbar.length === 0}
          onClick={() => setOffen(true)}
        >
          Beitragsart zuordnen
        </button>
      ) : (
        <form action={abschicken}>
          <input type="hidden" name="mitglied" value={mitgliedId} />
          <input type="hidden" name="jahr" value={jahr} />
          <div className="formraster">
            <label>
              <span>Beitragsart</span>
              <select name="fee_type" required aria-label="Beitragsart">
                <option value="">Auswählen…</option>
                {verfuegbar.map((z) => (
                  <option key={z.fee_type_id} value={z.fee_type_id}>
                    {z.name}
                    {z.preis_cents !== null ? ` (${formatCents(z.preis_cents)})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sonderbetrag</span>
              <input name="override" placeholder="z. B. 0,00" inputMode="decimal" />
              <span className="beschreibung">
                Leer lassen, wenn der übliche Preis gilt.
              </span>
            </label>
            <label>
              <span>Notiz</span>
              <input name="note" placeholder="z. B. Ehrenmitglied seit 2020" />
            </label>
          </div>

          <div className="detailkopf aktionen">
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => setOffen(false)}
            >
              Abbrechen
            </button>
            <button className="knopf" disabled={laeuft}>
              {laeuft ? "Wird zugeordnet…" : "Zuordnen"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
