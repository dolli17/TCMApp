import { describe, expect, it } from "vitest";
import { isSlotConflict, translateDbError } from "./errors";

/**
 * translateDbError entscheidet, was ein Mitglied im Fehlerfall zu lesen bekommt.
 * Die Regeln sind still, aber folgenreich - besonders die dritte: eine Meldung
 * aus einer RPC wird nur durchgereicht, wenn sie auf ein Satzzeichen endet.
 * Genau deshalb enden alle raise-exception-Texte in den Migrationen auf einen
 * Punkt. Diese Tests halten den Zusammenhang fest.
 */

describe("translateDbError", () => {
  it("erkennt einen Constraint am Namen in der Meldung", () => {
    const text = translateDbError({
      message: 'duplicate key value violates unique constraint "members_email_key"',
      code: "23505",
    });
    expect(text).toBe("Diese E-Mail-Adresse wird bereits verwendet.");
  });

  it("erkennt einen Constraint auch, wenn er nur in details steht", () => {
    const text = translateDbError({
      message: "irgendwas",
      details: "Key (member_id)=(…) conflicts with memberships_one_open_per_member",
    });
    expect(text).toBe("Dieses Mitglied hat bereits eine laufende Mitgliedschaft.");
  });

  it("kennt die Constraints der Mitgliederverwaltung", () => {
    expect(translateDbError({ message: "members_nuliga_id_key" })).toContain("nuLiga-Id");
    expect(translateDbError({ message: "members_no_self_payer" })).toContain("eigener Zahler");
    expect(translateDbError({ message: "members_emergency_contact_paarweise" })).toContain(
      "auch ein Name",
    );
  });

  it("reicht eine fuer Menschen geschriebene RPC-Meldung durch", () => {
    const satz = "Der letzte Administrator kann die Rolle nicht abgeben.";
    expect(translateDbError({ message: satz, code: "23514" })).toBe(satz);
  });

  it("reicht eine Meldung ohne Satzzeichen NICHT durch", () => {
    // Ohne Punkt gilt sie als technischer Text; der Benutzer bekommt den
    // allgemeinen Satz zum Fehlercode.
    const text = translateDbError({ message: "something went wrong", code: "23514" });
    expect(text).toBe("Die Eingabe verletzt eine Regel.");
  });

  it("reicht eine Meldung mit 'violates' NICHT durch", () => {
    const text = translateDbError({
      message: 'new row violates row-level security policy for table "members".',
      code: "42501",
    });
    expect(text).toBe("Dafür fehlt dir die Berechtigung.");
  });

  it("faellt auf den Fehlercode zurueck", () => {
    expect(translateDbError({ code: "42501" })).toBe("Dafür fehlt dir die Berechtigung.");
    expect(translateDbError({ code: "23P01" })).toContain("bereits belegt");
    expect(translateDbError({ code: "P0002" })).toContain("nicht gefunden");
  });

  it("hat immer etwas zu sagen", () => {
    expect(translateDbError({})).toBe("Unbekannter Fehler.");
    expect(translateDbError(null)).toBe("Unbekannter Fehler.");
  });
});

describe("isSlotConflict", () => {
  it("erkennt die Doppelbuchung am Fehlercode", () => {
    expect(isSlotConflict({ code: "23P01" })).toBe(true);
  });

  it("erkennt sie auch am bereits uebersetzten Text", () => {
    expect(isSlotConflict({ message: "Dieser Platz ist zu der Zeit bereits belegt." })).toBe(true);
  });

  it("erkennt den rohen Constraint-Namen NICHT", () => {
    // Postgres liefert bei einer Verletzung des Ausschluss-Constraints immer
    // 23P01, deshalb faellt das in der Praxis nicht auf. Wer sich hier auf den
    // Namen verlassen will, muss die Funktion erweitern.
    expect(isSlotConflict({ message: "bookings_no_overlap" })).toBe(false);
  });

  it("haelt andere Fehler auseinander", () => {
    expect(isSlotConflict({ code: "23505" })).toBe(false);
    expect(isSlotConflict(null)).toBe(false);
  });
});
