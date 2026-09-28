import type { TimelineSegment } from "@tcm/core";

/**
 * Die kleine Zeitleiste eines Platzes: eine Spur von Oeffnung bis Schluss,
 * darauf die Belegungen nach der Statustabelle im Handoff und eine Marke
 * fuer jetzt. Die Lage rechnet @tcm/core (timelineSegments), dieselbe
 * Rechnung wie in der App.
 *
 * Reiner Schmuck - was sie zeigt, steht daneben als Text.
 */
export function MiniZeitleiste({
  segmente,
  markierung,
  gross,
}: {
  segmente: TimelineSegment[];
  markierung?: number;
  /** Die hoehere Leiste der Platzliste, mit ueberstehender Marke */
  gross?: boolean;
}) {
  return (
    <div className={`mini-zeitleiste${gross ? " gross" : ""}`} aria-hidden="true">
      {segmente.map((s, i) => (
        <i key={i} className={s.art} style={{ left: `${s.left}%`, width: `${s.width}%` }} />
      ))}
      {markierung !== undefined && <b style={{ left: `${markierung}%` }} />}
    </div>
  );
}
