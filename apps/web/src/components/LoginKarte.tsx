"use client";

import { useState, useTransition } from "react";
import { EINLADUNGS_STATUS_TEXT, type EinladungsStatus } from "@tcm/core";
import { loginVerwalten } from "@/app/admin/mitglieder/[id]/login-aktionen";
import type { LoginAktion } from "@/lib/supabase/member-login";

export interface LoginZustand {
  hat_zugang: boolean;
  email: string | null;
  invited_at: string | null;
  disabled_at: string | null;
  last_sign_in: string | null;
  ist_admin: boolean;
  grund: string | null;
}

function zeitpunkt(wert: string | null): string {
  if (!wert) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(wert),
  );
}

/**
 * Zugang zur App.
 *
 * Der Verein vergibt Logins selbst, sieht aber nie ein Passwort: eingeladen
 * wird per E-Mail, das Passwort setzt das Mitglied danach selbst. Deshalb gibt
 * es hier kein Feld dafür – und das ist kein fehlendes Bedienelement, sondern
 * der Punkt.
 *
 * Jedes Mitglied hat einen Login, er entsteht beim Anlegen (die Datenbank
 * erzwingt das). Ohne Login sind nur Archivierte. Einen Zugang entfernen geht
 * nicht – sperren ja, und mit dem Mitglied geht beim Löschen auch der Login.
 */
export function LoginKarte({
  mitgliedId,
  vorname,
  zustand,
  selbst,
  einladung = null,
}: {
  mitgliedId: string;
  vorname: string;
  zustand: LoginZustand;
  selbst: boolean;
  /** Nur bei offenem Onboarding: wo die Einladung steht. */
  einladung?: EinladungsStatus | null;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  // Sperren und Zurücksetzen wirken nach außen, deshalb mit Rückfrage.
  // Sperre aufheben und neu einladen gehen sofort.
  const [frage, setFrage] = useState<"sperren" | "zuruecksetzen" | null>(null);

  function fuehreAus(aktion: LoginAktion) {
    starte(async () => {
      const e = await loginVerwalten(mitgliedId, aktion);
      setMeldung({ ok: e.ok, text: e.meldung });
      setFrage(null);
    });
  }

  const gesperrt = Boolean(zustand.disabled_at);

  return (
    <section className="karte einstellungen" aria-label="Zugang">
      <h2 className="dpl">Zugang zur App</h2>
      <p className="unterzeile">
        Der Verein verschickt eine Einladung; das Passwort setzt das Mitglied selbst. Niemand im
        Vorstand kennt es.
      </p>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="einstellung">
        <span className="titel">
          Status{" "}
          {zustand.hat_zugang ? (
            gesperrt ? (
              <span className="marke-klein rot">gesperrt</span>
            ) : (
              <span className="marke-klein gruen">aktiv</span>
            )
          ) : (
            <span className="marke-klein grau">kein Zugang</span>
          )}{" "}
          {einladung && (
            <span className={`marke-klein ${einladung === "abgelaufen" ? "rot" : "gold"}`}>
              {EINLADUNGS_STATUS_TEXT[einladung]}
            </span>
          )}
        </span>

        <span className="beschreibung">
          {zustand.email ? `E-Mail: ${zustand.email}` : "Keine E-Mail-Adresse hinterlegt."}
          {zustand.hat_zugang && (
            <>
              <br />
              Eingeladen: {zeitpunkt(zustand.invited_at)}
              <br />
              Zuletzt angemeldet: {zeitpunkt(zustand.last_sign_in)}
            </>
          )}
          {gesperrt && (
            <>
              <br />
              Gesperrt seit {zeitpunkt(zustand.disabled_at)}
            </>
          )}
        </span>

        {zustand.grund && <p className="hinweis">{zustand.grund}</p>}
      </div>

      {zustand.hat_zugang && frage === null && (
        <div className="detailkopf aktionen">
          {einladung && !gesperrt && (
            <button className="knopf" disabled={laeuft} onClick={() => fuehreAus("einladung_erneut")}>
              Einladung erneut senden
            </button>
          )}
          <button className="knopf leise" disabled={laeuft} onClick={() => setFrage("zuruecksetzen")}>
            Passwort zurücksetzen lassen
          </button>

          {selbst ? (
            <span className="beschreibung">Den eigenen Zugang kannst du hier nicht sperren.</span>
          ) : gesperrt ? (
            <button className="knopf leise" disabled={laeuft} onClick={() => fuehreAus("login_aktivieren")}>
              Sperre aufheben
            </button>
          ) : (
            <button className="knopf gefahr-leise" disabled={laeuft} onClick={() => setFrage("sperren")}>
              Zugang sperren
            </button>
          )}
        </div>
      )}

      {frage === "zuruecksetzen" && (
        <div className="hinweis rueckfrage" role="group" aria-label="Passwort zurücksetzen">
          <span>
            Mail mit Link an <strong>{zustand.email ?? "die hinterlegte Adresse"}</strong> senden?
          </span>
          <span className="knopfreihe">
            <button className="knopf leise klein" disabled={laeuft} onClick={() => setFrage(null)} autoFocus>
              Abbrechen
            </button>
            <button className="knopf klein" disabled={laeuft} onClick={() => fuehreAus("passwort_zuruecksetzen")}>
              {laeuft ? "Wird gesendet…" : "Mail senden"}
            </button>
          </span>
        </div>
      )}

      {frage === "sperren" && (
        <div className="hinweis fehler rueckfrage" role="group" aria-label="Zugang sperren">
          <span>
            {vorname} kann sich danach nicht mehr anmelden, auch nicht in der App. Lässt sich wieder
            aufheben.
          </span>
          <span className="knopfreihe">
            <button className="knopf leise klein" disabled={laeuft} onClick={() => setFrage(null)} autoFocus>
              Abbrechen
            </button>
            <button className="knopf gefahr klein" disabled={laeuft} onClick={() => fuehreAus("login_deaktivieren")}>
              {laeuft ? "Wird gesperrt…" : "Wirklich sperren"}
            </button>
          </span>
        </div>
      )}

      {einladung && (
        <p className="beschreibung">
          {einladung === "onboarding_offen"
            ? "Das Mitglied hat sich angemeldet, die Einrichtung des Kontos aber noch nicht abgeschlossen. Eine neue Einladung führt wieder zum Passwort und dann ins Onboarding."
            : "Ein Einladungslink gilt 24 Stunden. Eine neue Einladung macht den bisherigen Link ungültig."}
        </p>
      )}

      {zustand.hat_zugang && !selbst && (
        <p className="beschreibung">
          Sperren ist umkehrbar und lässt die Daten unberührt. Den Login ganz entfernen gibt es
          nicht mehr: Er gehört zum Mitglied und geht erst mit ihm, beim Löschen oder
          Anonymisieren.
        </p>
      )}
    </section>
  );
}
