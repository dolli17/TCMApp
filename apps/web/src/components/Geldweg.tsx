/** Ein Stand, wie ihn einzugStand liefert. */
export interface GeldwegSchritt {
  key: string;
  name: string;
  info: string;
  state: "erledigt" | "aktuell" | "offen";
}

/**
 * Der Weg des Geldes durch die Staende eines Einzugs: erledigt gruen mit Haekchen,
 * aktuell gelb, offen grau umrandet. Am Telefon senkrecht mit dem Satz
 * darunter, ab 768 px waagerecht (docs/design/clubhaus/verwaltung, Regel 8).
 * Welcher Stand erreicht ist, rechnet @tcm/core (einzugStand).
 */
export function Geldweg({ schritte }: { schritte: readonly GeldwegSchritt[] }) {
  return (
    <ol className={`geldweg${schritte.length === 4 ? " vier" : ""}`}>
      {schritte.map((s, i) => (
        <li key={s.key} className={s.state} aria-current={s.state === "aktuell" ? "step" : undefined}>
          <i aria-hidden="true" />
          <div className="kopf">
            <span className="nr" aria-hidden="true">{s.state === "erledigt" ? "✓" : i + 1}</span>
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
