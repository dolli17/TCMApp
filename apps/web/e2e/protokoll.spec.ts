import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT } from "./hilfen";

/**
 * Verwaltungsprotokoll (O25): eine Aktion des Admins steht danach als Satz
 * auf Verwaltung → System → Protokoll, und die Filter grenzen richtig ein.
 *
 * Die Aktion läuft über die RPC mit dem Token des Admins, wie aus der
 * Oberfläche; eine eigene Mannschaft, damit der Eintrag eindeutig ist und
 * kein anderer Test von ihr abhängt.
 */

const ADMIN_NAME = "Uwe Engel";

function heuteBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

test.describe("Verwaltungsprotokoll", () => {
  let admin: SupabaseClient;
  let mannschaft: string;
  let teamId: string | null = null;

  test.beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
    const { error } = await admin.auth.signInWithPassword({ email: NUTZER.admin, password: PASSWORT });
    if (error) throw error;

    mannschaft = `E2E Protokoll ${Date.now()}`;
    const { data, error: anlegeFehler } = await admin.rpc("upsert_team", { p_name: mannschaft });
    if (anlegeFehler) throw anlegeFehler;
    teamId = data as string;
  });

  test.afterAll(async () => {
    if (teamId) await admin.rpc("delete_team", { p_id: teamId });
  });

  test("zeigt die Aktion als Satz und filtert nach Bereich, Person und Zeitraum", async ({ page }) => {
    const satz = `${ADMIN_NAME} hat Mannschaft „${mannschaft}“ angelegt`;

    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");
    await page.getByRole("link", { name: "Protokoll", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/system\/protokoll$/);
    await expect(page.getByText(satz, { exact: true })).toBeVisible();

    // Anderer Bereich: der Eintrag verschwindet.
    await page.getByLabel("Bereich").selectOption("finanzen");
    await page.getByRole("button", { name: "Anzeigen" }).click();
    await expect(page).toHaveURL(/bereich=finanzen/);
    await expect(page.getByText(satz, { exact: true })).toHaveCount(0);

    // Passender Bereich, die Person und heute: er ist wieder da.
    await page.getByLabel("Bereich").selectOption("verein");
    await page.getByLabel("Person").selectOption({ label: "Engel, Uwe" });
    await page.getByRole("textbox", { name: "Von" }).fill(heuteBerlin());
    await page.getByRole("textbox", { name: "Bis" }).fill(heuteBerlin());
    await page.getByRole("button", { name: "Anzeigen" }).click();
    await expect(page).toHaveURL(/bereich=verein.*person=.*von=/);
    await expect(page.getByText(satz, { exact: true })).toBeVisible();

    // Ein Zeitraum in der Vergangenheit: leer, mit dem Weg zurück.
    await page.getByRole("textbox", { name: "Von" }).fill("2020-01-01");
    await page.getByRole("textbox", { name: "Bis" }).fill("2020-01-02");
    await page.getByRole("button", { name: "Anzeigen" }).click();
    await expect(page.getByText("Für diese Auswahl gibt es keine Einträge.")).toBeVisible();
    await page.getByRole("link", { name: "Filter zurücksetzen" }).click();
    await expect(page.getByText(satz, { exact: true })).toBeVisible();
  });
});
