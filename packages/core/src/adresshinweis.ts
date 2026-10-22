/**
 * Die Hinweis-Mail an die alte Adresse, wenn sich die E-Mail-Adresse eines
 * Mitglieds ändert (S18).
 *
 * Die Adresse ist zugleich die Anmeldung. Wer sie ändern kann, kann danach
 * das Passwort zurücksetzen lassen und hat das Konto. Deshalb erfährt die
 * bisherige Adresse davon, bei jedem Mitglied, nicht nur bei Admins.
 *
 * Die neue Adresse steht bewusst nicht drin: der Hinweis soll warnen, nicht
 * weitergeben, wohin das Konto jetzt gehört.
 *
 * Wie mailvorlage.ts liegt die Vorlage hier, weil sie hier unter Test steht;
 * neben member-login liegt ein Symlink. Stil aus templates/einladung.html.
 */

export const ADRESSHINWEIS_BETREFF = "Deine E-Mail-Adresse beim TC Muckensturm wurde geändert";

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function adresshinweisHtml(name: string | null, siteUrl: string): string {
  return `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #16222e; max-width: 520px;">
  <h2 style="font-size: 20px; margin: 0 0 16px;">Deine E-Mail-Adresse wurde geändert</h2>

  <p>Hallo${name ? ` ${escape(name)}` : ""},</p>

  <p>
    für deinen Zugang zur Vereins-App des TC Muckensturm ist ab sofort eine
    andere E-Mail-Adresse eingetragen. An diese Adresse gehen keine Nachrichten
    mehr, und anmelden kannst du dich nur noch mit der neuen.
  </p>

  <p>
    <strong>Warst du das nicht, oder hast du das nicht veranlasst?</strong>
    Dann melde dich bitte gleich beim Vorstand des Vereins, damit wir deinen
    Zugang prüfen können.
  </p>

  <p style="color: #5b6b7a; font-size: 14px;">
    War die Änderung gewollt, ist nichts weiter zu tun.
    <a href="${escape(siteUrl)}" style="color: #1f4e79;">Zur App</a>
  </p>

  <p style="margin-top: 32px;">Sportliche Grüße<br>TC Muckensturm</p>
</div>`;
}

export function adresshinweisText(name: string | null, siteUrl: string): string {
  return [
    `Hallo${name ? ` ${name}` : ""},`,
    "",
    "für deinen Zugang zur Vereins-App des TC Muckensturm ist ab sofort eine andere E-Mail-Adresse eingetragen. An diese Adresse gehen keine Nachrichten mehr, und anmelden kannst du dich nur noch mit der neuen.",
    "",
    "Warst du das nicht, oder hast du das nicht veranlasst? Dann melde dich bitte gleich beim Vorstand des Vereins, damit wir deinen Zugang prüfen können.",
    "",
    `War die Änderung gewollt, ist nichts weiter zu tun. Zur App: ${siteUrl}`,
    "",
    "Sportliche Grüße",
    "TC Muckensturm",
  ].join("\n");
}
