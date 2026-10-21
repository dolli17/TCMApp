import { describe, expect, it } from "vitest";
import {
  einzugGruppeSchluessel, einzugGruppeTitel, einzugStand, einzugTitel, isoPlusTage, kasseTodos,
  zeitraumText, type EinzugStandInput,
} from "./einzug";

const HEUTE = "2026-10-17";
const stand = (e: Partial<EinzugStandInput> = {}) =>
  einzugStand({ status: "draft", collectionDate: "2026-11-03", itemCount: 45, returned: 0, today: HEUTE, ...e });

describe("Datum und Zeitraum", () => {
  it("rechnet Tage ohne Zeitzone, auch ueber den Jahreswechsel", () => {
    expect(isoPlusTage("2026-12-20", 14)).toBe("2027-01-03");
    expect(isoPlusTage("2026-11-03", 56)).toBe("2026-12-29");
  });

  it("schreibt Monate aus und laesst Jahre stehen", () => {
    expect(zeitraumText("2026-09")).toBe("September 2026");
    expect(zeitraumText("2027")).toBe("2027");
    expect(zeitraumText(null)).toBeNull();
  });
});

describe("einzugGruppeTitel", () => {
  it("nennt Art und Zeitraum so, wie man sie spricht", () => {
    expect(einzugGruppeTitel({ kind: "fee", period_label: "2027", ruecklaeufer: false })).toBe("Jahresbeiträge 2027");
    expect(einzugGruppeTitel({ kind: "drinks", period_label: "2026-09", ruecklaeufer: false })).toBe("Getränke September 2026");
    expect(einzugGruppeTitel({ kind: "guest", period_label: null, ruecklaeufer: false })).toBe("Gastgebühren");
    expect(einzugGruppeTitel({ kind: "fee", period_label: "2026", ruecklaeufer: true })).toBe("Rückläufer · Beitrag 2026");
  });

  it("ein Einzug aus einer Gruppe heisst wie sie, sonst nach dem Tag", () => {
    const g = { kind: "drinks" as const, period_label: "2026-09", ruecklaeufer: false };
    expect(einzugTitel([g], "2026-11-03")).toBe("Getränke September 2026");
    expect(einzugTitel([g, { ...g, kind: "guest", period_label: null }], "2026-11-03")).toBe("Einzug 03.11.2026");
  });

  it("der Schluessel unterscheidet Rückläufer und fehlenden Zeitraum", () => {
    expect(einzugGruppeSchluessel({ kind: "fee", period_label: null, ruecklaeufer: true })).toBe("fee||r");
  });
});

describe("einzugStand", () => {
  it("angekuendigt: die Datei ist sofort dran, ohne auf die Frist zu warten", () => {
    const s = stand({ announcedOn: "2026-10-17" });
    expect(s.label).toBe("Angekündigt");
    expect(s.ton).toBe("gelb");
    expect(s.schritte.map((x) => x.state)).toEqual(["erledigt", "aktuell", "offen", "offen"]);
    expect(s.schritte[0]!.info).toBe("17.10.2026 · Abbuchung 03.11.2026");
    expect(s.schritte[1]!.info).toBe("jetzt möglich");
    expect(s.naechster!.titel).toBe("Bankdatei erzeugen und im Onlinebanking einreichen");
    expect(s.naechster!.text).toContain("03.11.2026");
  });

  it("Datei erzeugt, eingereicht, abgeschlossen", () => {
    expect(stand({ status: "generated" }).naechster!.titel).toBe("Im Onlinebanking einreichen");
    const eingereicht = stand({ status: "submitted" });
    expect(eingereicht.label).toBe("Eingereicht");
    expect(eingereicht.ton).toBe("blau");
    expect(eingereicht.ruecklaeuferBis).toBe("2026-12-29");
    expect(eingereicht.abschliessbarAb).toBe("2026-12-30");
    expect(eingereicht.naechster!.titel).toBe("Rückläufer eintragen, wenn welche kommen");
    expect(eingereicht.naechster!.text).toContain("ab dem 30.12.2026");
    expect(stand({ status: "submitted", today: "2026-12-29" }).naechster!.titel).toBe("Rückläufer eintragen, wenn welche kommen");
    expect(stand({ status: "submitted", today: "2026-12-30" }).naechster!.titel).toBe("Einzug abschließen");
    const fertig = stand({ status: "completed", returned: 2 });
    expect(fertig.label).toBe("Abgeschlossen");
    expect(fertig.naechster).toBeNull();
    expect(fertig.schritte.every((x) => x.state === "erledigt")).toBe(true);
    expect(fertig.schritte[3]!.info).toBe("2 Rückläufer");
  });

  it("ein leerer Entwurf ist nichts Angekuendigtes", () => {
    const s = stand({ itemCount: 0 });
    expect(s.label).toBe("Leer");
    expect(s.ton).toBe("grau");
    expect(s.schritte[0]!.state).toBe("aktuell");
  });
});

describe("kasseTodos", () => {
  const leer = { today: HEUTE, gruppen: [], einzuege: [], getraenkemonate: [] };

  it("ohne offene Punkte ist die Liste leer", () => {
    expect(kasseTodos(leer)).toEqual([]);
  });

  it("laufende Einzuege zuerst, dann Rückläufer, dann was noch einzuziehen ist, dann Getraenke", () => {
    const t = kasseTodos({
      ...leer,
      einzuege: [{ id: "e1", title: "Getränke September 2026", status: "draft", item_count: 45, collection_date: "2026-11-03" }],
      gruppen: [
        { kind: "fee", period_label: "2027", ruecklaeufer: false, anzahl: 214, mitglieder: 198, summe_cents: 3842000 },
        { kind: "fee", period_label: "2026", ruecklaeufer: true, anzahl: 3, mitglieder: 3, summe_cents: 18600 },
      ],
      getraenkemonate: [{ year: 2026, month: 10, status: "open" }, { year: 2026, month: 9, status: "open" }],
    });
    expect(t.map((x) => x.title)).toEqual([
      "Getränke September 2026 · Bankdatei erzeugen",
      "Rückläufer · Beitrag 2026 · 3 Lastschriften zurückgebucht",
      "Jahresbeiträge 2027 · noch nicht eingezogen",
      "Getränkemonat September abschließen",
    ]);
    expect(t[0]!).toMatchObject({ urgent: true, href: "/admin/kasse/lastschriften/e1" });
    expect(t[2]!.href).toBe("/admin/kasse/einzug?gruppe=fee%7C2027%7C");
  });

  it("ein eingereichter Einzug meldet sich erst nach acht Wochen", () => {
    const e = { id: "e2", title: "Beiträge", status: "submitted" as const, item_count: 5, collection_date: "2026-09-01" };
    expect(kasseTodos({ ...leer, einzuege: [e] })).toEqual([]);
    expect(kasseTodos({ ...leer, today: "2026-11-01", einzuege: [e] }).map((x) => x.title)).toEqual(["Beiträge · abschließen"]);
  });
});
