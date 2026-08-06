"use client";

import { useState, useTransition } from "react";
import { loginVerwalten, type LoginAktion } from "@/app/admin/mitglieder/[id]/login-aktionen";

export interface LoginZustand {
  hat_zugang: boolean;
  email: string | null;
  invited_at: string | null;
  disabled_at: string | null;
  last_sign_in: string | null;
  ist_admin: boolean;
  einladbar: boolean;
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
 */
export function LoginKarte({
  mitgliedId,
  zustand,
  selbst,
}: {
  mitgliedId: string;
  zustand: LoginZustand;
  selbst: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [entfernenOffen, setEntfernenOffen] = useState(false);

  function fuehreAus(aktion: LoginAktion) {
    starte(async () => {
      const e = await loginVerwalten(mitgliedId, aktion);
      setMeldung({ ok: e.ok, text: e.meldung });
      setEntfernenOffen(false);
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

      {!zustand.hat_zugang ? (
        <div className="detailkopf aktionen">
          <button
            className="knopf"
            disabled={laeuft || !zustand.einladbar}
            onClick={() => fuehreAus("einladen")}
          >
            {laeuft ? "Wird verschickt…" : "Einladung verschicken"}
          </button>
          <button
            className="knopf leise"
            disabled={laeuft || !zustand.email}
            onClick={() => fuehreAus("login_verknuepfen")}
          >
            Vorhandenen Zugang verbinden
          </button>
        </div>
      ) : (
        <div className="detailkopf aktionen">
          <button
            className="knopf leise"
            disabled={laeuft}
            onClick={() => fuehreAus("passwort_zuruecksetzen")}
          >
            Passwort zurücksetzen lassen
          </button>

          {selbst ? (
            <span className="beschreibung">
              Den eigenen Zugang kannst du hier nicht sperren oder entfernen.
            </span>
          ) : (
            <>
              <button
                className="knopf leise"
                disabled={laeuft}
                onClick={() => fuehreAus(gesperrt ? "login_aktivieren" : "login_deaktivieren")}
              >
                {gesperrt ? "Sperre aufheben" : "Zugang sperren"}
              </button>

              {entfernenOffen ? (
                <>
                  <button
                    className="knopf leise"
                    disabled={laeuft}
                    onClick={() => setEntfernenOffen(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="knopf gefahr"
                    disabled={laeuft}
                    onClick={() => fuehreAus("login_entfernen")}
                  >
                    Wirklich entfernen
                  </button>
                </>
              ) : (
                <button
                  className="knopf leise"
                  disabled={laeuft}
                  onClick={() => setEntfernenOffen(true)}
                >
                  Zugang entfernen
                </button>
              )}
            </>
          )}
        </div>
      )}

      {zustand.hat_zugang && !selbst && (
        <p className="beschreibung">
          Sperren ist umkehrbar und lässt die Daten unberührt – das ist fast immer der richtige Weg.
          Entfernen löscht das Konto endgültig; das Mitglied selbst bleibt bestehen.
          {zustand.ist_admin && " Mit dem Zugang enden auch die Verwaltungsrechte."}
        </p>
      )}
    </section>
  );
}
