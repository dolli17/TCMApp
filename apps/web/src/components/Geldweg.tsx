import type { DebitStep } from "@tcm/core";

/**
 * Der Weg des Geldes in fuenf Schritten: erledigt gruen mit Haekchen,
 * aktuell gelb, offen grau umrandet. Am Telefon senkrecht mit dem Satz
 * darunter, ab 768 px waagerecht (docs/design/clubhaus/verwaltung, Regel 8).
 * Welcher Schritt wo steht, rechnet @tcm/core (debitFlow).
 */
export function Geldweg({ schritte }: { schritte: DebitStep[] }) {
  return (
    <ol className="geldweg">
      {schritte.map((s) => (
        <li key={s.key} className={s.state} aria-current={s.state === "aktuell" ? "step" : undefined}>
          <i aria-hidden="true" />
          <div className="kopf">
            <span className="nr" aria-hidden="true">{s.state === "erledigt" ? "✓" : s.nr}</span>
            <b>{s.name}</b>
            <span className="sr-only">
              {s.state === "erledigt" ? " (erledigt)" : s.state === "aktuell" ? " (jetzt dran)" : " (offen)"}
            </span>
          </div>
          <small>{s.info}</small>
        </li>
      ))}
    </ol>
  );
}
