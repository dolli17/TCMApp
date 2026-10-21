import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT } from "./hilfen";

/**
 * Buchungsregeln im Client (B11, B12, B13): der Plan bietet nur an, was
 * create_booking, cancel_booking, leave_booking und join_booking auch
 * annehmen. Die Regeln selbst stehen in @tcm/core und sind dort mit
 * Unit-Tests abgedeckt, auch fuer die Zeitumstellung am 25.10. Hier geht es
 * darum, dass Web sie wirklich benutzt.
 */

/** Tag und Minuten seit Mitternacht in Berliner Zeit. */
function berlin(zeitpunkt: Date): { tag: string; minuten: number } {
  const teile = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(zeitpunkt);
  const teil = (name: string) => teile.find((t) => t.type === name)?.value ?? "0";
  return {
    tag: `${teil("year")}-${teil("month")}-${teil("day")}`,
    minuten: (Number(teil("hour")) % 24) * 60 + Number(teil("minute")),
  };
}

/** "Platz 1 um 14:30 buchen" -> 870 */
function minuteAusLabel(label: string | null): number {
  const [, h, m] = /(\d{2}):(\d{2})/.exec(label ?? "") ?? [];
  return Number(h) * 60 + Number(m);
}

/** Das Suchfeld für Mitspieler - es öffnet sich über "+ Mitglied". */
async function suchfeld(fenster: Locator) {
  const feld = fenster.getByLabel("Mitspieler suchen");
  if (!(await feld.isVisible())) await fenster.getByRole("button", { name: "Mitglied" }).click();
  return feld;
}

/** Die Tage, die der Plan als Kacheln anbietet - heute plus lead_days. */
async function tage(page: Page): Promise<number> {
  return page.locator(".datums-kacheln a").count();
}

test.describe("Buchungsregeln im Plan", () => {
  test("am letzten Vorlauftag ist nur bis zur jetzigen Uhrzeit frei (B11)", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    const vorlauf = (await tage(page)) - 1;
    test.skip(vorlauf < 1, "Kein Vorlauf eingestellt");

    // Die Datenbank rechnet in UTC: now() plus lead_days mal 24 Stunden.
    const grenze = berlin(new Date(Date.now() + vorlauf * 86_400_000));
    await page.locator(".datums-kacheln a").last().click();
    await page.waitForURL((u) => u.searchParams.get("tag") === grenze.tag);

    const labels = await page.locator(".plan-raster button.frei-slot").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")),
    );
    // Die Grenze darf zwischen dem Lesen der Uhr und dem Zeichnen nicht
    // weiterlaufen und dabei eine Halbstunde mitnehmen - eine Minute Luft.
    for (const label of labels) {
      expect(minuteAusLabel(label), label ?? "").toBeLessThanOrEqual(grenze.minuten + 1);
    }
  });

  test("ein Doppel mit einem Mitspieler sagt, dass einer fehlt (B12)", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.locator(".datums-kacheln a").nth(2).click();
    await page.waitForURL((u) => u.searchParams.has("tag"));

    const freieZelle = page.locator(".plan-raster button.frei-slot").first();
    test.skip((await freieZelle.count()) === 0, "Kein freier Slot an diesem Tag");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await expect(fenster).toBeVisible();
    const doppel = fenster.getByRole("radio", { name: "Doppel" });
    test.skip((await doppel.count()) === 0, "Keine Spielform Doppel");
    await doppel.check();

    await (await suchfeld(fenster)).fill("a");
    await fenster.locator(".trefferliste li").first().locator("button").click();
    await expect(fenster.locator(".marken li")).toHaveCount(1);

    // Vorher liess der Knopf das zu, und erst die Datenbank lehnte ab.
    const knopf = fenster.getByRole("button", { name: /buchen/i });
    await expect(knopf).toBeDisabled();
    await expect(fenster.locator(".fussnote")).toContainText("es fehlt noch ein Mitspieler");

    // Wer Mitspieler sucht, darf unterbesetzt buchen - wie create_booking.
    await fenster.getByRole("switch").check();
    await expect(knopf).toBeEnabled();
    await expect(fenster.locator(".fussnote")).toHaveText("Stornieren geht bis Spielbeginn");
  });

  test("eine begonnene Buchung bietet kein Stornieren mehr an (B13)", async ({ page }) => {
    // Die Uhr im Browser laeuft vor, damit die Buchung beginnt, ohne dass der
    // Test eine halbe Stunde wartet. Gebucht wird mit echter Zeit.
    await page.clock.install();
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");

    const freieZelle = page.locator(".plan-raster button.frei-slot").first();
    test.skip((await freieZelle.count()) === 0, "Heute ist nichts mehr frei");
    const label = (await freieZelle.getAttribute("aria-label")) ?? "";
    const minute = minuteAusLabel(label);
    const platz = label.replace(/ um .*$/, "");
    await freieZelle.click();

    const fenster = page.locator("dialog.fenster");
    await (await suchfeld(fenster)).fill("e");
    await fenster.locator(".trefferliste li").first().locator("button").click();
    await fenster.getByRole("button", { name: /buchen/i }).click();
    const rueckmeldung = page.locator(".hinweis").first();
    await expect(rueckmeldung).toBeVisible({ timeout: 15_000 });
    test.skip(!((await rueckmeldung.textContent()) ?? "").includes("gebucht"), "Buchung abgelehnt");

    const uhrzeit = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const eigene = page.getByRole("button", { name: `Buchung ${uhrzeit} auf ${platz} verwalten` });
    const bookingId = await buchungsId(minute);

    try {
      // Vor Beginn: Stornieren wird angeboten.
      await eigene.click();
      await expect(fenster.getByRole("button", { name: "Buchung stornieren" })).toBeVisible();
      await page.keyboard.press("Escape");

      // Bis kurz nach Beginn vorspulen. In zwei Schritten mit einem Klick
      // dazwischen, sonst meldet die Inaktivitaet nach 30 Minuten ab. Die
      // Uhr des Plans tickt einmal je Minute, daher die Minute obendrauf.
      const bisBeginn = (minute - berlin(new Date(await page.evaluate(() => Date.now()))).minuten) * 60_000;
      test.skip(bisBeginn > 50 * 60_000, "Die nächste freie Zeit liegt zu weit weg");
      await page.clock.fastForward(Math.max(Math.floor(bisBeginn / 2), 0));
      await page.mouse.click(5, 5);
      await page.clock.fastForward(Math.ceil(bisBeginn / 2) + 61_000);
      await page.mouse.click(5, 5);

      await eigene.click();
      await expect(fenster).toBeVisible();
      await expect(fenster).toContainText("Die Spielzeit läuft bereits");
      await expect(fenster.getByRole("button", { name: "Buchung stornieren" })).toHaveCount(0);
      await expect(fenster.getByRole("button", { name: "Mitspieler speichern" })).toHaveCount(0);
    } finally {
      // Die Datenbank rechnet mit echter Zeit: dort hat die Buchung noch
      // nicht begonnen, der Bucher kann sie also selbst wieder stornieren.
      if (bookingId) await stornieren(bookingId);
    }
  });
});

/** Als Testmitglied angemeldet an der Datenbank - fuer Nachschlagen und Aufraeumen. */
async function alsMitglied() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: NUTZER.mitglied, password: PASSWORT });
  expect(error).toBeNull();
  return supabase;
}

/** Die Id der eigenen Buchung um diese Minute heute, aus my_bookings. */
async function buchungsId(minute: number): Promise<string | null> {
  const { data } = await (await alsMitglied()).rpc("my_bookings", {});
  const heute = berlin(new Date()).tag;
  const zeilen = (data ?? []) as { booking_id: string; starts_at: string; bin_bucher: boolean }[];
  const treffer = zeilen.find((b) => {
    const s = berlin(new Date(b.starts_at));
    return b.bin_bucher && s.tag === heute && s.minuten === minute;
  });
  return treffer?.booking_id ?? null;
}

async function stornieren(bookingId: string): Promise<void> {
  const { error } = await (await alsMitglied()).rpc("cancel_booking", { p_booking_id: bookingId });
  expect(error).toBeNull();
}
