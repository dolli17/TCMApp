import { expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORT } from "./hilfen";

/**
 * Rüstzeug für die Abläufe der Verwaltung (kasse-geld, mitglieder-verwaltung,
 * plaetze-serien, verwaltung-rest).
 *
 * Jeder dieser Tests arbeitet mit eigenen Datensätzen (Präfix ZZTest) und
 * räumt sie über die Oberfläche wieder ab. Was die Oberfläche nicht löschen
 * kann (Beitragsart, Buchungsart, Getränk), gibt es genau einmal mit festem
 * Namen: der erste Lauf legt an, jeder weitere benutzt denselben Datensatz
 * und legt ihn am Ende wieder still.
 */

export function testEmail(nachname: string, vorname = "Test"): string {
  return `${vorname}.${nachname}@example.org`.toLowerCase();
}

/** Ein Supabase-Client, angemeldet als dieses Konto - für Vorbereitung und Gegenprobe. */
export async function alsKonto(email: string): Promise<SupabaseClient> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORT });
  if (error) throw error;
  return supabase;
}

/** Das laufende Jahr in Berliner Zeit. */
export function diesesJahr(): number {
  return Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 4));
}

/** Das offene Blatt (FensterKnopf, Buchungsfenster). */
export function blatt(page: Page): Locator {
  return page.locator("dialog.fenster");
}

/** Die Zeile einer Liste (`.liste-gruppe[aria-label=…]`), die diesen Text trägt. */
export function zeileIn(page: Page, liste: string, text: string | RegExp): Locator {
  return page.locator(`.liste-gruppe[aria-label="${liste}"] > li`).filter({ hasText: text });
}

/**
 * Legt ein Mitglied an und gibt die Adresse seiner Detailseite zurück, ohne
 * Abschnitt. Die Adresse endet auf example.org: dorthin geht keine Mail.
 */
export async function mitgliedAnlegen(page: Page, nachname: string, vorname = "Test"): Promise<string> {
  await page.goto("/admin/mitglieder");
  await page.getByRole("button", { name: "Mitglied anlegen" }).click();

  const fenster = blatt(page);
  await expect(fenster).toBeVisible();
  await fenster.getByLabel("Vorname").fill(vorname);
  await fenster.getByLabel("Nachname").fill(nachname);
  await fenster.getByLabel("E-Mail").fill(testEmail(nachname, vorname));
  await fenster.getByLabel("Geburtstag").fill("1990-05-17");
  await fenster.getByLabel("Geschlecht").selectOption("diverse");
  await fenster.getByLabel("Telefon").fill("07223 12345");
  await fenster.getByLabel("Straße und Hausnummer").fill("Hauptstraße 1");
  await fenster.getByLabel("PLZ").fill("77815");
  await fenster.getByLabel("Ort", { exact: true }).fill("Muckensturm");
  await fenster.getByRole("button", { name: "Anlegen" }).click();

  await page.waitForURL(/\/admin\/mitglieder\/[0-9a-f-]{36}/, { timeout: 20_000 });
  return page.url().split("?")[0]!;
}

/** Die Karte „Datensatz beenden“ eines Mitglieds. */
export async function gefahrenzone(page: Page, adresse: string): Promise<Locator> {
  await page.goto(`${adresse}?teil=austritt`);
  const zone = page.locator('section[aria-label="Datensatz beenden"]');
  await expect(zone).toBeVisible();
  return zone;
}

/**
 * Ein Testmitglied ohne Historie endgültig löschen. Aufräumen ist Kür: ein
 * Fehler hier kippt den Test nicht, der nächste Lauf legt ein neues an.
 */
export async function mitgliedLoeschen(page: Page, adresse: string, nachname: string): Promise<void> {
  try {
    const zone = await gefahrenzone(page, adresse);
    const feld = zone.getByLabel(/Nachnamen .* eintippen/);
    if (await feld.isVisible()) {
      await feld.fill(nachname);
      await zone.getByRole("button", { name: "Endgültig löschen" }).click();
      await page.waitForURL(/\/admin\/mitglieder$/, { timeout: 20_000 });
    }
  } catch {
    // siehe oben
  }
}

/**
 * Ein Testmitglied mit Historie abräumen: löschen geht dann nicht mehr, also
 * archivieren und anonymisieren. Danach steht es in keiner laufenden Liste
 * und trägt keinen Namen mehr. Ebenfalls Kür.
 */
export async function mitgliedBeenden(page: Page, adresse: string, nachname: string): Promise<void> {
  try {
    const zone = await gefahrenzone(page, adresse);
    if (await zone.getByRole("button", { name: "Archivieren" }).isVisible()) {
      await zone.getByRole("button", { name: "Archivieren" }).click();
      const frage = zone.getByRole("group", { name: "Archivieren bestätigen" });
      await frage.getByLabel("Grund").fill("ZZTest Aufräumen");
      await frage.getByRole("button", { name: "Wirklich archivieren" }).click();
      await expect(zone.locator(".hinweis.erfolg")).toContainText("archiviert", { timeout: 20_000 });
    }
    await zone.getByRole("button", { name: "Anonymisieren" }).click();
    const frage = zone.getByRole("group", { name: "Anonymisieren bestätigen" });
    await frage.getByLabel("Grund").fill("ZZTest Aufräumen");
    await frage.getByLabel(/Nachnamen .* eintippen/).fill(nachname);
    await frage.getByRole("button", { name: "Wirklich anonymisieren" }).click();
    // Die Rückfrage schließt sich erst, wenn das Anonymisieren durch ist.
    await expect(frage).toHaveCount(0, { timeout: 30_000 });
  } catch {
    // siehe mitgliedLoeschen
  }
}

/** Eine Forderung von Hand anlegen (Kasse › Forderungen › Forderung anlegen). */
export async function forderungAnlegen(
  page: Page,
  daten: { mitglied: string; art: "deposit" | "misc"; betrag: string; beschreibung: string },
): Promise<void> {
  await page.goto("/admin/kasse?abschnitt=forderungen");
  await page.getByRole("button", { name: /Forderung anlegen/ }).first().click();
  const fenster = blatt(page);
  await fenster.getByLabel("Mitglied").fill(daten.mitglied);
  await fenster.getByLabel("Art").selectOption(daten.art);
  await fenster.getByLabel("Betrag in Euro").fill(daten.betrag);
  await fenster.getByLabel("Beschreibung").fill(daten.beschreibung);
  await fenster.getByRole("button", { name: "Forderung anlegen" }).click();
  await expect(fenster.locator(".hinweis.erfolg")).toBeVisible({ timeout: 20_000 });
}

/**
 * Eine Zeile der Forderungsliste öffnen. Die Liste ist nach Art und Stand
 * gefiltert, damit die gesuchte Forderung sicher unter den ersten 500 steht.
 */
export async function forderungOeffnen(
  page: Page,
  filter: { art: string; stand: string },
  text: string,
): Promise<Locator> {
  await page.goto(`/admin/kasse?abschnitt=forderungen&art=${filter.art}&stand=${filter.stand}`);
  const zeile = zeileIn(page, "Forderungen", text);
  await expect(zeile).toHaveCount(1);
  await zeile.getByRole("button").click();
  const fenster = blatt(page);
  await expect(fenster).toBeVisible();
  return fenster;
}
