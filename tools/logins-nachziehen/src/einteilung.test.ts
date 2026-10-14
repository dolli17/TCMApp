import { describe, expect, it } from "vitest";
import {
  gruppiere,
  normalisiereEmail,
  teileEin,
  type AuthKonto,
  type MitgliedOhneLogin,
  type Verknuepfung,
} from "./einteilung";

function mitglied(teil: Partial<MitgliedOhneLogin> & { id: string }): MitgliedOhneLogin {
  return { name: `Person ${teil.id}`, email: null, istTestadresse: false, ...teil };
}

describe("teileEin", () => {
  it("lädt echte Adressen ohne Konto ein", () => {
    const [m] = teileEin([mitglied({ id: "a", email: "anna@web.de" })], [], []);
    expect(m).toMatchObject({ art: "einladen", email: "anna@web.de" });
  });

  it("legt für Testadressen still ein Konto an", () => {
    const [m] = teileEin(
      [mitglied({ id: "a", email: "anna.berg12@example.org", istTestadresse: true })],
      [],
      [],
    );
    expect(m).toMatchObject({ art: "still_anlegen", email: "anna.berg12@example.org" });
  });

  it("führt Mitglieder ohne E-Mail zum Nachpflegen auf", () => {
    const massnahmen = teileEin(
      [mitglied({ id: "a", email: null }), mitglied({ id: "b", email: "   " })],
      [],
      [],
    );
    expect(massnahmen.map((m) => m.art)).toEqual(["ohne_email", "ohne_email"]);
  });

  it("verknüpft ein freies Konto mit derselben Adresse, auch bei anderer Schreibweise", () => {
    const konten: AuthKonto[] = [{ id: "u1", email: "Anna@Web.de" }];
    const [m] = teileEin([mitglied({ id: "a", email: " anna@web.de" })], konten, []);
    expect(m).toMatchObject({ art: "verknuepfen", authUserId: "u1" });
  });

  it("verknüpft auch bei Testadressen statt ein zweites Konto anzulegen", () => {
    const konten: AuthKonto[] = [{ id: "u1", email: "kid@tcm.local" }];
    const [m] = teileEin(
      [mitglied({ id: "a", email: "kid@tcm.local", istTestadresse: true })],
      konten,
      [],
    );
    expect(m).toMatchObject({ art: "verknuepfen", authUserId: "u1" });
  });

  it("meldet eine Adresse, deren Konto schon einem anderen Mitglied gehört", () => {
    const konten: AuthKonto[] = [{ id: "u1", email: "familie@web.de" }];
    const verknuepfungen: Verknuepfung[] = [{ memberId: "x", name: "Eva Muster", authUserId: "u1" }];
    const [m] = teileEin([mitglied({ id: "a", email: "familie@web.de" })], konten, verknuepfungen);
    expect(m).toMatchObject({ art: "vergeben", anderesMitglied: "Eva Muster" });
  });

  it("übergeht Konten ohne Adresse", () => {
    const [m] = teileEin(
      [mitglied({ id: "a", email: "anna@web.de" })],
      [{ id: "u0", email: null }],
      [],
    );
    expect(m?.art).toBe("einladen");
  });
});

describe("gruppiere", () => {
  it("ordnet jede Massnahme genau einer Gruppe zu", () => {
    const gruppen = gruppiere(
      teileEin(
        [
          mitglied({ id: "a", email: "a@web.de" }),
          mitglied({ id: "b", email: "b@example.org", istTestadresse: true }),
          mitglied({ id: "c" }),
        ],
        [],
        [],
      ),
    );
    expect(gruppen.einladen).toHaveLength(1);
    expect(gruppen.still_anlegen).toHaveLength(1);
    expect(gruppen.ohne_email).toHaveLength(1);
    expect(gruppen.verknuepfen).toHaveLength(0);
    expect(gruppen.vergeben).toHaveLength(0);
  });
});

describe("normalisiereEmail", () => {
  it("macht Leeres zu null", () => {
    expect(normalisiereEmail("")).toBeNull();
    expect(normalisiereEmail(null)).toBeNull();
    expect(normalisiereEmail(" A@B.de ")).toBe("a@b.de");
  });
});
