/**
 * Warum der Knopf daneben gerade nicht geht (U26).
 *
 * Ein gesperrter Knopf ohne Begründung lässt raten, was fehlt. Der Satz steht
 * direkt am Knopf und nennt den nächsten Schritt, etwa „Erst ein Mitglied
 * wählen“. Ohne Grund (null) erscheint nichts – auch nicht, während etwas
 * läuft; dann sagt der Knopf selbst „Wird gespeichert…“.
 */
export function SperrGrund({ grund }: { grund: string | null }) {
  if (!grund) return null;
  return <p className="sperrgrund">{grund}</p>;
}
