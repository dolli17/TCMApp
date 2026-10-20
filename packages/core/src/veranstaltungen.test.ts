import { describe, expect, it } from "vitest";
import {
  berlinLokalZuIso, centsZuPreisText, eventFormularPruefen, eventGebuehrCents, eventPlaetzeText,
  eventReiter, eventSchritte, eventStatusMarke, eventTagKurz, eventTodos, eventZeitText, isoZuBerlinLokal,
  csvFeld, teilnehmerCsv, type EventFormular, type EventInfo, type EventZahlen,
} from "./veranstaltungen";
import { formatCents } from "./money";
import { einzugGruppeAuswahl, einzugGruppeSchluessel, einzugGruppeTitel } from "./einzug";

const fest: EventInfo = {
  kind: "fest",
  status: "published",
  starts_at: "2026-11-06T18:00:00.000Z", // 19 Uhr in Berlin
  ends_at: "2026-11-06T22:30:00.000Z",
  registration_enabled: true,
  registration_deadline: "2026-10-30T22:59:00.000Z",
  max_participants: 80,
  fee_cents: 1800,
  work_hours: null,
};

const null_zahlen: EventZahlen = {
  anmeldungen: 0, personen: 0, warteliste: 0, forderungen: 0, forderungen_cents: 0,
  im_einzug: 0, einziehbar: 0, einziehbar_cents: 0, anwesend: 0, gutgeschrieben: 0,
};

const vorher = new Date("2026-10-20T10:00:00Z");
const nachSchluss = new Date("2026-11-02T10:00:00Z");
const danach = new Date("2026-11-08T10:00:00Z");

describe("Gebuehr", () => {
  it("gilt pro Person, Begleitpersonen eingerechnet", () => {
    expect(eventGebuehrCents(1800, 2)).toBe(5400);
    expect(eventGebuehrCents(1800, 0)).toBe(1800);
    expect(eventGebuehrCents(null, 3)).toBe(0);
  });
});

describe("Reiter und Marke", () => {
  it("ordnet nach Status und Datum", () => {
    expect(eventReiter({ ...fest, status: "draft" }, danach)).toBe("entwuerfe");
    expect(eventReiter(fest, vorher)).toBe("kommend");
    expect(eventReiter(fest, danach)).toBe("vergangen");
    expect(eventReiter({ ...fest, status: "cancelled" }, vorher)).toBe("kommend");
  });

  it("zeigt den Stand der Anmeldung", () => {
    expect(eventStatusMarke(fest, vorher).text).toBe("Anmeldung offen");
    expect(eventStatusMarke(fest, nachSchluss).text).toBe("Anmeldung geschlossen");
    expect(eventStatusMarke(fest, danach).text).toBe("Abgeschlossen");
    expect(eventStatusMarke({ ...fest, status: "cancelled" }, vorher).text).toBe("Abgesagt");
    expect(eventStatusMarke({ ...fest, registration_enabled: false, registration_deadline: null }, vorher).text)
      .toBe("Veröffentlicht");
  });

  it("nimmt ohne Anmeldeschluss den Beginn", () => {
    const ohne = { ...fest, registration_deadline: null };
    expect(eventStatusMarke(ohne, nachSchluss).text).toBe("Anmeldung offen");
    expect(eventStatusMarke(ohne, new Date("2026-11-06T18:30:00Z")).text).toBe("Läuft");
  });
});

describe("Texte", () => {
  it("schreibt Zeit und Plaetze deutsch", () => {
    expect(eventZeitText(fest.starts_at, fest.ends_at)).toBe("Fr 06.11.2026 · 19–23:30 Uhr");
    expect(eventZeitText(fest.starts_at, null)).toBe("Fr 06.11.2026 · 19 Uhr");
    expect(eventTagKurz(fest.starts_at)).toBe("06.11.");
    expect(eventPlaetzeText(62, 80)).toBe("62 von 80");
    expect(eventPlaetzeText(1, null)).toBe("1 Person");
  });
});

describe("Staende", () => {
  const e = { ...fest, created_at: "2026-10-01T10:00:00Z", published_at: "2026-10-02T10:00:00Z" };

  it("steht vor dem Schluss beim Anmeldeschluss", () => {
    const s = eventSchritte(e, null_zahlen, vorher);
    expect(s.map((x) => x.key)).toEqual(["angelegt", "veroeffentlicht", "schluss", "einziehen"]);
    expect(s.map((x) => x.state)).toEqual(["erledigt", "erledigt", "aktuell", "offen"]);
  });

  it("ist fertig, wenn alles im Einzug steckt", () => {
    const s = eventSchritte(e, { ...null_zahlen, forderungen: 3, im_einzug: 3 }, nachSchluss);
    expect(s.at(-1)?.state).toBe("erledigt");
  });

  it("hat beim Arbeitsdienst die Stunden als letzten Stand", () => {
    const dienst = { ...e, kind: "arbeitsdienst" as const, fee_cents: null, work_hours: 3 };
    const s = eventSchritte(dienst, { ...null_zahlen, anwesend: 2, gutgeschrieben: 1 }, danach);
    expect(s.at(-1)).toMatchObject({ key: "stunden", state: "aktuell" });
  });
});

describe("Zu tun", () => {
  it("meldet Einzug und offene Stunden", () => {
    const todos = eventTodos([
      { ...fest, ...null_zahlen, id: "a", title: "Oktoberfest", einziehbar: 38, einziehbar_cents: 71400 },
      {
        ...fest, ...null_zahlen, id: "b", title: "Clubhaus streichen", kind: "arbeitsdienst",
        fee_cents: null, work_hours: 4, anmeldungen: 11,
      },
      { ...fest, ...null_zahlen, id: "c", title: "Entwurf", status: "draft", einziehbar: 1 },
    ], danach);
    expect(todos.map((t) => t.key)).toEqual(["einziehen-a", "abhaken-b"]);
    expect(todos[0]!.text).toContain(`38 Forderungen über ${formatCents(71400)}`);
  });
});

describe("Formular", () => {
  const leer: EventFormular = {
    kind: "fest", title: "Saisonabschlussfest", description: "", location: "Clubhaus",
    start: "2026-11-06T19:00", ende: "2026-11-06T23:30", anmeldung: true,
    schluss: "2026-10-30T23:59", plaetze: "80", begleitung: true, gebuehr: true, preis: "18,00 €", stunden: "",
  };

  it("rechnet Berliner Zeit in UTC", () => {
    expect(berlinLokalZuIso("2026-11-06T19:00")).toBe("2026-11-06T18:00:00.000Z");
    expect(berlinLokalZuIso("2026-07-01T19:00")).toBe("2026-07-01T17:00:00.000Z");
    expect(isoZuBerlinLokal("2026-11-06T18:00:00.000Z")).toBe("2026-11-06T19:00");
  });

  it("uebersetzt ein gueltiges Formular", () => {
    const r = eventFormularPruefen(leer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.daten).toMatchObject({
      feeCents: 1800, maxParticipants: 80, companionsAllowed: true,
      startsAt: "2026-11-06T18:00:00.000Z", workHours: null, description: null,
    });
  });

  it("weist Unstimmiges ab", () => {
    expect(eventFormularPruefen({ ...leer, title: " " }).ok).toBe(false);
    expect(eventFormularPruefen({ ...leer, ende: "2026-11-06T18:00" }).ok).toBe(false);
    expect(eventFormularPruefen({ ...leer, schluss: "2026-11-07T10:00" }).ok).toBe(false);
    expect(eventFormularPruefen({ ...leer, plaetze: "0" }).ok).toBe(false);
    expect(eventFormularPruefen({ ...leer, preis: "abc" }).ok).toBe(false);
  });

  it("nimmt Gebuehr und Plaetze nur mit Anmeldung, Stunden nur beim Arbeitsdienst", () => {
    const ohne = eventFormularPruefen({ ...leer, anmeldung: false, stunden: "3" });
    expect(ohne.ok && ohne.daten).toMatchObject({
      feeCents: null, maxParticipants: null, companionsAllowed: false, workHours: null,
    });
    const dienst = eventFormularPruefen({ ...leer, kind: "arbeitsdienst", gebuehr: false, stunden: "2,5" });
    expect(dienst.ok && dienst.daten.workHours).toBe(2.5);
    expect(centsZuPreisText(1850)).toBe("18,50");
  });
});

describe("Export", () => {
  it("schreibt CSV fuer Excel", () => {
    const csv = teilnehmerCsv([{
      member_name: "Bauer, Nadine", companions: 2, note: "1× vegetarisch; bitte", status: "registered",
      attended: true, registered_at: "2026-10-02T10:00:00Z", cancelled_at: null, charge_cents: 5400,
    }]);
    expect(csv.startsWith("﻿Mitglied;Personen")).toBe(true);
    expect(csv).toContain('Bauer, Nadine;3;2;angemeldet;"1× vegetarisch; bitte";02.10.2026;;ja;54,00');
  });

  it("entschärft Werte, die Excel als Formel liest", () => {
    expect(csvFeld("=HYPERLINK(\"http://boese.example\")")).toBe(`"'=HYPERLINK(""http://boese.example"")"`);
    expect(csvFeld("+49 170")).toBe("'+49 170");
    expect(csvFeld("-1+1")).toBe("'-1+1");
    expect(csvFeld("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvFeld("\t=1")).toBe("'\t=1");
    expect(csvFeld("\r=1")).toBe(`"'\r=1"`);
    expect(csvFeld("Bauer, Nadine")).toBe("Bauer, Nadine");
    expect(csvFeld("a=b")).toBe("a=b");
    expect(csvFeld("")).toBe("");
  });

  it("entschärft Bemerkung und Name auch in der ganzen Liste", () => {
    const csv = teilnehmerCsv([{
      member_name: "=1+1", companions: 0, note: "@cmd", status: "registered",
      attended: false, registered_at: "2026-10-02T10:00:00Z", cancelled_at: null, charge_cents: null,
    }]);
    expect(csv).toContain("'=1+1;1;0;angemeldet;'@cmd;02.10.2026;;;");
  });
});

describe("Einzug-Gruppe einer Veranstaltung", () => {
  const g = { kind: "event" as const, period_label: null, ruecklaeufer: false, event_id: "e1", titel: "Saisonabschlussfest" };

  it("heisst wie die Veranstaltung", () => {
    expect(einzugGruppeTitel(g)).toBe("Saisonabschlussfest");
    expect(einzugGruppeTitel({ ...g, ruecklaeufer: true })).toBe("Rückläufer · Saisonabschlussfest");
    expect(einzugGruppeTitel({ ...g, titel: null })).toBe("Veranstaltung");
  });

  it("hat einen eigenen Schluessel je Veranstaltung, alte Schluessel bleiben", () => {
    expect(einzugGruppeSchluessel(g)).toBe("event|||e1");
    expect(einzugGruppeSchluessel({ kind: "fee", period_label: "2027", ruecklaeufer: false })).toBe("fee|2027|");
    expect(einzugGruppeAuswahl(g)).toEqual({ kind: "event", period: null, returned: false, event: "e1" });
  });
});
