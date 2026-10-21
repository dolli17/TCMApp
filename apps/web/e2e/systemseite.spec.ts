import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT } from "./hilfen";

/**
 * Die Systemseite (U12): deutsche Namen statt Schlüssel, Euro statt Cent,
 * Häkchen statt Kommaliste und ein einziger Knopf zum Speichern.
 *
 * Geprüft wird, was in der Datenbank ankommt, nicht nur, was die Seite nach
 * dem Neuladen zeigt - eine falsche Umrechnung in beide Richtungen sähe auf
 * der Seite richtig aus.
 */

const STUNDENSATZ = "work_duty.hourly_rate_cents";
const PUSH_ARTEN = "notifications.push_kinds";
const PROTOKOLL_TAGE = "privacy.change_log_days";

async function alsAdmin(): Promise<SupabaseClient> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: NUTZER.admin, password: PASSWORT });
  if (error) throw error;
  return supabase;
}

async function wert(supabase: SupabaseClient, key: string): Promise<unknown> {
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).single();
  expect(error).toBeNull();
  return data!.value;
}

async function speichern(page: Page) {
  await page.getByRole("button", { name: "Alle Änderungen speichern" }).click();
  await expect(page.locator(".einstellungs-fuss .hinweis.erfolg")).toContainText("gespeichert", {
    timeout: 15_000,
  });
}

test.describe("Systemseite", () => {
  let admin: SupabaseClient;
  let vorher: { satz: unknown; push: unknown };

  test.beforeAll(async () => {
    admin = await alsAdmin();
    vorher = { satz: await wert(admin, STUNDENSATZ), push: await wert(admin, PUSH_ARTEN) };
  });

  // Zurück auf den Ausgangswert, auch wenn ein Test mittendrin scheitert.
  test.afterAll(async () => {
    await admin.rpc("set_setting", { p_key: STUNDENSATZ, p_value: String(vorher.satz) });
    await admin.rpc("set_setting", { p_key: PUSH_ARTEN, p_value: String(vorher.push) });
  });

  test("zeigt deutsche Namen, keine Schlüssel und nur einen Speichern-Knopf", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");

    await expect(page.getByLabel("Stundensatz Arbeitsdienst (€)")).toBeVisible();
    await expect(page.getByRole("group", { name: "Auch als Push" })).toBeVisible();
    const text = (await page.locator(".einstellungs-formular").textContent()) ?? "";
    expect(text).not.toMatch(/\b(work_duty|notifications|privacy)\.|_cents|booking_\w+|Kommagetrennt/);
    await expect(page.locator(".einstellungs-formular button")).toHaveCount(1);
  });

  test("Euro-Eingabe speichert Cent", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");

    const feld = page.getByLabel("Stundensatz Arbeitsdienst (€)");
    const satz = Number(vorher.satz);
    await expect(feld).toHaveValue(`${Math.floor(satz / 100)},${String(satz % 100).padStart(2, "0")}`);

    const [neu, cents] = satz === 1750 ? ["16,25", 1625] : ["17,50", 1750];
    await feld.fill(neu);
    await speichern(page);
    expect(await wert(admin, STUNDENSATZ)).toBe(cents);

    await page.reload();
    await expect(page.getByLabel("Stundensatz Arbeitsdienst (€)")).toHaveValue(neu);
  });

  test("ein ungültiger Betrag hält alles auf und lässt die Eingaben stehen", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");

    const davor = await wert(admin, STUNDENSATZ);
    const tageDavor = await wert(admin, PROTOKOLL_TAGE);
    const tage = page.getByLabel("Aufbewahrung des Änderungsprotokolls in Tagen");
    await tage.fill("999");
    await page.getByLabel("Stundensatz Arbeitsdienst (€)").fill("15,001");
    await page.getByRole("button", { name: "Alle Änderungen speichern" }).click();
    await expect(page.locator(".einstellungs-fuss .hinweis.fehler")).toContainText(
      "Stundensatz Arbeitsdienst: Bitte einen Betrag in Euro",
      { timeout: 15_000 },
    );
    await expect(page.locator(".einstellungs-fuss .hinweis.fehler")).toContainText("Nichts wurde gespeichert");
    // Auch der gültige Wert daneben ist nicht gespeichert ...
    expect(await wert(admin, STUNDENSATZ)).toBe(davor);
    expect(await wert(admin, PROTOKOLL_TAGE)).toBe(tageDavor);
    // ... aber die Eingaben stehen noch da (React 19 setzt <form action> zurück).
    await expect(tage).toHaveValue("999");
    await expect(page.getByLabel("Stundensatz Arbeitsdienst (€)")).toHaveValue("15,001");
  });

  test("Häkchen speichern die Liste der Push-Arten", async ({ page }) => {
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/system");

    const gruppe = page.getByRole("group", { name: "Auch als Push" });
    const haken = gruppe.getByLabel("Erinnerung an eine Veranstaltung");
    const warAn = await haken.isChecked();
    await haken.setChecked(!warAn);
    await speichern(page);

    const liste = String(await wert(admin, PUSH_ARTEN)).split(",");
    expect(liste.includes("event_reminder")).toBe(!warAn);
    // Die übrigen Arten bleiben, wie sie waren.
    const ohne = (l: string[]) => l.filter((k) => k !== "event_reminder").sort();
    expect(ohne(liste)).toEqual(ohne(String(vorher.push).split(",")));
  });
});
