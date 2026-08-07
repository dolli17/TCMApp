"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { serieAnlegen, serieVorschau, type Kollision } from "@/app/admin/plaetze/aktionen";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function SerienFormular({
  plaetze,
  arten,
}: {
  plaetze: { id: string; name: string }[];
  arten: { code: string; name: string }[];
}) {
  const router = useRouter();
  const heute = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    courtId: plaetze[0]?.id ?? "",
    bookingTypeCode: arten[0]?.code ?? "training",
    weekday: 2,
    startTime: "18:30",
    endTime: "20:00",
    validFrom: heute,
    validTo: heute,
    title: "",
  });

  const [vorschau, setVorschau] = useState<Kollision[] | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const kollisionen = (vorschau ?? []).filter((t) => t.conflict_booking_id);

  function pruefen() {
    setMeldung(null);
    starte(async () => {
      const r = await serieVorschau(form);
      if (!r.ok) {
        setMeldung({ ok: false, text: r.meldung ?? "Vorschau fehlgeschlagen." });
        setVorschau(null);
        return;
      }
      setVorschau(r.termine);
    });
  }

  function anlegen(verdraengen: boolean) {
    starte(async () => {
      const r = await serieAnlegen({ ...form, verdraengen });
      setMeldung({ ok: r.ok, text: r.meldung ?? "" });
      if (r.ok) {
        setVorschau(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="karte" style={{ marginBottom: "2rem" }}>
      <div className="formraster eng">
        <label>
          <span>Titel</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="z. B. Jugendtraining"
          />
        </label>
        <label>
          <span>Art</span>
          <select
            value={form.bookingTypeCode}
            onChange={(e) => setForm({ ...form, bookingTypeCode: e.target.value })}
          >
            {arten.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Platz</span>
          <select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })}>
            {plaetze.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Wochentag</span>
          <select
            value={form.weekday}
            onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
          >
            {WOCHENTAGE.map((t, i) => (
              <option key={i} value={i}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Von</span>
          <input
            type="time"
            step={1800}
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </label>
        <label>
          <span>Bis</span>
          <input
            type="time"
            step={1800}
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </label>
        <label>
          <span>Ab</span>
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
          />
        </label>
        <label>
          <span>Bis</span>
          <input
            type="date"
            value={form.validTo}
            onChange={(e) => setForm({ ...form, validTo: e.target.value })}
          />
        </label>
      </div>

      {meldung && <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`}>{meldung.text}</div>}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="knopf leise" onClick={pruefen} disabled={laeuft || !form.title.trim()}>
          {laeuft ? "…" : "Vorschau"}
        </button>

        {vorschau && kollisionen.length === 0 && (
          <button className="knopf" onClick={() => anlegen(false)} disabled={laeuft}>
            {vorschau.length} Termine anlegen
          </button>
        )}

        {vorschau && kollisionen.length > 0 && (
          <button className="knopf" onClick={() => anlegen(true)} disabled={laeuft}>
            Anlegen und {kollisionen.length} Buchungen verdrängen
          </button>
        )}
      </div>

      {vorschau && (
        <div style={{ marginTop: "1rem" }}>
          <p>
            <strong>{vorschau.length} Termine.</strong>{" "}
            {kollisionen.length === 0 ? (
              "Keine Kollisionen."
            ) : (
              <span style={{ color: "var(--red)" }}>
                {kollisionen.length} bestehende Buchungen würden aufgehoben. Die
                Betroffenen werden benachrichtigt.
              </span>
            )}
          </p>

          {kollisionen.length > 0 && (
            <div className="tabellenhuelle">
        <table className="liste">
              <thead>
                <tr>
                  <th>Termin</th>
                  <th>Betrifft</th>
                </tr>
              </thead>
              <tbody>
                {kollisionen.map((k, i) => (
                  <tr key={i}>
                    <td>
                      {new Intl.DateTimeFormat("de-DE", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/Berlin",
                      }).format(new Date(k.starts_at))}
                    </td>
                    <td>
                      {k.conflict_member_name ??
                        (k.conflict_kind === "blocking" ? "andere Blockung" : "unbekannt")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
          )}
        </div>
      )}
    </div>
  );
}
