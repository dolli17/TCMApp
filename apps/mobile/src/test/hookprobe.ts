/**
 * Hooks ohne Renderer pruefen
 *
 * Die App hat keinen React-Renderer fuer Tests, und fuer ein paar Hooks lohnt
 * keine neue Abhaengigkeit. Dieser Nachbau von useState, useRef, useCallback
 * und useEffect reicht fuer Hooks, die nur diese vier benutzen: Zustand liegt
 * in Faechern nach Aufrufreihenfolge wie bei React, ein Effekt laeuft beim
 * ersten Zeichnen und wieder, wenn sich seine Abhaengigkeiten aendern, und
 * jedes Setzen von Zustand zeichnet neu.
 *
 * Nur fuer Tests: ein Test ersetzt "react" per vi.mock durch probe.react und
 * zeichnet mit probe.zeichne(); jeder Aufruf ist eine eigene Komponente.
 */

type Fach = { wert: unknown; abh?: unknown[] };

interface Komponente {
  faecher: Fach[];
  effekte: (() => void)[];
  i: number;
  zeichnen: () => void;
}

export function hookProbe() {
  let jetzt: Komponente | null = null;

  function fach(start: () => unknown): Fach {
    if (!jetzt) throw new Error("Hook ausserhalb von zeichne()");
    const f = (jetzt.faecher[jetzt.i] ??= { wert: start() });
    jetzt.i++;
    return f;
  }

  function geaendert(alt: unknown[] | undefined, neu: unknown[] | undefined): boolean {
    if (!alt || !neu) return true;
    return alt.length !== neu.length || alt.some((w, n) => !Object.is(w, neu[n]));
  }

  const react = {
    useState<T>(start: T | (() => T)) {
      const k = jetzt!;
      const f = fach(() => (typeof start === "function" ? (start as () => T)() : start));
      const setze = (neu: T | ((alt: T) => T)) => {
        f.wert = typeof neu === "function" ? (neu as (alt: T) => T)(f.wert as T) : neu;
        k.zeichnen();
      };
      return [f.wert as T, setze] as const;
    },
    useRef<T>(start: T) {
      return fach(() => ({ current: start })).wert as { current: T };
    },
    useCallback<T>(fn: T, abh: unknown[]) {
      const f = fach(() => fn);
      if (geaendert(f.abh, abh)) {
        f.wert = fn;
        f.abh = abh;
      }
      return f.wert as T;
    },
    useEffect(fn: () => void, abh?: unknown[]) {
      const f = fach(() => null);
      if (geaendert(f.abh, abh)) {
        f.abh = abh;
        jetzt!.effekte.push(fn);
      }
    },
  };

  /** Eine Komponente, die nur den Hook aufruft. `aktuell` ist das letzte Ergebnis. */
  function zeichne<T>(hook: () => T): { aktuell: T } {
    const halter = { aktuell: undefined as T };
    const k: Komponente = {
      faecher: [],
      effekte: [],
      i: 0,
      zeichnen: () => {
        const vorher = jetzt;
        jetzt = k;
        k.i = 0;
        try {
          halter.aktuell = hook();
        } finally {
          jetzt = vorher;
        }
        for (const e of k.effekte.splice(0)) e();
      },
    };
    k.zeichnen();
    return halter;
  }

  return { react, zeichne };
}
