import { describe, expect, it } from "vitest";
import { pushMeldung, pushZiel, type PushPosten } from "./pushvorlage";

const nachgerueckt: PushPosten = {
  kind: "event_promoted",
  title: "Du bist nachgerueckt",
  body: "Fuer Sommerfest am 06.11.2026, 19:00 Uhr ist ein Platz frei geworden - du bist jetzt angemeldet.",
  event_id: "e1",
};
const buchung: PushPosten = { kind: "booking_added", title: "Du bist als Mitspieler eingetragen", body: "…" };

describe("pushMeldung", () => {
  it("eine Nachricht: ihr eigener Titel und Text, Tippen öffnet die Veranstaltung", () => {
    expect(pushMeldung([nachgerueckt])).toEqual({
      titel: "Du bist nachgerueckt",
      text: nachgerueckt.body,
      ziel: "/verein/veranstaltung/e1",
    });
  });

  it("mehrere Buchungen: wie bisher", () => {
    const m = pushMeldung([buchung, { ...buchung, title: "Jemand spielt mit", kind: "player_joined" }]);
    expect(m.titel).toBe("2 Änderungen an deinen Buchungen");
    expect(m.text).toBe("Du bist als Mitspieler eingetragen · Jemand spielt mit");
    expect(m.ziel).toBe("/nachrichten");
  });

  it("mehrere zur selben Veranstaltung: Sammeltitel, Ziel bleibt die Veranstaltung", () => {
    const m = pushMeldung([nachgerueckt, { ...nachgerueckt, kind: "event_changed", title: "Geaendert: Sommerfest" }]);
    expect(m.titel).toBe("2 Neuigkeiten zu Veranstaltungen");
    expect(m.ziel).toBe("/verein/veranstaltung/e1");
  });

  it("gemischt: kein Buchungstitel mehr", () => {
    expect(pushMeldung([nachgerueckt, buchung]).titel).toBe("2 Neuigkeiten vom TC Muckensturm");
  });
});

describe("pushZiel", () => {
  it("verschiedene Veranstaltungen oder ohne: die Nachrichten", () => {
    expect(pushZiel([nachgerueckt, { ...nachgerueckt, event_id: "e2" }])).toBe("/nachrichten");
    expect(pushZiel([buchung])).toBe("/nachrichten");
    expect(pushZiel([])).toBe("/nachrichten");
  });
});
