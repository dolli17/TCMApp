"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { serieAnlegen, serieVorschau, type Kollision } from "@/app/admin/plaetze/aktionen";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const TAGE = [
  { wert: 1, kurz: "Mo" }, { wert: 2, kurz: "Di" }, { wert: 3, kurz: "Mi" }, { wert: 4, kurz: "Do" },
  { wert: 5, kurz: "Fr" }, { wert: 6, kurz: "Sa" }, { wert: 0, kurz: "So" },
];
const TERMIN = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/**
 * Eine Serie anlegen - als Blatt (docs/design/clubhaus/verwaltung, VwBlatt).
 *
 * Felder gruppiert, Wochentag und Platz als Chips, Uhrzeit und Datum als
 * grosse Tippfelder. Die Folgen stehen vor dem Absenden: erst "Vorschau",
 * dann nennt der Knopf das Ergebnis ("Serie anlegen · [n] Termine"). Wer
 * danach etwas aendert, muss neu pruefen - sonst gaelte eine alte Vorschau.
 *
 * Eine Serie gilt fuer einen Platz; so legt sie die Datenbank an.
 */
export function SerienFormular({
  plaetze,
  arten,
}: {
  plaetze: { id: string; name: string }[];
  arten: { code: string; name: string }[];
}) {
  const router = useRouter();
  const heute = new Date().toISOString().slice(0, 10);

  const [form, setFormRoh] = useState({
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

  function setForm(neu: typeof form) {
    setFormRoh(neu);
    setVorschau(null);
  }

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
    <div className="serienformular">
      <div className="formraster">
        <label>
          <span>Titel</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="z. B. Training Herren"
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
      </div>

      <fieldset className="chipwahl">
        <legend>Wochentag</legend>
        <div>
          {TAGE.map((t) => (
            <button
              key={t.wert}
              type="button"
              aria-pressed={form.weekday === t.wert}
              aria-label={WOCHENTAGE[t.wert]}
              onClick={() => setForm({ ...form, weekday: t.wert })}
            >
              {t.kurz}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="tippfelder">
        <label className="tippfeld">
          <span>Von</span>
          <input
            type="time"
            step={1800}
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </label>
        <label className="tippfeld">
          <span>Bis</span>
          <input
            type="time"
            step={1800}
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="chipwahl" style={{ ["--spalten" as string]: Math.min(plaetze.length, 8) }}>
        <legend>Platz</legend>
        <div>
          {plaetze.map((p) => (
            <button
              key={p.id}
              type="button"
              className="dpl"
              aria-pressed={form.courtId === p.id}
              aria-label={p.name}
              onClick={() => setForm({ ...form, courtId: p.id })}
            >
              {p.name.replace(/^Platz\s*/i, "")}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="tippfelder">
        <label className="tippfeld klein">
          <span>Ab</span>
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
          />
        </label>
        <label className="tippfeld klein">
          <span>Bis</span>
          <input
            type="date"
            value={form.validTo}
            onChange={(e) => setForm({ ...form, validTo: e.target.value })}
          />
        </label>
      </div>

      {meldung && <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`}>{meldung.text}</div>}

      {/* Die Folgen vor dem Absenden (Regel 5) */}
      {vorschau && (
        <div className="folgen" role="status">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M12 3 2 20h20zM12 10v4M12 17.5v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            {kollisionen.length === 0 ? (
              <><b>{vorschau.length} Termine, nichts im Weg.</b> Die Serie kann so angelegt werden.</>
            ) : (
              <>
                <b>{kollisionen.length} {kollisionen.length === 1 ? "Buchung liegt" : "Buchungen liegen"} im Weg.</b>{" "}
                Sie werden abgesagt, die Mitglieder bekommen Bescheid.
                <ul className="folgen-liste">
                  {kollisionen.map((k, i) => (
                    <li key={i}>
                      {TERMIN.format(new Date(k.starts_at))} ·{" "}
                      {k.conflict_member_name ??
                        (k.conflict_kind === "blocking" ? "andere Blockung" : "unbekannt")}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {!vorschau ? (
        <button className="knopf gold block gross" onClick={pruefen} disabled={laeuft || !form.title.trim()}>
          {laeuft ? "Wird geprüft…" : "Vorschau"}
        </button>
      ) : (
        <button className="knopf gold block gross" onClick={() => anlegen(kollisionen.length > 0)} disabled={laeuft}>
          {kollisionen.length === 0
            ? `Serie anlegen · ${vorschau.length} Termine`
            : `Anlegen und ${kollisionen.length} ${kollisionen.length === 1 ? "Buchung" : "Buchungen"} verdrängen`}
        </button>
      )}
    </div>
  );
}
