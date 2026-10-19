import { describe, expect, it } from "vitest";
import {
  eventAbmeldbar, eventAbmeldenKnopf, eventAenderbar, eventAnmeldbar, eventAnmeldenKnopf, eventBelegungAnteil,
  eventBelegungText, eventDemnaechst, eventFrei, eventGebuehrHinweis, eventKartenZeile, eventKartenZeit,
  eventLangeZeit, eventMeineMarke, eventMonatsGruppen, eventNurWarteliste, eventPersonenText, eventWartelisteText,
  type MitgliedEvent,
} from "./veranstaltungen-mitglieder";
import { formatCents } from "./money";

const fest: MitgliedEvent = {
  id: "fest",
  kind: "fest",
  title: "Saisonabschlussfest",
  description: null,
  location: "Clubhaus",
  status: "published",
  starts_at: "2026-11-06T18:00:00.000Z", // Fr 19 Uhr in Berlin
  ends_at: "2026-11-06T22:30:00.000Z",
  registration_enabled: true,
  registration_deadline: "2026-10-30T22:59:00.000Z",
  max_participants: 80,
  companions_allowed: true,
  fee_cents: 1800,
  work_hours: null,
  personen: 62,
  warteliste: 0,
  mein_status: null,
  meine_begleitpersonen: null,
  meine_bemerkung: null,
};

const dienst: MitgliedEvent = {
  ...fest,
  id: "dienst",
  kind: "arbeitsdienst",
  title: "Frühjahrsputz",
  location: "Anlage",
  starts_at: "2026-11-14T08:00:00.000Z", // Sa 9 Uhr
  ends_at: "2026-11-14T12:00:00.000Z",
  max_participants: 25,
  fee_cents: null,
  work_hours: 3,
  personen: 14,
};

const vorher = new Date("2026-10-20T10:00:00Z");
const nachSchluss = new Date("2026-11-02T10:00:00Z");
const danach = new Date("2026-11-08T10:00:00Z");
const euro = (c: number) => formatCents(c);

describe("Liste nach Monat", () => {
  const dezember: MitgliedEvent = { ...fest, id: "dez", starts_at: "2026-12-11T18:00:00.000Z", ends_at: null };
  const oktober: MitgliedEvent = { ...fest, id: "okt", starts_at: "2026-10-10T16:00:00.000Z", ends_at: null };

  it("gruppiert Kommendes der Reihe nach", () => {
    const g = eventMonatsGruppen([dezember, dienst, fest, oktober], vorher);
    expect(g.map((x) => x.titel)).toEqual(["November 2026", "Dezember 2026"]);
    expect(g[0]!.events.map((e) => e.id)).toEqual(["fest", "dienst"]);
  });

  it("zeigt Vergangenes neueste zuerst", () => {
    const g = eventMonatsGruppen([oktober, fest, dienst], danach, true);
    expect(g.map((x) => x.titel)).toEqual(["November 2026", "Oktober 2026"]);
    expect(g[0]!.events.map((e) => e.id)).toEqual(["fest"]);
  });

  it("die Startseite nimmt die naechsten zwei, ohne Abgesagtes", () => {
    const abgesagt: MitgliedEvent = { ...fest, id: "weg", status: "cancelled", starts_at: "2026-10-25T10:00:00Z" };
    expect(eventDemnaechst([dezember, abgesagt, dienst, fest], vorher).map((e) => e.id)).toEqual(["fest", "dienst"]);
  });
});

describe("Kartentexte", () => {
  it("Zeit und Ort kurz", () => {
    expect(eventKartenZeit(fest)).toBe("Fr 19–23:30 Uhr · Clubhaus");
    expect(eventKartenZeit({ ...fest, ends_at: null, location: null })).toBe("Fr 19 Uhr");
  });

  it("Preis und freie Plaetze", () => {
    expect(eventKartenZeile(fest, vorher)).toBe(`${euro(1800)} p. P. · noch 18 Plätze frei`);
    expect(eventKartenZeile({ ...fest, personen: 79 }, vorher)).toBe(`${euro(1800)} p. P. · noch 1 Platz frei`);
    expect(eventKartenZeile({ ...fest, personen: 80 }, vorher)).toBe(`${euro(1800)} p. P. · ausgebucht · Warteliste`);
  });

  it("ohne Platzgrenze der Anmeldeschluss", () => {
    expect(eventKartenZeile({ ...fest, max_participants: null }, vorher))
      .toBe(`${euro(1800)} p. P. · Anmeldung bis 30.10.`);
    expect(eventKartenZeile({ ...fest, max_participants: null, registration_deadline: null }, vorher))
      .toBe(`${euro(1800)} p. P. · Anmeldung offen`);
  });

  it("Arbeitsdienst mit Stunden, ohne Anmeldung, geschlossen, abgesagt", () => {
    expect(eventKartenZeile(dienst, vorher)).toBe("3 Std. Arbeitsdienst · 14 von 25 Plätzen");
    expect(eventKartenZeile({ ...fest, registration_enabled: false, fee_cents: null }, vorher)).toBe("Ohne Anmeldung");
    expect(eventKartenZeile(fest, nachSchluss)).toBe(`${euro(1800)} p. P. · Anmeldung geschlossen`);
    expect(eventKartenZeile({ ...fest, status: "cancelled" }, vorher)).toBe("Abgesagt");
  });

  it("die eigene Marke", () => {
    expect(eventMeineMarke(fest, vorher)).toBeNull();
    expect(eventMeineMarke(fest, vorher, true)).toEqual({ text: "Anmelden", ton: "gelb" });
    expect(eventMeineMarke(fest, nachSchluss, true)).toBeNull();
    expect(eventMeineMarke({ ...fest, mein_status: "registered", meine_begleitpersonen: 1 }, vorher))
      .toEqual({ text: "Angemeldet · 2", ton: "gruen" });
    expect(eventMeineMarke({ ...fest, mein_status: "registered", meine_begleitpersonen: 0 }, vorher)!.text)
      .toBe("Angemeldet");
    expect(eventMeineMarke({ ...fest, mein_status: "waitlisted" }, vorher)!.text).toBe("Warteliste");
    expect(eventMeineMarke({ ...fest, mein_status: "cancelled" }, vorher, true)!.text).toBe("Anmelden");
  });
});

describe("Detail", () => {
  const angemeldet: MitgliedEvent = { ...fest, mein_status: "registered", meine_begleitpersonen: 1 };

  it("lange Zeit", () => {
    expect(eventLangeZeit(fest.starts_at, fest.ends_at)).toBe("Freitag, 6. November · 19–23:30 Uhr");
  });

  it("Belegung nur als Zahl", () => {
    expect(eventFrei(fest)).toBe(18);
    expect(eventBelegungText(fest)).toBe("62 angemeldet · noch 18 frei");
    expect(eventBelegungText({ ...fest, personen: 80, warteliste: 3 })).toBe("80 angemeldet · ausgebucht · 3 auf der Warteliste");
    expect(eventBelegungText({ ...fest, max_participants: null })).toBe("62 angemeldet");
    expect(eventBelegungAnteil(fest)).toBeCloseTo(0.775);
    expect(eventBelegungAnteil({ ...fest, max_participants: null })).toBeNull();
  });

  it("was geht wann", () => {
    expect(eventAnmeldbar(fest, vorher)).toBe(true);
    expect(eventAnmeldbar(fest, nachSchluss)).toBe(false);
    expect(eventAnmeldbar(angemeldet, vorher)).toBe(false);
    expect(eventAnmeldbar({ ...fest, mein_status: "cancelled" }, vorher)).toBe(true);
    expect(eventAenderbar(angemeldet, vorher)).toBe(true);
    expect(eventAenderbar(angemeldet, nachSchluss)).toBe(false);
    expect(eventAbmeldbar(angemeldet, nachSchluss)).toBe(true);
    expect(eventAbmeldbar(angemeldet, danach)).toBe(false);
    expect(eventAbmeldbar({ ...angemeldet, status: "cancelled" }, vorher)).toBe(false);
  });

  it("Knoepfe mit Betrag", () => {
    expect(eventPersonenText(0)).toBe("Du allein");
    expect(eventPersonenText(1)).toBe("Du + 1 Begleitperson");
    expect(eventPersonenText(2)).toBe("Du + 2 Begleitpersonen");
    expect(eventAnmeldenKnopf(fest, 1)).toBe(`Verbindlich anmelden · ${euro(3600)}`);
    expect(eventAnmeldenKnopf(dienst, 0)).toBe("Anmelden");
    expect(eventNurWarteliste({ ...fest, personen: 79 }, 1)).toBe(true);
    expect(eventAnmeldenKnopf({ ...fest, personen: 79 }, 1)).toBe("Auf die Warteliste");
    expect(eventAbmeldenKnopf(angemeldet, vorher)).toBe("Abmelden (bis 30.10. kostenlos)");
    expect(eventAbmeldenKnopf(angemeldet, nachSchluss)).toBe("Abmelden (Gebühr bleibt)");
    expect(eventAbmeldenKnopf({ ...angemeldet, mein_status: "waitlisted" }, nachSchluss)).toBe("Abmelden");
  });

  it("Hinweis zur Gebuehr und Warteliste", () => {
    const h = eventGebuehrHinweis(fest)!;
    expect(h).toContain("auch für jede Begleitperson");
    expect(h).toContain("„Offen“");
    expect(h).toContain("30.10.");
    expect(h).toContain("danach kostet die Abmeldung trotzdem");
    expect(eventGebuehrHinweis(dienst)).toBeNull();
    expect(eventWartelisteText(2, 3)).toMatch(/^Platz 2 von 3 auf der Warteliste/);
    expect(eventWartelisteText(null, 0)).toMatch(/^Du stehst auf der Warteliste/);
  });
});
