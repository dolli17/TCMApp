import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT, testName } from "./hilfen";

/**
 * Konto löschen beantragen (O9, Apple-Regel 5.1.1(v)).
 *
 * Der Testbestand räumt Anträge der e2e-Konten vor jedem Lauf weg
 * (testbestand-zuruecksetzen.ts) - sonst sperrt der Antrag aus dem letzten
 * Lauf 24 Stunden lang, und der erste Klick meldete schon "liegt vor".
 */
test.describe("Konto löschen beantragen", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Erklärung, Rückfrage, Antrag geht an den Vorstand, zweiter liegt schon vor", async ({ page }) => {
    const nachricht = testName("Loeschung");

    await anmelden(page, NUTZER.mitglied);
    await page.goto("/konto");
    await page.getByRole("link", { name: "Konto löschen beantragen" }).click();
    await page.waitForURL(/\/konto\/loeschen$/);

    const karte = page.locator('section[aria-label="Konto löschen beantragen"]');
    await expect(karte).toContainText("Daten, die der Verein aufbewahren muss");

    // Erst die Rückfrage, Abbrechen sendet nichts.
    await karte.getByLabel("Nachricht an den Vorstand (freiwillig)").fill(nachricht);
    await karte.getByRole("button", { name: "Antrag senden" }).click();
    await expect(karte).toContainText("Möchtest du die Löschung deines Kontos wirklich beantragen?");
    await karte.getByRole("button", { name: "Abbrechen" }).click();
    await expect(karte.getByRole("button", { name: "Ja, beantragen" })).toHaveCount(0);

    await karte.getByRole("button", { name: "Antrag senden" }).click();
    await karte.getByRole("button", { name: "Ja, beantragen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toHaveText(
      "Dein Antrag ist eingegangen. Der Vorstand meldet sich bei dir.",
      { timeout: 15_000 },
    );
    // Nach dem Antrag ist das Formular weg.
    await expect(karte.getByRole("button", { name: "Antrag senden" })).toHaveCount(0);

    // Der Admin hat die Nachricht samt Text des Mitglieds.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
    const { error } = await admin.auth.signInWithPassword({ email: NUTZER.admin, password: PASSWORT });
    expect(error).toBeNull();
    const { data } = await admin.rpc("my_notifications", { p_limit: 100 });
    const treffer = (data ?? []).filter((n) => n.kind === "account_deletion_requested" && n.body.includes(nachricht));
    expect(treffer).toHaveLength(1);

    // Ein zweiter Antrag binnen 24 Stunden ist kein Fehler, nur ein Hinweis.
    await page.reload();
    await karte.getByRole("button", { name: "Antrag senden" }).click();
    await karte.getByRole("button", { name: "Ja, beantragen" }).click();
    await expect(karte.locator(".hinweis.erfolg")).toHaveText(
      "Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum.",
      { timeout: 15_000 },
    );
  });
});
