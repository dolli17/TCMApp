import { afterEach, describe, expect, it, vi } from "vitest";

const plattform = { OS: "ios" as string };
const alert = vi.fn();
vi.mock("react-native", () => ({ Platform: plattform, Alert: { alert: (...a: unknown[]) => alert(...a) } }));

const { bestaetige } = await import("./rueckfrage");

type Knopf = { text: string; style?: string; onPress?: () => void };

afterEach(() => {
  alert.mockReset();
  vi.unstubAllGlobals();
  plattform.OS = "ios";
});

describe("bestaetige", () => {
  it("fragt nativ mit Abbrechen und der Aktion", () => {
    const aktion = vi.fn();
    bestaetige("Wirklich abmelden?", "", "Abmelden", aktion);

    const [titel, text, knoepfe] = alert.mock.calls[0] as [string, string | undefined, Knopf[]];
    expect(titel).toBe("Wirklich abmelden?");
    expect(text).toBeUndefined();
    expect(knoepfe.map((k) => [k.text, k.style])).toEqual([
      ["Abbrechen", "cancel"],
      ["Abmelden", "destructive"],
    ]);
    expect(aktion).not.toHaveBeenCalled();
    knoepfe[1]!.onPress!();
    expect(aktion).toHaveBeenCalledTimes(1);
  });

  it("kennt eine harmlose Aktion", () => {
    bestaetige("Titel", "Text", "Ja", () => {}, false);
    const knoepfe = alert.mock.calls[0]![2] as Knopf[];
    expect(knoepfe[1]!.style).toBe("default");
  });

  it("fragt im Browser per confirm und tut nur bei Ja etwas", () => {
    plattform.OS = "web";
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("window", { confirm });
    const aktion = vi.fn();

    bestaetige("Wirklich abmelden?", "", "Abmelden", aktion);
    expect(aktion).not.toHaveBeenCalled();
    bestaetige("Titel", "Text", "Ja", aktion);
    expect(aktion).toHaveBeenCalledTimes(1);

    expect(confirm.mock.calls.map((c) => c[0])).toEqual(["Wirklich abmelden?", "Titel\n\nText"]);
    expect(alert).not.toHaveBeenCalled();
  });
});
