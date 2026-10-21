/**
 * Die Mailvorlage der Edge Function.
 *
 * Der Versand selbst läuft in Deno und lässt sich hier nicht aufrufen — die
 * Vorlage dagegen ist reines TypeScript ohne Laufzeitbindung, und sie ist der
 * Teil mit dem meisten Text: Pluralformen, Escaping, Kürzung. Genau dort
 * entstehen die Fehler, die man erst im Postfach sieht.
 *
 * Die Vorlage liegt deshalb hier und nicht neben der Function — eine Kopie an
 * beiden Orten wäre die schlechtere Lösung: dann gäbe es zwei Vorlagen, und
 * getestet würde die falsche.
 */

import { describe, expect, it } from "vitest";
import {
  betreff, html, mailZiel, text, type Posten,
} from "./mailvorlage";

function posten(anzahl: number, titel = "Deine Platzbuchung wurde aufgehoben"): Posten[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    kind: "booking_displaced",
    title: `${titel}${anzahl > 1 ? ` ${i + 1}` : ""}`,
    body: "Die Buchung am 12.08.2026 auf Platz 3 faellt aus: Regen.",
    created_at: "2026-08-10T16:30:00.000Z",
  }));
}

describe("betreff", () => {
  it("nimmt bei einer einzelnen Nachricht deren eigenen Titel", () => {
    // "Deine Platzbuchung wurde aufgehoben" sagt im Posteingang mehr als
    // "1 Hinweis vom TC Muckensturm".
    expect(betreff(posten(1))).toBe("Deine Platzbuchung wurde aufgehoben");
  });

  it("zählt bei mehreren", () => {
    expect(betreff(posten(3))).toBe("3 Hinweise vom TC Muckensturm");
  });
});

describe("html", () => {
  it("spricht den Empfänger mit Vornamen an", () => {
    expect(html("Johanna", posten(1), "https://tcm.example")).toContain("Hallo Johanna,");
  });

  it("kommt ohne Vornamen aus", () => {
    const ausgabe = html(null, posten(1), "https://tcm.example");
    expect(ausgabe).toContain("Hallo,");
    expect(ausgabe).not.toContain("null");
  });

  it("verlinkt auf die eigenen Buchungen", () => {
    expect(html(null, posten(1), "https://tcm.example")).toContain(
      "https://tcm.example/plan/meine",
    );
  });

  it("nennt den Weg zum Abbestellen", () => {
    expect(html(null, posten(1), "https://tcm.example")).toContain("E-Mails zu\n    Buchungen");
  });

  it("kürzt lange Listen und sagt, wie viele fehlen", () => {
    const ausgabe = html(null, posten(25), "https://tcm.example");
    expect(ausgabe).toContain("… und 5 weitere");
    // 20 gezeigte Posten, nicht 25
    expect(ausgabe.split("<li").length - 1).toBe(20);
  });

  it("maskiert spitze Klammern aus den Daten", () => {
    // Ein Platzname oder Titel mit < oder & darf das Markup nicht zerreißen -
    // und schon gar nicht Markup einschleusen.
    const boese: Posten[] = [
      {
        kind: "booking_cancelled",
        title: '<script>alert("hallo")</script>',
        body: "Platz 1 & 2",
        created_at: "2026-08-10T16:30:00.000Z",
      },
    ];
    const ausgabe = html(null, boese, "https://tcm.example");
    expect(ausgabe).not.toContain("<script>");
    expect(ausgabe).toContain("&lt;script&gt;");
    expect(ausgabe).toContain("Platz 1 &amp; 2");
  });
});

describe("Mitgliedsanträge sind keine Platzbuchungen", () => {
  // Über dieselbe Tabelle läuft auch der Hinweis an den Vorstand, dass jemand
  // beitreten möchte. Der Rahmentext muss das merken, sonst steht ein Antrag
  // unter „an deinen Platzbuchungen hat sich etwas geändert".
  const antrag: Posten[] = [
    {
      kind: "application_new",
      title: "Neuer Mitgliedsantrag",
      body: "Erika Mustermann möchte dem Verein beitreten.",
      created_at: "2026-08-10T16:30:00.000Z",
    },
  ];

  it("wählt eine neutrale Überschrift", () => {
    const ausgabe = html("Thomas", antrag, "https://tcm.example");
    expect(ausgabe).toContain("Neues aus dem Verein");
    expect(ausgabe).not.toContain("Platzbuchungen hat sich etwas geändert");
  });

  it("verlinkt nicht auf die eigenen Buchungen", () => {
    const ausgabe = html("Thomas", antrag, "https://tcm.example");
    expect(ausgabe).not.toContain("/plan/meine");
    expect(ausgabe).toContain("In der App ansehen");
  });

  it("gilt auch im Textteil", () => {
    const ausgabe = text("Thomas", antrag, "https://tcm.example");
    expect(ausgabe).toContain("es gibt Neues aus dem Verein:");
    expect(ausgabe).toContain("Zur App: https://tcm.example");
  });

  it("bleibt beim Buchungstext, wenn nur Buchungen dabei sind", () => {
    expect(html(null, posten(2), "https://tcm.example")).toContain(
      "Neues zu deinen Platzbuchungen",
    );
  });
});

describe("Eine angekündigte Lastschrift führt ins Konto", () => {
  // Sie ist weder eine Platzbuchung noch beiläufige Vereinsnachricht: sie
  // verlangt eine Handlung, nämlich Deckung auf dem Konto. Wer den Knopf
  // drückt, muss dort landen, wo Betrag und Fälligkeit stehen.
  const ankuendigung: Posten[] = [
    {
      kind: "charge_announced",
      title: "Lastschrift am 15.01.2027",
      body: "Am 15.01.2027 ziehen wir 270,00 Euro von deinem Konto ein.",
      created_at: "2026-12-20T09:00:00.000Z",
    },
  ];

  it("wählt eine Überschrift, die ans Geld erinnert", () => {
    const ausgabe = html("Thomas", ankuendigung, "https://tcm.example");
    expect(ausgabe).toContain("Zu deinem Beitragskonto");
    expect(ausgabe).not.toContain("Neues aus dem Verein");
  });

  it("verlinkt aufs Konto, nicht auf die Startseite", () => {
    const ausgabe = html("Thomas", ankuendigung, "https://tcm.example");
    expect(ausgabe).toContain("https://tcm.example/konto");
    expect(ausgabe).toContain("Konto ansehen");
  });

  it("gilt auch im Textteil", () => {
    const ausgabe = text("Thomas", ankuendigung, "https://tcm.example");
    expect(ausgabe).toContain("das betrifft dein Konto beim Verein:");
    expect(ausgabe).toContain("Konto: https://tcm.example/konto");
  });

  it("fällt auf den neutralen Text zurück, sobald anderes dabei ist", () => {
    const gemischt = [...ankuendigung, ...posten(1)];
    const ausgabe = html("Thomas", gemischt, "https://tcm.example");
    expect(ausgabe).toContain("Neues aus dem Verein");
  });
});

describe("text", () => {
  it("liefert eine Textfassung mit allen Posten", () => {
    // Eine Mail ohne Textteil landet bei manchen Filtern schneller im Spam.
    const ausgabe = text("Johanna", posten(2), "https://tcm.example");
    expect(ausgabe).toContain("Hallo Johanna,");
    expect(ausgabe).toContain("Deine Platzbuchung wurde aufgehoben 1");
    expect(ausgabe).toContain("Deine Platzbuchung wurde aufgehoben 2");
    expect(ausgabe).toContain("https://tcm.example/plan/meine");
  });

  it("maskiert im Text nichts - dort gibt es kein Markup", () => {
    const ausgabe = text(null, posten(1), "https://tcm.example");
    expect(ausgabe).not.toContain("&amp;");
  });
});

describe("Veranstaltungen führen zur Veranstaltung", () => {
  const abgesagt: Posten = {
    kind: "event_cancelled",
    title: "Abgesagt: Sommerfest",
    body: "Sommerfest am 06.11.2026, 19:00 Uhr, Clubhaus faellt aus. Die Gebuehr entfaellt.",
    created_at: "2026-10-19T10:00:00.000Z",
    event_id: "e1",
  };

  it("eine Veranstaltung: Knopf auf ihre Seite", () => {
    expect(mailZiel([abgesagt], "https://tcm.example")).toEqual({
      href: "https://tcm.example/verein/veranstaltungen/e1",
      knopf: "Veranstaltung ansehen",
      kurz: "Zur Veranstaltung",
    });
    const ausgabe = html("Eva", [abgesagt], "https://tcm.example");
    expect(ausgabe).toContain("Neues zu Veranstaltungen");
    expect(ausgabe).toContain('href="https://tcm.example/verein/veranstaltungen/e1"');
    expect(text("Eva", [abgesagt], "https://tcm.example"))
      .toContain("Zur Veranstaltung: https://tcm.example/verein/veranstaltungen/e1");
  });

  it("mehrere Veranstaltungen: auf die Liste", () => {
    const zwei = [abgesagt, { ...abgesagt, kind: "event_changed", event_id: "e2" }];
    expect(mailZiel(zwei, "https://tcm.example").href).toBe("https://tcm.example/verein/veranstaltungen");
  });

  it("gemischt mit Buchungen: die Startseite wie bisher", () => {
    const gemischt = [abgesagt, ...posten(1)];
    expect(mailZiel(gemischt, "https://tcm.example").href).toBe("https://tcm.example");
    expect(html(null, gemischt, "https://tcm.example")).toContain("Neues aus dem Verein");
  });
});
