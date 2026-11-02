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
 * Der lokale Stack wird von anderen Spuren mitbenutzt. Der Seed gibt dem
 * Admin eine offene Einladung in "Herren", die beim Annehmen geschlossen
 * wird. Deshalb sichert der Test Mannschaft, Telefon und Einladungen des
 * Admins vorher, schreibt sie am Ende genau so zurück und löscht nur, was
 * der Lauf selbst angelegt hat (Einladung, Benachrichtigungen).
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

type Einladung = { id: string; team_id: string; status: string; answered_at: string | null; expires_at: string };

const MANNSCHAFTS_ARTEN = "('team_invited', 'team_invitation_answered', 'team_removed', 'team_left')";

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
    // Zwei Konten, gut ein Dutzend Seitenaufrufe: mehr als die üblichen 45 s.
    test.setTimeout(180_000);
    const admin = await client(NUTZER.admin);
    const { data, error } = await admin
      .from("members")
      .select("first_name, last_name, team_id, is_team_captain, mobile")
      .eq("id", MITGLIED_ID.admin)
      .single();
    expect(error).toBeNull();
    // team_phone_visible hat keinen Spalten-Grant; den Stand liefert meine_mannschaft().
    const { data: adminMannschaft } = await admin.rpc("meine_mannschaft");
    const vorher = {
      ...(data as Omit<Stand, "team_phone_visible">),
      team_phone_visible: (adminMannschaft as { telefon_sichtbar?: boolean } | null)?.telefon_sichtbar === true,
    };
    const name = `${vorher.first_name} ${vorher.last_name}`;

    const { data: einladungenDaten, error: einladungenFehler } = await admin
      .from("team_invitations")
      .select("id, team_id, status, answered_at, expires_at")
      .eq("member_id", MITGLIED_ID.admin);
    expect(einladungenFehler).toBeNull();
    const einladungenVorher = (einladungenDaten ?? []) as Einladung[];
    const start = new Date(Date.now() - 5_000).toISOString();

    const mitglied = await client(NUTZER.mitglied);
    const { data: mm } = await mitglied.rpc("meine_mannschaft");
    const mmStand = mm as { ich_bin_mf?: boolean; name?: string; team_id?: string } | null;
    expect(mmStand?.ich_bin_mf, "Testmitglied ist im Seed MF").toBe(true);
    const mannschaft = mmStand!.name!;
    const teamId = mmStand!.team_id!;
    // Eine alte Einladung in diese Mannschaft (abgebrochener Lauf) stünde im Weg.
    expect(einladungenVorher.filter((e) => e.team_id === teamId && e.status === "offen")).toEqual([]);

    // Fester Ausgangsstand: ohne Mannschaft, mit Mobilnummer.
    sqlLokal(
      `update public.members set team_id = null, is_team_captain = false, team_phone_visible = false,
              mobile = ${sqlText(NUMMER)} where id = '${MITGLIED_ID.admin}';`,
      "Ausgangsstand für den Admin ließ sich nicht setzen",
    );

    const kontexte: Page[] = [];

    try {
      const mf = await neueSeite(browser, NUTZER.mitglied);
      kontexte.push(mf);
      const eingeladener = await neueSeite(browser, NUTZER.admin);
      kontexte.push(eingeladener);

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
      await expect(eingeladener.getByRole("link", { name: /^Mannschaft/ })).toContainText("neue Einladung");
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
      // Ohne Mannschaft liefert meine_mannschaft() null; der Trigger setzt die Freigabe zurück.
      const { data: nachher } = await admin.rpc("meine_mannschaft");
      expect(nachher).toBeNull();
    } finally {
      // Erst die Daten zurück, dann die Browser: nach einem Timeout schlägt
      // das Schließen fehl, und der geteilte Stack bliebe verändert.
      const bekannte = einladungenVorher.map((e) => `'${e.id}'`).join(", ") || "null";
      const zurueck = einladungenVorher
        .map(
          (e) =>
            `update public.team_invitations set status = ${sqlText(e.status)}, answered_at = ${sqlText(e.answered_at)},
                    expires_at = ${sqlText(e.expires_at)} where id = '${e.id}';`,
        )
        .join("\n");
      sqlLokal(
        `delete from public.team_invitations
          where member_id = '${MITGLIED_ID.admin}' and id not in (${bekannte});
         ${zurueck}
         delete from public.notifications
          where kind in ${MANNSCHAFTS_ARTEN} and created_at >= '${start}'
            and member_id in ('${MITGLIED_ID.admin}', '${MITGLIED_ID.mitglied}');
         update public.members set team_id = ${sqlText(vorher.team_id)}, is_team_captain = ${vorher.is_team_captain},
                team_phone_visible = ${vorher.team_phone_visible}, mobile = ${sqlText(vorher.mobile)}
          where id = '${MITGLIED_ID.admin}';`,
        "Stand des Admins ließ sich nicht zurückschreiben",
      );
      for (const seite of kontexte) await seite.context().close().catch(() => {});
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
