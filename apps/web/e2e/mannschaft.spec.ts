import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { MANNSCHAFT_TEXT } from "@tcm/core";
import { anmelden, MITGLIED_ID, NUTZER, PASSWORT } from "./hilfen";
import { istLokalerStack, sqlLokal } from "./lokale-db";

/**
 * Konto › Mannschaft (Vereinsentscheidung vom 02.11.2026)
 *
 * Das Testmitglied führt im Seed "Herren 30" (supabase/seed.sql). Es lädt das
 * Admin-Konto ein, der Admin nimmt mit Telefon-Häkchen an, der MF sieht die
 * Nummer und trägt ihn wieder aus. Der Admin ist hier nur Mitglied: seine
 * Rechte spielen beim Annehmen keine Rolle.
 *
 * Mannschaft, Telefon und Einladungen des Admins setzt der Test vorher per
 * psql auf einen festen Stand und schreibt sie am Ende zurück.
 */

const NUMMER = "0171 5550123";

type Stand = {
  first_name: string;
  last_name: string;
  team_id: string | null;
  is_team_captain: boolean;
  mobile: string | null;
  team_phone_visible: boolean;
};

async function client(email: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORT });
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

function sqlText(wert: string | null): string {
  return wert === null ? "null" : `'${wert.replace(/'/g, "''")}'`;
}

/** Einladungen an den Admin weg, damit jeder Lauf bei null anfängt. */
const EINLADUNGEN_WEG = `delete from public.team_invitations where member_id = '${MITGLIED_ID.admin}';`;

async function neueSeite(browser: Browser, email: string): Promise<Page> {
  const kontext = await browser.newContext();
  const page = await kontext.newPage();
  await anmelden(page, email);
  return page;
}

test.describe("Konto › Mannschaft", () => {
  test.skip(!NUTZER.mitglied || !NUTZER.admin || !PASSWORT, "Testkonten fehlen in .env.local");
  test.skip(!istLokalerStack(), "setzt den Stand per psql, nur gegen den lokalen Stack");

  test("MF lädt ein, Mitglied nimmt mit Telefon an, MF sieht die Nummer und trägt aus", async ({ browser }) => {
    const admin = await client(NUTZER.admin);
    const { data, error } = await admin
      .from("members")
      .select("first_name, last_name, team_id, is_team_captain, mobile, team_phone_visible")
      .eq("id", MITGLIED_ID.admin)
      .single();
    expect(error).toBeNull();
    const vorher = data as Stand;
    const name = `${vorher.first_name} ${vorher.last_name}`;

    // Fester Ausgangsstand: ohne Mannschaft, mit Mobilnummer, ohne Einladung.
    sqlLokal(
      `${EINLADUNGEN_WEG}
       update public.members set team_id = null, is_team_captain = false, team_phone_visible = false,
              mobile = ${sqlText(NUMMER)} where id = '${MITGLIED_ID.admin}';`,
      "Ausgangsstand für den Admin ließ sich nicht setzen",
    );

    const mitglied = await client(NUTZER.mitglied);
    const { data: mm } = await mitglied.rpc("meine_mannschaft");
    expect((mm as { ich_bin_mf?: boolean; name?: string } | null)?.ich_bin_mf, "Testmitglied ist im Seed MF").toBe(true);
    const mannschaft = (mm as { name: string }).name;

    const mf = await neueSeite(browser, NUTZER.mitglied);
    const eingeladener = await neueSeite(browser, NUTZER.admin);

    try {
      // --- MF lädt ein ---------------------------------------------------
      await mf.goto("/konto");
      await mf.getByRole("link", { name: /^Mannschaft/ }).click();
      await mf.waitForURL(/\/konto\/mannschaft/);
      await mf.getByLabel(MANNSCHAFT_TEXT.sucheLabel).fill(vorher.last_name);
      const kandidat = mf.getByTestId("kandidat").filter({ hasText: name });
      await expect(kandidat).toBeVisible();
      await kandidat.getByRole("button", { name: "Einladen" }).click();
      await expect(mf.locator(".hinweis.toast.erfolg")).toHaveText("Eingeladen.");
      await expect(mf.getByTestId("offene-einladung").filter({ hasText: name })).toBeVisible();
      await expect(kandidat.getByRole("button", { name: "Eingeladen" })).toBeDisabled();

      // --- Mitglied nimmt an, mit Telefon --------------------------------
      await eingeladener.goto("/konto");
      await expect(eingeladener.getByRole("link", { name: /^Mannschaft/ })).toContainText("1 neue Einladung");
      await eingeladener.goto("/konto/mannschaft");
      const einladung = eingeladener.getByTestId("einladung").filter({ hasText: mannschaft });
      await expect(einladung).toContainText(`lädt dich in die Mannschaft ${mannschaft} ein.`);
      await einladung.getByRole("button", { name: "Annehmen" }).click();
      const haken = einladung.getByLabel(MANNSCHAFT_TEXT.telefonZustimmung);
      await expect(haken).not.toBeChecked();
      await haken.check();
      await einladung.getByRole("button", { name: `In ${mannschaft} eintreten` }).click();
      await expect(eingeladener.locator(".hinweis.toast.erfolg")).toHaveText("Willkommen in der Mannschaft.");
      await expect(eingeladener.getByRole("list", { name: `Kader ${mannschaft}` })).toContainText(`${name} (du)`);

      // Konto › Tennis zeigt den Schalter angehakt.
      await eingeladener.goto("/konto/tennis");
      await expect(
        eingeladener.locator('section[aria-label="Mannschaft"]').getByLabel(MANNSCHAFT_TEXT.telefonZustimmung),
      ).toBeChecked();

      // --- MF sieht die Nummer -------------------------------------------
      await mf.reload();
      const zeile = mf.getByTestId("kader-zeile").filter({ hasText: name });
      await expect(zeile.getByRole("link", { name: NUMMER })).toHaveAttribute("href", "tel:01715550123");
      await expect(mf.getByTestId("offene-einladung").filter({ hasText: name })).toHaveCount(0);

      // --- MF trägt aus -------------------------------------------------
      await zeile.getByRole("button", { name: "Austragen" }).click();
      await expect(zeile).toContainText(MANNSCHAFT_TEXT.austragenFrage(name, mannschaft));
      await zeile.getByRole("group").getByRole("button", { name: "Austragen" }).click();
      await expect(mf.locator(".hinweis.toast.erfolg")).toHaveText("Ausgetragen.");
      await expect(mf.getByTestId("kader-zeile").filter({ hasText: name })).toHaveCount(0);

      // Ausgetragen heißt auch: Freigabe zurück auf aus.
      const { data: nachher } = await admin
        .from("members")
        .select("team_id, team_phone_visible")
        .eq("id", MITGLIED_ID.admin)
        .single();
      expect(nachher).toEqual({ team_id: null, team_phone_visible: false });
    } finally {
      await mf.context().close();
      await eingeladener.context().close();
      sqlLokal(
        `${EINLADUNGEN_WEG}
         update public.members set team_id = ${sqlText(vorher.team_id)}, is_team_captain = ${vorher.is_team_captain},
                team_phone_visible = ${vorher.team_phone_visible}, mobile = ${sqlText(vorher.mobile)}
          where id = '${MITGLIED_ID.admin}';`,
        "Stand des Admins ließ sich nicht zurückschreiben",
      );
    }
  });

  for (const schema of ["light", "dark"] as const) {
    test.describe(`axe, ${schema === "light" ? "hell" : "dunkel"}`, () => {
      test.use({ colorScheme: schema });

      test("Unterseite Mannschaft als Mannschaftsführer", async ({ page }) => {
        await anmelden(page, NUTZER.mitglied);
        await page.goto("/konto/mannschaft");
        await expect(page.getByRole("heading", { name: MANNSCHAFT_TEXT.hinzufuegenTitel })).toBeVisible();
        await axePruefen(page);
      });
    });
  }
});
