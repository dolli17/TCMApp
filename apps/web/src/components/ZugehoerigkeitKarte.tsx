"use client";

import { useState, useTransition } from "react";
import { rolleSetzen, zahlerSetzen } from "@/app/admin/mitglieder/[id]/aktionen";
import { Personensuche, type Person } from "@/components/Personensuche";

interface Props {
  mitgliedId: string;
  hatLogin: boolean;
  istAdmin: boolean;
  /** Zahlt jemand anderes für dieses Mitglied? */
  zahler: string | null;
  /** Für wen zahlt dieses Mitglied? */
  zahltFuer: { id: string; name: string }[];
  verzeichnis: Person[];
  /** Ist dieses Mitglied der einzige Admin? Dann bleibt die Rolle gesperrt. */
  einzigerAdmin: boolean;
  selbst: boolean;
}

/**
 * Rolle und Zahlerbeziehung.
 *
 * Beides gehört zusammen, weil beides beschreibt, wie dieses Mitglied zum
 * Rest des Vereins steht – und weil beides eine Beziehung ist, die man leicht
 * versehentlich falsch setzt.
 */
export function ZugehoerigkeitKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [rolleOffen, setRolleOffen] = useState(false);
  const [zahlerWahl, setZahlerWahl] = useState<string | null>(props.zahler);

  function rolle(erteilen: boolean) {
    starte(async () => {
      const e = await rolleSetzen(props.mitgliedId, "admin", erteilen);
      setMeldung({ ok: e.ok, text: e.meldung });
      setRolleOffen(false);
    });
  }

  function zahler(id: string | null) {
    setZahlerWahl(id);
    starte(async () => {
      const e = await zahlerSetzen(props.mitgliedId, id);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (!e.ok) setZahlerWahl(props.zahler);
    });
  }

  const rolleGesperrt = props.istAdmin && props.einzigerAdmin;

  return (
    <section className="karte einstellungen" aria-label="Rolle und Zahler">
      <h2 className="dpl">Rolle und Zahler</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="einstellung">
        <span className="titel">Verwaltungsrechte</span>
        <span className="beschreibung">
          Ein Admin sieht und ändert alles: Mitglieder, Beiträge, Serien, Einstellungen und jede
          fremde Buchung. Zwischenstufen gibt es bewusst nicht.
        </span>

        {rolleGesperrt ? (
          <p className="hinweis">
            {props.selbst ? "Du bist" : "Diese Person ist"} derzeit der einzige Administrator. Bitte
            zuerst jemand anderen dazu machen, sonst kann niemand mehr verwalten.
          </p>
        ) : !props.hatLogin && !props.istAdmin ? (
          <p className="hinweis">
            Ohne Login kann niemand Administrator werden. Zuerst einen Zugang einrichten.
          </p>
        ) : props.istAdmin ? (
          rolleOffen ? (
            <div className="detailkopf aktionen" style={{ gap: 8 }}>
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setRolleOffen(false)}>
                Abbrechen
              </button>
              <button className="knopf gefahr klein" disabled={laeuft} onClick={() => rolle(false)}>
                {laeuft ? "Wird entzogen…" : "Wirklich entziehen"}
              </button>
            </div>
          ) : (
            <>
              <span className="marke-klein gold">Administrator</span>{" "}
              <button className="knopf leise klein" disabled={laeuft} onClick={() => setRolleOffen(true)}>
                Rechte entziehen
              </button>
            </>
          )
        ) : (
          <button className="knopf klein" disabled={laeuft} onClick={() => rolle(true)}>
            {laeuft ? "Wird erteilt…" : "Zum Administrator machen"}
          </button>
        )}
      </div>

      <div className="einstellung">
        <span className="titel">Wer bezahlt für dieses Mitglied?</span>
        <span className="beschreibung">
          Leer bedeutet: zahlt selbst. Bei Kindern steht hier der Elternteil – Beiträge und
          Getränke werden dann dort eingezogen.
        </span>

        {props.zahltFuer.length > 0 ? (
          <p className="hinweis">
            Dieses Mitglied zahlt selbst für {props.zahltFuer.map((z) => z.name).join(", ")} und kann
            deshalb keinen eigenen Zahler bekommen.
          </p>
        ) : (
          <Personensuche
            verzeichnis={props.verzeichnis}
            gewaehlt={zahlerWahl}
            onWahl={zahler}
            label="Zahler"
            ausschluss={[props.mitgliedId]}
            disabled={laeuft}
          />
        )}
      </div>
    </section>
  );
}
