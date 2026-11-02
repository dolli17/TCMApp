import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LK_FELD_FEHLER, LK_FELD_LABEL, MANNSCHAFT_INTERESSE_TEXT } from "@tcm/core";
import { anmelden, NUTZER, PASSWORT } from "./hilfen";

/**
 * Konto › Tennis: LK, nuLiga-ID und Mannschaftsinteresse nach dem Onboarding
 * (Vereinsentscheidung vom 02.11.2026).
 *
 * Die LK des Testmitglieds zählt auch in der Mitspielersuche
 * (mitspielersuche-filter.spec.ts). Deshalb merkt sich der Test den Stand
 * vorher und schreibt ihn am Ende zurück.
 */

type Stand = { tennis_lk: string | null; nuliga_id: string | null; mannschaft_interesse: boolean };

async function mitgliedClient() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: NUTZER.mitglied, password: PASSWORT });
  expect(error).toBeNull();
  return supabase;
}

const SCHWER = new Set(["critical", "serious"]);

async function axePruefen(page: Page) {
  await page.waitForLoadState("networkidle");
  const ergebnis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const schwer = ergebnis.violations
    .filter((v) => SCHWER.has(v.impact ?? ""))
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(schwer, schwer.join("\n")).toEqual([]);
}

test.describe("Konto › Tennis", () => {
  test.skip(!NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("LK ändern, nach dem Neuladen steht sie da; ungültige LK wird abgewiesen", async ({ page }) => {
    const supabase = await mitgliedClient();
    const { data } = await supabase.rpc("my_onboarding");
    const vorher = (data as { tennis: Stand }).tennis;

    try {
      await anmelden(page, NUTZER.mitglied);
      await page.goto("/konto");
      await page.getByRole("link", { name: /^Tennis/ }).click();
      await page.waitForURL(/\/konto\/tennis$/);
      await expect(page.getByText("Die LK bestimmt, welche Mitspielersuchen du siehst.")).toBeVisible();

      const karte = page.locator('section[aria-label="Tennis"]');
      const lk = karte.getByLabel(LK_FELD_LABEL);
      const interesse = karte.getByLabel(MANNSCHAFT_INTERESSE_TEXT);

      // Ungültig: Fehlermeldung, nichts gespeichert.
      await lk.fill("30");
      await karte.getByRole("button", { name: "Speichern" }).click();
      await expect(karte.locator(".hinweis.fehler")).toHaveText(LK_FELD_FEHLER);

      // Gültig, in Kurzschreibweise: gespeichert wird normalisiert.
      await lk.fill("14.5");
      await karte.getByLabel("nuLiga-ID").fill("e2e-12345678");
      await interesse.check();
      await karte.getByRole("button", { name: "Speichern" }).click();
      await expect(karte.locator(".hinweis.erfolg")).toHaveText("Gespeichert.");

      await page.reload();
      await expect(lk).toHaveValue("LK14,5");
      await expect(karte.getByLabel("nuLiga-ID")).toHaveValue("e2e-12345678");
      await expect(interesse).toBeChecked();
      await expect(page.getByTestId("tennis-stand")).toHaveText(
        "Aktuell: LK14,5 · nuLiga e2e-12345678 · Interesse an Mannschaft",
      );

      // Die Kontoseite zeigt die Kurzfassung unter dem Eintrag.
      await page.goto("/konto");
      await expect(page.getByRole("link", { name: /^Tennis/ })).toContainText(
        "LK14,5 · nuLiga e2e-12345678 · Interesse an Mannschaft",
      );
    } finally {
      const { error } = await supabase.rpc("save_my_tennis", {
        p_tennis_lk: vorher.tennis_lk ?? "",
        p_nuliga_id: vorher.nuliga_id ?? "",
        p_mannschaft_interesse: vorher.mannschaft_interesse,
      });
      expect(error).toBeNull();
    }
  });

  for (const schema of ["light", "dark"] as const) {
    test.describe(`axe, ${schema === "light" ? "hell" : "dunkel"}`, () => {
      test.use({ colorScheme: schema });

      test("Unterseite Tennis", async ({ page }) => {
        await anmelden(page, NUTZER.mitglied);
        await page.goto("/konto/tennis");
        await axePruefen(page);
      });
    });
  }
});
