import { describe, expect, it, vi } from "vitest";
import { hookProbe } from "@/test/hookprobe";

const probe = hookProbe();
vi.mock("react", () => probe.react);

const { abschnitt, ersterFehler, useLaden } = await import("./laden");

/** Wartet, bis die laufenden Versprechen erledigt sind. */
const ruhe = () => new Promise((r) => setTimeout(r, 0));

describe("useLaden", () => {
  it("laedt beim ersten Zeichnen und zeigt bis dahin den Ladekreis", async () => {
    const laden = vi.fn().mockResolvedValue(["a"]);
    const z = probe.zeichne(() => useLaden(laden));
    expect(z.aktuell).toMatchObject({ daten: null, laedt: true, aktualisiert: false, fehler: null });

    await ruhe();
    expect(z.aktuell).toMatchObject({ daten: ["a"], laedt: false, aktualisiert: false, fehler: null });
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it("laedt beim Neuzeichnen nicht noch einmal, auch mit neuer Ladefunktion", async () => {
    const erste = vi.fn().mockResolvedValue(1);
    const zweite = vi.fn().mockResolvedValue(2);
    let laden = erste;
    const z = probe.zeichne(() => useLaden(() => laden()));
    await ruhe();
    laden = zweite;
    z.aktuell.setzeDaten(5);
    expect(z.aktuell.daten).toBe(5);
    expect(zweite).not.toHaveBeenCalled();

    // Beim Nachladen gilt die neueste Ladefunktion.
    await z.aktuell.erneutHolen();
    expect(zweite).toHaveBeenCalledTimes(1);
    expect(z.aktuell.daten).toBe(2);
  });

  it("behaelt beim Nachladen den Inhalt", async () => {
    let fertig!: (w: number) => void;
    const laden = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => new Promise((r) => (fertig = r)));
    const z = probe.zeichne(() => useLaden(laden));
    await ruhe();

    z.aktuell.neuLaden();
    expect(z.aktuell).toMatchObject({ daten: 1, aktualisiert: true, laedt: false });
    fertig(2);
    await ruhe();
    expect(z.aktuell).toMatchObject({ daten: 2, aktualisiert: false });
  });

  it("zeigt Fehler und behaelt die alten Daten", async () => {
    const laden = vi.fn().mockResolvedValueOnce("alt").mockRejectedValueOnce(new Error("Kein Netz."));
    const z = probe.zeichne(() => useLaden(laden));
    await ruhe();
    await z.aktuell.erneutHolen();
    expect(z.aktuell).toMatchObject({ daten: "alt", fehler: "Kein Netz.", laedt: false, aktualisiert: false });

    laden.mockRejectedValueOnce("kein Error");
    await z.aktuell.erneutHolen();
    expect(z.aktuell.fehler).toBe("Unbekannter Fehler.");

    laden.mockResolvedValueOnce("neu");
    await z.aktuell.erneutHolen();
    expect(z.aktuell).toMatchObject({ daten: "neu", fehler: null });
  });
});

describe("abschnitt", () => {
  it("gibt den Wert eines erfuellten Versprechens", () => {
    expect(abschnitt({ status: "fulfilled", value: [1, 2] })).toEqual({ wert: [1, 2], fehler: null });
  });

  it("gibt die Meldung eines Fehlers", () => {
    expect(abschnitt({ status: "rejected", reason: new Error("Kein Netz.") })).toEqual({
      wert: null,
      fehler: "Kein Netz.",
    });
  });

  it("nimmt fuer alles andere einen allgemeinen Satz", () => {
    expect(abschnitt({ status: "rejected", reason: "kaputt" })).toEqual({
      wert: null,
      fehler: "Konnte nicht geladen werden.",
    });
  });
});

describe("ersterFehler", () => {
  it("nimmt den ersten abgelehnten Eintrag", async () => {
    const ergebnisse = await Promise.allSettled([
      Promise.resolve(1),
      Promise.reject(new Error("Erster.")),
      Promise.reject(new Error("Zweiter.")),
    ]);
    expect(ersterFehler(ergebnisse)).toEqual({ wert: null, fehler: "Erster." });
  });

  it("hat auch ohne Fehler einen Satz", () => {
    expect(ersterFehler([{ status: "fulfilled", value: 1 }])).toEqual({
      wert: null,
      fehler: "Konnte nicht geladen werden.",
    });
  });
});
