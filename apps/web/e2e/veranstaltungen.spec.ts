import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anmelden, NUTZER, PASSWORT, testName } from "./hilfen";

/**
 * Veranstaltungen in der Verwaltung: anlegen, Anmeldungen mit Forderung,
 * Korrektur, Absage, Arbeitsdienst mit Anwesenheit und Stunden.
 *
 * In der Verwaltung meldet sich das Testmitglied direkt ueber die RPC an -
 * dieselbe, die Web und App aufrufen. Der Durchlauf fuer Mitglieder unter
 * /verein/veranstaltungen steht unten.
 */

/** Ein Supabase-Client, angemeldet als dieses Konto. */
async function alsKonto(email: string): Promise<SupabaseClient> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORT });
  if (error) throw error;
  return supabase;
}

/** "2026-11-06T19:00" in n Tagen, wie ein datetime-local-Feld es erwartet. */
function inTagen(n: number, uhr = "19:00"): string {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" })
    .format(new Date(Date.now() + n * 86_400_000));
  return `${tag}T${uhr}`;
}

async function anlegen(page: Page, felder: {
  art: "Fest" | "Arbeitsdienst" | "Termin";
  titel: string;
  beginn: string;
  ende?: string;
  schluss?: string;
  plaetze?: string;
  preis?: string;
  stunden?: string;
}) {
  await page.goto("/admin/veranstaltungen/neu");
  await page.getByRole("button", { name: felder.art, exact: true }).click();
  await page.getByLabel("Titel").fill(felder.titel);
  await page.getByLabel("Beginn", { exact: true }).fill(felder.beginn);
  if (felder.ende) await page.getByLabel("Ende", { exact: true }).fill(felder.ende);
  await page.getByLabel("Ort").fill("Clubhaus");
  if (felder.schluss) await page.getByLabel("Anmeldeschluss").fill(felder.schluss);
  if (felder.plaetze) await page.getByLabel("Plätze höchstens").fill(felder.plaetze);
  if (felder.stunden) await page.getByLabel("Stunden je Teilnahme").fill(felder.stunden);
  if (felder.preis) {
    await page.getByLabel("Es wird eine Gebühr fällig").check();
    await page.getByLabel("Preis pro Person (€)").fill(felder.preis);
  }
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await page.waitForURL(/\/admin\/veranstaltungen\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  return page.url().split("/").pop()!;
}

test.describe("Veranstaltungen verwalten", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Fest mit Gebühr: Anmeldung erzeugt die Forderung, Korrektur zieht mit, Absage löscht sie", async ({ page }) => {
    const titel = testName("Fest");
    await anmelden(page, NUTZER.admin);
    const id = await anlegen(page, {
      art: "Fest", titel, beginn: inTagen(20), ende: inTagen(20, "23:30"),
      schluss: inTagen(15, "23:59"), plaetze: "10", preis: "12,50",
    });

    await expect(page.getByRole("heading", { level: 1, name: titel })).toBeVisible();
    await expect(page.getByText("Anmeldung offen")).toBeVisible();

    // Das Mitglied meldet sich mit einer Begleitperson an.
    const mitglied = await alsKonto(NUTZER.mitglied);
    const { data: status, error } = await mitglied.rpc("event_anmelden", {
      p_event_id: id, p_companions: 1, p_note: "vegetarisch",
    });
    expect(error).toBeNull();
    expect(status).toBe("registered");

    // Im Konto steht die Forderung sofort unter Offen.
    const { data: forderung } = await mitglied
      .from("charges").select("amount_cents, kind, status").eq("event_id", id).single();
    expect(forderung).toMatchObject({ amount_cents: 2500, kind: "event", status: "open" });

    const { data: profil } = await mitglied
      .from("members").select("first_name, last_name").eq("email", NUTZER.mitglied).single();
    await page.reload();
    const zeile = page.locator("tr", { hasText: `${profil!.last_name}, ${profil!.first_name}` });
    await expect(zeile).toContainText("vegetarisch");
    await expect(zeile).toContainText("2");
    await expect(zeile).toContainText("25,00");

    // Der Vorstand korrigiert: keine Begleitperson.
    await zeile.getByRole("button", { name: /ändern$/ }).click();
    await zeile.getByLabel(/^Begleitpersonen von/).fill("0");
    await page.getByRole("button", { name: "Sichern" }).click();
    await expect(page.getByRole("status")).toContainText("Geändert");
    await expect(zeile).toContainText("12,50");

    // Vor dem Anmeldeschluss steht das Fest noch nicht im Einzug.
    await page.goto("/admin/kasse/einzug");
    await expect(page.getByText(titel)).toHaveCount(0);

    // Die Liste zeigt das Fest unter Kommend.
    await page.goto("/admin/veranstaltungen");
    const listenzeile = page.getByRole("link", { name: new RegExp(titel) });
    await expect(listenzeile).toContainText("1 von 10");

    // Export als CSV.
    await page.goto(`/admin/veranstaltungen/${id}`);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Liste exportieren" }).click();
    const datei = await download;
    expect(datei.suggestedFilename()).toMatch(/\.csv$/);

    // Absagen löscht die offene Forderung.
    await page.getByRole("button", { name: "Absagen" }).click();
    await page.getByRole("button", { name: "Ja, absagen" }).click();
    await expect(page.getByRole("status")).toContainText("Abgesagt");
    await expect(page.getByText("Abgesagt", { exact: true })).toBeVisible();
    const { data: danach } = await mitglied.from("charges").select("id").eq("event_id", id);
    expect(danach ?? []).toHaveLength(0);
  });

  test("Arbeitsdienst: Anwesende abhaken und Stunden gutschreiben, einmal", async ({ page }) => {
    const titel = testName("Dienst");
    const admin = await alsKonto(NUTZER.admin);
    const mitglied = await alsKonto(NUTZER.mitglied);
    const { data: profil } = await mitglied
      .from("members").select("id, first_name, last_name").eq("email", NUTZER.mitglied).single();
    expect(profil).toBeTruthy();

    await anmelden(page, NUTZER.admin);
    const id = await anlegen(page, {
      art: "Arbeitsdienst", titel, beginn: inTagen(-1, "09:00"), ende: inTagen(-1, "13:00"), stunden: "3",
    });
    await expect(page.getByText("Stunden gutschreiben").first()).toBeVisible();

    // Spontan mitgeholfen: der Vorstand trägt nach.
    await page.getByLabel("Mitglied nachtragen").fill(`${profil!.last_name}, ${profil!.first_name}`);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Angemeldet");

    await page.getByLabel(`${profil!.last_name}, ${profil!.first_name} war da`).check();
    await expect(page.getByRole("status")).toContainText("anwesend");

    await page.getByRole("button", { name: "Stunden gutschreiben" }).click();
    await expect(page.getByRole("status")).toContainText("Einem Mitglied sind die Stunden gutgeschrieben");
    await expect(page.getByRole("button", { name: "Stunden gutschreiben" })).toBeDisabled();

    const { data: eintraege } = await admin
      .from("work_duty_entries").select("id, hours, confirmed_at").eq("event_id", id);
    expect(eintraege).toHaveLength(1);
    expect(Number(eintraege![0]!.hours)).toBe(3);

    // Aufräumen: Stunden wieder entfernen, Dienst absagen.
    await admin.rpc("delete_work_duty", { p_entry_id: eintraege![0]!.id });
    await admin.rpc("event_absagen", { p_id: id });
  });

  test("Mitglieder sehen keine Verwaltung und keine Namen", async ({ page }) => {
    const mitglied = await alsKonto(NUTZER.mitglied);
    const { error } = await mitglied.rpc("event_verwaltung");
    expect(error).toBeNull();
    const { data } = await mitglied.rpc("event_verwaltung");
    expect(data ?? []).toHaveLength(0);

    await anmelden(page, NUTZER.mitglied);
    await page.goto("/admin/veranstaltungen");
    await expect(page.getByText("Dieser Bereich der Verwaltung ist dem Vorstand und den App Admins vorbehalten.")).toBeVisible();
  });
});

test.describe("Veranstaltungen für Mitglieder", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("anmelden mit Begleitperson, ändern, Forderung im Konto, abmelden", async ({ page }) => {
    const titel = testName("Sommerfest");
    const admin = await alsKonto(NUTZER.admin);
    const beginn = new Date(Date.now() + 20 * 86_400_000);
    beginn.setUTCHours(17, 0, 0, 0);
    const { data: id, error } = await admin.rpc("event_speichern", {
      p_id: null as unknown as string,
      p_kind: "fest",
      p_title: titel,
      p_description: "Mit Grill und Musik.",
      p_location: "Clubhaus",
      p_starts_at: beginn.toISOString(),
      p_ends_at: new Date(beginn.getTime() + 4 * 3_600_000).toISOString(),
      p_registration_enabled: true,
      p_registration_deadline: new Date(beginn.getTime() - 5 * 86_400_000).toISOString(),
      p_max_participants: 10,
      p_companions_allowed: true,
      p_fee_cents: 1250,
      p_work_hours: null as unknown as number,
      p_veroeffentlichen: true,
    });
    expect(error).toBeNull();

    try {
      await anmelden(page, NUTZER.mitglied);

      // Ohne gemerkten Reiter führt "Verein" zu den Getränken.
      await page.goto("/verein");
      await expect(page).toHaveURL(/\/verein\/getraenke$/);
      await page.getByRole("navigation", { name: "Bereich" }).getByRole("link", { name: "Veranstaltungen" }).click();
      await expect(page).toHaveURL(/\/verein\/veranstaltungen$/);

      const karte = page.getByRole("link", { name: new RegExp(titel) });
      await expect(karte).toContainText("noch 10 Plätze frei");
      await karte.click();
      await expect(page.getByRole("heading", { level: 1, name: titel })).toBeVisible();
      await expect(page.getByText("0 angemeldet · noch 10 frei")).toBeVisible();
      await expect(page.getByText(/danach kostet die Abmeldung trotzdem/)).toBeVisible();

      // Anmelden mit einer Begleitperson
      await page.getByRole("button", { name: "Eine Begleitperson mehr" }).click();
      await page.getByLabel("Bemerkung").fill("vegetarisch");
      await page.getByRole("button", { name: /^Verbindlich anmelden · 25,00/ }).click();
      await expect(page.locator(".hinweis[role=status]")).toContainText("Du bist angemeldet");
      await expect(page.getByText("Du + 1 Begleitperson")).toBeVisible();
      await expect(page.getByText("2 angemeldet · noch 8 frei")).toBeVisible();
      await expect(page.locator(".event-mein .betrag")).toContainText("25,00");

      // Begleitperson wieder streichen
      await page.getByRole("button", { name: "Anmeldung ändern" }).click();
      await page.getByRole("button", { name: "Eine Begleitperson weniger" }).click();
      await page.getByRole("button", { name: /^Änderung sichern/ }).click();
      await expect(page.locator(".hinweis[role=status]")).toContainText("geändert");
      await expect(page.getByText("Du allein")).toBeVisible();
      await expect(page.locator(".event-mein .betrag")).toContainText("12,50");

      // Im Konto unter den offenen Forderungen
      await page.goto("/konto");
      const forderung = page.locator("li.forderung", { hasText: titel });
      await expect(forderung).toContainText("Veranstaltung");
      await expect(forderung).toContainText("12,50");

      // "Verein" merkt sich den Reiter; die Startseite zeigt den Stand.
      await page.goto("/verein");
      await expect(page).toHaveURL(/\/verein\/veranstaltungen$/);
      await expect(page.getByRole("link", { name: new RegExp(titel) })).toContainText("Angemeldet");
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Demnächst im Verein" })).toBeVisible();

      // Abmelden vor dem Anmeldeschluss: kostenlos, die Forderung ist weg.
      await page.goto(`/verein/veranstaltungen/${id}`);
      await page.getByRole("button", { name: /^Abmelden \(bis .* kostenlos\)/ }).click();
      await page.getByRole("button", { name: "Ja, abmelden" }).click();
      await expect(page.locator(".hinweis[role=status]")).toContainText("abgemeldet");
      await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();

      const mitglied = await alsKonto(NUTZER.mitglied);
      const { data: rest } = await mitglied.from("charges").select("id").eq("event_id", id!);
      expect(rest ?? []).toHaveLength(0);
    } finally {
      await admin.rpc("event_absagen", { p_id: id! });
    }
  });
});

test.describe("Nachrichten zu Veranstaltungen", () => {
  test.skip(!NUTZER.admin || !NUTZER.mitglied || !PASSWORT, "Testkonten fehlen in .env.local");

  test("Veröffentlichen erreicht Mitglieder, Verlegen und Absage die Angemeldeten, mit Link", async ({ page }) => {
    const titel = testName("Nachrichtenfest");
    const mitglied = await alsKonto(NUTZER.mitglied);
    const admin = await alsKonto(NUTZER.admin);
    const nachrichten = async () => {
      const { data } = await mitglied.rpc("my_notifications", { p_limit: 100 });
      return (data ?? []).filter((n) => n.title.endsWith(titel));
    };

    // Veröffentlichen mit dem Haken (Vorgabe an)
    await anmelden(page, NUTZER.admin);
    await page.goto("/admin/veranstaltungen/neu");
    await expect(page.getByLabel("Mitglieder beim Veröffentlichen benachrichtigen")).toBeChecked();
    const id = await anlegen(page, { art: "Fest", titel, beginn: inTagen(21), schluss: inTagen(14, "23:59") });

    let liste = await nachrichten();
    expect(liste.map((n) => n.kind)).toEqual(["event_published"]);
    expect(liste[0]!.event_id).toBe(id);
    expect(liste[0]!.title).toBe(`Neu im Verein: ${titel}`);

    // Angemeldet, dann verlegt: eine Nachricht, erneutes Speichern keine zweite.
    await mitglied.rpc("event_anmelden", { p_event_id: id, p_companions: 0 });
    const { data: e } = await admin.from("events").select("*").eq("id", id).single();
    const speichern = (ort: string) => admin.rpc("event_speichern", {
      p_id: id, p_kind: e!.kind, p_title: e!.title, p_description: e!.description as string,
      p_location: ort, p_starts_at: e!.starts_at, p_ends_at: e!.ends_at as string,
      p_registration_enabled: e!.registration_enabled, p_registration_deadline: e!.registration_deadline as string,
      p_max_participants: e!.max_participants as number, p_companions_allowed: e!.companions_allowed,
      p_fee_cents: e!.fee_cents as number, p_work_hours: e!.work_hours as number,
    });
    expect((await speichern("Halle")).error).toBeNull();
    expect((await speichern("Halle")).error).toBeNull();
    liste = await nachrichten();
    expect(liste.filter((n) => n.kind === "event_changed")).toHaveLength(1);

    // Absage über die Verwaltung
    await page.goto(`/admin/veranstaltungen/${id}`);
    await page.getByRole("button", { name: "Absagen" }).click();
    await page.getByRole("button", { name: "Ja, absagen" }).click();
    await expect(page.getByRole("status")).toContainText("Abgesagt");

    // Das Mitglied findet die Absage unter der Glocke und kommt zur Veranstaltung.
    await anmelden(page, NUTZER.mitglied);
    await page.goto("/plan");
    await page.locator(".seitenkopf button.glocke").click();
    const eintrag = page.locator("dialog.fenster .nachrichtenliste li", { hasText: `Abgesagt: ${titel}` });
    await expect(eintrag).toContainText("faellt aus");
    await eintrag.getByRole("link", { name: "Zur Veranstaltung" }).click();
    await expect(page).toHaveURL(new RegExp(`/verein/veranstaltungen/${id}$`));
    await expect(page.getByText("Diese Veranstaltung ist abgesagt.")).toBeVisible();
  });
});
