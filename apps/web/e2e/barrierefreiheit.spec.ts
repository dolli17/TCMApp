import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { berlinTime } from "@tcm/core";
import { anmelden, MITGLIED_ID, NUTZER, PASSWORT, tagIn } from "./hilfen";

/**
 * Automatische Prüfung auf Barrierefreiheit (U6).
 *
 * axe findet nicht alles - ob eine Beschriftung verständlich ist, sieht es
 * nicht. Was es findet, ist aber eindeutig: fehlende Namen, Kontraste unter
 * der Schwelle, falsch verschachtelte Rollen. Geprüft werden die Seiten, die
 * jedes Mitglied sieht, dazu die Verwaltung und die beiden öffentlichen
 * Formulare, jeweils hell und dunkel. Schwere Verstöße (critical, serious)
 * lassen den Test scheitern; die leichteren stehen im Bericht.
 */

const SCHWER = new Set(["critical", "serious"]);

async function pruefe(page: Page, pfad: string) {
  await page.goto(pfad);
  await page.waitForLoadState("networkidle");
  const ergebnis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const schwer = ergebnis.violations
    .filter((v) => SCHWER.has(v.impact ?? ""))
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(schwer, `${pfad}\n${schwer.join("\n")}`).toEqual([]);
}

for (const schema of ["light", "dark"] as const) {
  test.describe(`axe, ${schema === "light" ? "hell" : "dunkel"}`, () => {
    test.use({ colorScheme: schema });

    test("Anmelden und Antrag", async ({ page }) => {
      await pruefe(page, "/login");
      await pruefe(page, "/antrag");
    });

    test("Seiten des Mitglieds", async ({ page }) => {
      await anmelden(page, NUTZER.mitglied);
      for (const pfad of ["/", "/plan", "/verein", "/konto"]) await pruefe(page, pfad);
    });

    // Mit einer anstehenden Buchung steht über dem Plan ein Link im Text
    // („Zu deinen Spielen“) - ohne sie prüfte axe ihn gar nicht (U58).
    // Fester Termin im Fenster des Seeds (T3, ablaeufe.spec.ts): Tag +1,
    // Platz 3, hell um 13:00 und dunkel um 14:00, damit sich beide Läufe
    // nicht in die Quere kommen.
    test("Plan mit anstehender Buchung", async ({ page }) => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        { auth: { persistSession: false } },
      );
      const { error: anmeldefehler } = await supabase.auth.signInWithPassword({
        email: NUTZER.mitglied,
        password: PASSWORT,
      });
      expect(anmeldefehler).toBeNull();
      const { data: platz } = await supabase.from("courts").select("id").eq("name", "Platz 3").single();
      const { data: buchungId, error } = await supabase.rpc("create_booking", {
        p_court_id: platz!.id,
        p_starts_at: berlinTime(tagIn(1), schema === "light" ? 13 * 60 : 14 * 60).toISOString(),
        p_booking_type_code: "einzel",
        p_player_member_ids: [MITGLIED_ID.mia],
      });
      expect(error).toBeNull();

      try {
        await anmelden(page, NUTZER.mitglied);
        await pruefe(page, "/plan");
        await expect(page.locator(".unterzeile a")).toHaveCSS("text-decoration-line", "underline");
      } finally {
        await supabase.rpc("cancel_booking", { p_booking_id: buchungId as string });
      }
    });

    test("Verwaltung", async ({ page }) => {
      await anmelden(page, NUTZER.admin);
      await pruefe(page, "/admin");
    });
  });
}
