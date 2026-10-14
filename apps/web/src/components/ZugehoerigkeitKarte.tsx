"use client";

import { useState, useTransition } from "react";
import { ROLLEN, hatVolleRechte, type AppRole, type RollenInfo } from "@tcm/core";
import { rolleSetzen, trainerSetzen } from "@/app/admin/mitglieder/[id]/aktionen";

interface Props {
  mitgliedId: string;
  hatLogin: boolean;
  /** Rollen aus member_roles */
  rollen: string[];
  istTrainer: boolean;
  /** Mannschaft und ob dieses Mitglied dort Mannschaftsführer ist */
  mannschaft: { name: string; kapitaen: boolean } | null;
  /** Hat außer diesem Mitglied niemand volle Rechte? Dann bleibt die letzte Rolle gesperrt. */
  einzigeVolleRechte: boolean;
  selbst: boolean;
}

/**
 * Rollen.
 *
 * Alle Rollen stehen an einer Stelle, auch wenn sie unterschiedlich
 * gespeichert sind: Vorstand, App Admin und Platzwart in member_roles,
 * Trainer am Mitglied, der Mannschaftsführer an der Mannschaft (Karte darunter).
 */
export function ZugehoerigkeitKarte(props: Props) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [entziehenOffen, setEntziehenOffen] = useState<AppRole | null>(null);
  // Die Schalter springen sofort um und gehen bei einem Fehler zurück.
  const [rollen, setRollen] = useState<string[]>(props.rollen);
  const [istTrainer, setIstTrainer] = useState(props.istTrainer);

  function rolle(r: AppRole, erteilen: boolean) {
    const vorher = rollen;
    setRollen(erteilen ? [...vorher, r] : vorher.filter((x) => x !== r));
    starte(async () => {
      const e = await rolleSetzen(props.mitgliedId, r, erteilen);
      setMeldung({ ok: e.ok, text: e.meldung });
      setEntziehenOffen(null);
      if (!e.ok) setRollen(vorher);
    });
  }

  function trainer(ja: boolean) {
    setIstTrainer(ja);
    starte(async () => {
      const e = await trainerSetzen(props.mitgliedId, ja);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (!e.ok) setIstTrainer(!ja);
    });
  }

  // Die letzte Rolle mit vollen Rechten im Verein bleibt gesperrt. Wer
  // Vorstand und App Admin zugleich ist, darf eine davon abgeben.
  const volleRollen = rollen.filter((r) => hatVolleRechte([r]));
  const gesperrt = (r: RollenInfo) =>
    r.vollRechte && props.einzigeVolleRechte && volleRollen.length === 1 && volleRollen[0] === r.rolle;

  function rollenZeile(r: RollenInfo) {
    const hat = rollen.includes(r.rolle);
    const ohneLogin = r.brauchtLogin && !props.hatLogin && !hat;
    const sperre = gesperrt(r);

    return (
      <div className="einstellung" key={r.rolle}>
        <span className="titel">{r.label}</span>
        <span className="beschreibung">
          {sperre
            ? `${props.selbst ? "Du hast" : "Diese Person hat"} als einzige volle Rechte. Bitte zuerst jemand anderen zum Vorstand oder App Admin machen.`
            : ohneLogin
              ? "Braucht einen Login. Zuerst einen Zugang einrichten."
              : r.beschreibung}
        </span>
        {entziehenOffen === r.rolle ? (
          <span className="detailkopf aktionen" style={{ gap: 8 }}>
            <button className="knopf leise klein" disabled={laeuft} onClick={() => setEntziehenOffen(null)}>
              Abbrechen
            </button>
            <button className="knopf gefahr klein" disabled={laeuft} onClick={() => rolle(r.rolle, false)}>
              {laeuft ? "Wird entzogen…" : "Wirklich entziehen"}
            </button>
          </span>
        ) : (
          <input
            type="checkbox"
            className="schalter-feld"
            aria-label={r.label}
            checked={hat}
            disabled={laeuft || sperre || ohneLogin}
            onChange={(e) => {
              // Volle Rechte zu entziehen sperrt womöglich jemanden aus,
              // deshalb mit Rückfrage. Alles andere geht sofort.
              if (!e.target.checked && r.vollRechte) setEntziehenOffen(r.rolle);
              else rolle(r.rolle, e.target.checked);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <section className="karte einstellungen" aria-label="Rollen">
      <h2 className="dpl">Rollen</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="einstellung">
        <span className="titel">Spieler</span>
        <span className="beschreibung">
          Jedes Mitglied ist Spieler: bucht Plätze und sieht seine eigenen Daten. Die Rollen darunter
          kommen dazu.
        </span>
      </div>

      {ROLLEN.map(rollenZeile)}

      <div className="einstellung">
        <span className="titel">Trainer</span>
        <span className="beschreibung">Gibt Training. Eigene Rechte folgen.</span>
        <input
          type="checkbox"
          className="schalter-feld"
          aria-label="Trainer"
          checked={istTrainer}
          disabled={laeuft}
          onChange={(e) => trainer(e.target.checked)}
        />
      </div>

      <div className="einstellung">
        <span className="titel">Mannschaftsführer</span>
        <span className="beschreibung">
          {props.mannschaft?.kapitaen
            ? `Mannschaftsführer von ${props.mannschaft.name}. Gesetzt wird das in der Karte Mannschaft.`
            : "Gehört zu einer Mannschaft und wird in der Karte Mannschaft gesetzt, höchstens einer je Mannschaft."}
        </span>
        {props.mannschaft?.kapitaen && <span className="marke-klein gold">{props.mannschaft.name}</span>}
      </div>

    </section>
  );
}
