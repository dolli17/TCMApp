import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { anmelden, mitspielerWaehlen, MITSPIELER, NUTZER, oeffneFreieStunde, PASSWORT, tagIn } from "./hilfen";

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

/*
 * Feste Termine im Fenster, das der Seed frei hält (T3, siehe ablaeufe.spec.ts):
 *   Tag +2  Platz 4 11:00  Doppel mit einem Mitspieler (ohne Buchung)
 *           Platz 3 11:00  begonnene Buchung
 */

/** Die Tage, die der Plan als Kacheln anbietet - heute plus lead_days. */
async function tage(page: Page): Promise<number> {
  return page.locator(".datums-kacheln a").count();
}

test.describe("Buchungsregeln im Plan", () => {
  test("am letzten Vorlauftag ist nur bis zur jetzigen Uhrzeit frei (B11)", async ({ page }) => {
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    // Sieben Tage aus dem Seed; das globalSetup stellt den Wert wieder her.
    const vorlauf = (await tage(page)) - 1;
    expect(vorlauf).toBe(7);

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
    const fenster = await oeffneFreieStunde(page, tagIn(2), "Platz 4", "11:00");
    await fenster.getByRole("radio", { name: "Doppel" }).check();

    await mitspielerWaehlen(fenster, MITSPIELER.mia);
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
    // Gebucht wird mit echter Zeit auf einen festen Termin uebermorgen. Danach
    // springt nur die Uhr im Browser auf eine Minute nach Beginn - der Test
    // haengt so nicht mehr davon ab, ob heute noch etwas frei ist.
    const tag = tagIn(2);
    const platz = "Platz 3";
    const uhrzeit = "11:00";

    await anmelden(page, NUTZER.mitglied);
    const fenster = await oeffneFreieStunde(page, tag, platz, uhrzeit);
    await mitspielerWaehlen(fenster, MITSPIELER.max);
    await fenster.getByRole("button", { name: /buchen/i }).click();
    await expect(page.locator(".hinweis.erfolg")).toContainText("gebucht", { timeout: 15_000 });

    const buchung = await eigeneBuchung(tag, minuteAusLabel(uhrzeit));
    expect(buchung, "Die Buchung steht nicht in my_bookings").not.toBeNull();
    const eigene = page.getByRole("button", { name: `Buchung ${uhrzeit} auf ${platz} verwalten` });

    try {
      // Vor Beginn: Stornieren wird angeboten.
      await eigene.click();
      await expect(fenster.getByRole("button", { name: "Buchung stornieren" })).toBeVisible();
      await page.keyboard.press("Escape");

      // Die Browser-Uhr eine Minute nach Beginn. Der Aktivitaetsstempel zieht
      // mit, sonst saehe der Browser zwei Tage Pause und meldete ab.
      const jetzt = new Date(buchung!.startsAt).getTime() + 60_000;
      await page.clock.install({ time: jetzt });
      await page.context().addCookies([
        { name: "tcm_aktiv", value: String(jetzt), url: new URL(page.url()).origin },
      ]);
      await page.goto(`/plan?tag=${tag}`);
      // Der Plan startet mit der Zeit des Servers und folgt der Uhr des
      // Browsers erst mit seinem Minutentakt - also eine Minute weiter.
      await page.clock.fastForward(61_000);
      await page.mouse.click(5, 5);

      await eigene.click();
      await expect(fenster).toBeVisible();
      await expect(fenster).toContainText("Die Spielzeit läuft bereits");
      await expect(fenster.getByRole("button", { name: "Buchung stornieren" })).toHaveCount(0);
      await expect(fenster.getByRole("button", { name: "Mitspieler speichern" })).toHaveCount(0);
    } finally {
      // Die Datenbank rechnet mit echter Zeit: dort hat die Buchung noch
      // nicht begonnen, der Bucher kann sie also selbst wieder stornieren.
      if (buchung) await stornieren(buchung.id);
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

/** Die eigene Buchung an diesem Tag zu dieser Minute, aus my_bookings. */
async function eigeneBuchung(tag: string, minute: number): Promise<{ id: string; startsAt: string } | null> {
  const { data } = await (await alsMitglied()).rpc("my_bookings", {});
  const zeilen = (data ?? []) as { booking_id: string; starts_at: string; bin_bucher: boolean }[];
  const treffer = zeilen.find((b) => {
    const s = berlin(new Date(b.starts_at));
    return b.bin_bucher && s.tag === tag && s.minuten === minute;
  });
  return treffer ? { id: treffer.booking_id, startsAt: treffer.starts_at } : null;
}

async function stornieren(bookingId: string): Promise<void> {
  const { error } = await (await alsMitglied()).rpc("cancel_booking", { p_booking_id: bookingId });
  expect(error).toBeNull();
}
