/**
 * Die Mail mit dem Bestätigungslink zum Mitgliedsantrag (S22).
 *
 * Liegt aus demselben Grund wie mailvorlage.ts hier: in @tcm/core steht sie
 * unter Test, und neben der Edge Function mitgliedsantrag liegt ein Symlink
 * hierher. Stil und Farben wie die übrigen Mails (templates/einladung.html).
 *
 * Kurz und ohne Antragsdaten: wer die Adresse eines anderen eingetragen hat,
 * soll dem Empfänger nichts in den Mund legen können außer einem Vornamen.
 */

/** So lange gilt der Link. Muss zur Datenbank passen (24 Stunden). */
export const ANTRAG_LINK_STUNDEN = 24;

export const ANTRAG_BETREFF = "Bitte bestätige deinen Mitgliedsantrag";

/** Der Link zur Bestätigungsseite im Web. */
export function antragsLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, "")}/antrag/bestaetigen?token=${encodeURIComponent(token)}`;
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Der Vorname aus dem Formular, gekürzt: er ist ungeprüfte Eingabe. */
function anrede(vorname: string | null): string {
  const name = (vorname ?? "").trim().slice(0, 50);
  return name ? `Hallo ${name},` : "Hallo,";
}

export function antragsmailHtml(vorname: string | null, link: string): string {
  const href = escape(link);
  return `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #16222e; max-width: 520px;">
  <h2 style="font-size: 20px; margin: 0 0 16px;">Fast geschafft</h2>

  <p>${escape(anrede(vorname))}</p>

  <p>
    danke für deinen Antrag beim TC Muckensturm. Bitte bestätige noch, dass
    diese E-Mail-Adresse dir gehört. Erst dann geht dein Antrag an den Vorstand.
  </p>

  <p style="margin: 24px 0;">
    <a href="${href}"
       style="background: #1f4e79; color: #ffffff; text-decoration: none;
              padding: 12px 20px; border-radius: 14px; display: inline-block;">
      Antrag bestätigen
    </a>
  </p>

  <p style="color: #5b6b7a; font-size: 14px;">
    Falls der Knopf nicht funktioniert, kopiere diese Adresse in deinen Browser:<br>
    <span style="word-break: break-all;">${href}</span>
  </p>

  <p style="color: #5b6b7a; font-size: 14px;">
    Der Link gilt ${ANTRAG_LINK_STUNDEN} Stunden. Danach löschen wir deine Angaben
    wieder, und du kannst den Antrag einfach neu stellen.
  </p>

  <p style="color: #5b6b7a; font-size: 14px;">
    Du hast keinen Antrag gestellt? Dann ignoriere diese Nachricht einfach.
    Ohne Bestätigung passiert nichts.
  </p>

  <p style="margin-top: 32px;">Sportliche Grüße<br>TC Muckensturm</p>
</div>`;
}

/** Dieselbe Nachricht als reiner Text, für die Zustellbarkeit. */
export function antragsmailText(vorname: string | null, link: string): string {
  return [
    anrede(vorname),
    "",
    "danke für deinen Antrag beim TC Muckensturm. Bitte bestätige noch, dass",
    "diese E-Mail-Adresse dir gehört. Erst dann geht dein Antrag an den Vorstand.",
    "",
    `Antrag bestätigen: ${link}`,
    "",
    `Der Link gilt ${ANTRAG_LINK_STUNDEN} Stunden. Danach löschen wir deine Angaben`,
    "wieder, und du kannst den Antrag einfach neu stellen.",
    "",
    "Du hast keinen Antrag gestellt? Dann ignoriere diese Nachricht einfach.",
    "Ohne Bestätigung passiert nichts.",
    "",
    "Sportliche Grüße",
    "TC Muckensturm",
  ].join("\n");
}
