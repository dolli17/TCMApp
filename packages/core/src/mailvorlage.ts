/**
 * Die Vorlage der Benachrichtigungs-Mail.
 *
 * Liegt in @tcm/core und nicht neben der Edge Function, aus einem einzigen
 * Grund: hier ist sie testbar. Die Function läuft in Deno und lässt sich in
 * dieser Werkbank nicht aufrufen; die Vorlage dagegen ist reines TypeScript,
 * und sie ist der Teil mit dem meisten Text — Pluralformen, Maskierung,
 * Kürzung. Genau dort entstehen die Fehler, die man sonst erst im Postfach
 * sieht. Neben der Function liegt ein Symlink hierher — eine Kopie wären zwei
 * Wahrheiten, und getestet würde die falsche.
 *
 * Bewusst nicht in supabase/templates/: dort liegen die Go-Vorlagen, die
 * Supabase Auth selbst rendert. Eine Datei dort hätte die Erwartung geweckt,
 * sie würde automatisch benutzt.
 *
 * Stil und Farben stammen aus templates/einladung.html — Inline-Stile, weil
 * Mailprogramme mit einem <style>-Block bis heute unzuverlässig umgehen.
 */

export interface Posten {
  kind: string;
  title: string;
  body: string;
  created_at: string;
}

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/** Höchstens so viele Einzelposten in einer Mail; der Rest wird gezählt. */
const HOECHSTENS = 20;

/**
 * Geht es wirklich um Platzbuchungen?
 *
 * Über dieselbe Tabelle läuft auch `application_new` — der Hinweis an den
 * Vorstand, dass jemand dem Verein beitreten möchte. „An deinen
 * Platzbuchungen hat sich etwas geändert" wäre dort schlicht falsch, und ein
 * Knopf „Meine Buchungen ansehen" führte ins Leere.
 */
function nurBuchungen(posten: Posten[]): boolean {
  return posten.every((p) => p.kind.startsWith("booking_") || p.kind.startsWith("player_"));
}

/**
 * Geht es ums Geld?
 *
 * Eine angekündigte Lastschrift ist kein „Neues aus dem Verein": sie verlangt
 * eine Handlung, nämlich Deckung auf dem Konto. Und der Knopf muss ins Konto
 * führen, wo Betrag und Fälligkeit stehen — nicht auf die Startseite.
 */
function nurForderungen(posten: Posten[]): boolean {
  return posten.every((p) => p.kind.startsWith("charge_"));
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Der Betreff.
 *
 * Bei einem einzelnen Posten dessen eigener Titel — „Deine Platzbuchung wurde
 * aufgehoben" sagt im Posteingang mehr als „1 Hinweis vom TC Muckensturm".
 */
export function betreff(posten: Posten[]): string {
  if (posten.length === 1) return posten[0]!.title;
  return `${posten.length} Hinweise vom TC Muckensturm`;
}

export function html(vorname: string | null, posten: Posten[], siteUrl: string): string {
  const gezeigt = posten.slice(0, HOECHSTENS);
  const rest = posten.length - gezeigt.length;
  const buchungen = nurBuchungen(posten);
  const geld = nurForderungen(posten);
  const ziel = buchungen ? `${siteUrl}/plan/meine` : geld ? `${siteUrl}/konto` : siteUrl;

  const zeilen = gezeigt
    .map(
      (p) => `
      <li style="margin-bottom: 14px;">
        <strong>${escape(p.title)}</strong><br>
        <span>${escape(p.body)}</span><br>
        <span style="color: #5b6b7a; font-size: 13px;">
          ${ZEIT.format(new Date(p.created_at))} Uhr
        </span>
      </li>`,
    )
    .join("");

  return `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #16222e; max-width: 520px;">
  <h2 style="font-size: 20px; margin: 0 0 16px;">${
    buchungen
      ? "Neues zu deinen Platzbuchungen"
      : geld
        ? "Zu deinem Beitragskonto"
        : "Neues aus dem Verein"
  }</h2>

  <p>Hallo${vorname ? ` ${escape(vorname)}` : ""},</p>

  <p>${
    geld
      ? "das betrifft dein Konto beim Verein:"
      : !buchungen
        ? "es gibt Neues aus dem Verein:"
        : posten.length === 1
          ? "an deiner Platzbuchung hat sich etwas geändert:"
          : "an deinen Platzbuchungen hat sich etwas geändert:"
  }</p>

  <ul style="padding-left: 20px; margin: 20px 0;">${zeilen}
  </ul>
${
  rest > 0
    ? `  <p style="color: #5b6b7a; font-size: 14px;">… und ${rest} weitere. Alle stehen in der App.</p>\n`
    : ""
}
  <p style="margin: 24px 0;">
    <a href="${ziel}"
       style="background: #1f4e79; color: #ffffff; text-decoration: none;
              padding: 12px 20px; border-radius: 14px; display: inline-block;">
      ${buchungen ? "Meine Buchungen ansehen" : geld ? "Mein Konto ansehen" : "In der App ansehen"}
    </a>
  </p>

  <p style="color: #5b6b7a; font-size: 14px;">
    Diese Hinweise kannst du unter <em>Mein Konto → Einwilligungen → E-Mails zu
    Buchungen</em> abstellen. In der App siehst du sie dann weiterhin.
  </p>

  <p style="margin-top: 32px;">Sportliche Grüße<br>TC Muckensturm</p>
</div>`;
}

/**
 * Dieselbe Nachricht als reiner Text.
 *
 * Nicht Zierde, sondern Zustellbarkeit: eine Mail ohne Textteil landet bei
 * manchen Filtern schneller im Spam-Ordner.
 */
export function text(vorname: string | null, posten: Posten[], siteUrl: string): string {
  const gezeigt = posten.slice(0, HOECHSTENS);
  const rest = posten.length - gezeigt.length;
  const buchungen = nurBuchungen(posten);
  const geld = nurForderungen(posten);

  const zeilen = gezeigt
    .map((p) => `- ${p.title}\n  ${p.body}\n  ${ZEIT.format(new Date(p.created_at))} Uhr`)
    .join("\n\n");

  return [
    `Hallo${vorname ? ` ${vorname}` : ""},`,
    "",
    buchungen
      ? "an deinen Platzbuchungen hat sich etwas geändert:"
      : geld
        ? "das betrifft dein Konto beim Verein:"
        : "es gibt Neues aus dem Verein:",
    "",
    zeilen,
    rest > 0 ? `\n… und ${rest} weitere. Alle stehen in der App.` : "",
    "",
    buchungen
      ? `Meine Buchungen: ${siteUrl}/plan/meine`
      : geld
        ? `Mein Konto: ${siteUrl}/konto`
        : `Zur App: ${siteUrl}`,
    "",
    "Diese Hinweise kannst du unter Mein Konto → Einwilligungen → E-Mails zu",
    "Buchungen abstellen. In der App siehst du sie dann weiterhin.",
    "",
    "Sportliche Grüße",
    "TC Muckensturm",
  ].join("\n");
}
