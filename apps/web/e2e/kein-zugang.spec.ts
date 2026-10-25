import { expect, test } from "@playwright/test";
import { anmelden, PASSWORT } from "./hilfen";
import { istLokalerStack, sqlLokal } from "./lokale-db";

/**
 * Kein Zugang mehr (B22)
 *
 * Ein Mitglied, dessen Austritt gestern war, kann sich anmelden, bekommt von
 * der Datenbank aber nichts mehr. Statt leerer Seiten sieht es den Hinweis
 * und ist danach abgemeldet - gleich nach der Anmeldung wie bei einer Sitzung,
 * die schon bestand, als der Austritt vorbeiging.
 *
 * Das Konto legt der Test selbst an (feste UUIDs) und räumt es danach weg,
 * vorher auch, falls ein abgebrochener Lauf es liegen gelassen hat. Über psql
 * am Zugang vorbei, wie die übrige Testvorbereitung; nur lokal.
 */

const AUTH = "e2e00000-0000-4000-8000-0000000000b2";
const MITGLIED = "e2e00000-0000-4000-8000-0000000000a2";
const EMAIL = "ausgetreten@tcm.local";

const wegraeumen = `
delete from public.memberships where member_id = '${MITGLIED}';
delete from public.member_roles where member_id = '${MITGLIED}';
delete from public.members where id = '${MITGLIED}';
delete from auth.identities where user_id = '${AUTH}';
delete from auth.users where id = '${AUTH}';
`;

function anlegen() {
  const passwort = PASSWORT.replace(/'/g, "''");
  sqlLokal(
    `begin;
${wegraeumen}
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '${AUTH}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${EMAIL}',
  extensions.crypt('${passwort}', extensions.gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), '${AUTH}', '${AUTH}', 'email',
        jsonb_build_object('sub', '${AUTH}', 'email', '${EMAIL}', 'email_verified', true), now(), now());
insert into public.members (id, auth_user_id, first_name, last_name, email)
values ('${MITGLIED}', '${AUTH}', 'Anton', 'Ausgetreten', '${EMAIL}');
insert into public.member_roles (member_id, role) values ('${MITGLIED}', 'member');
insert into public.memberships (member_id, number, started_on, status)
values ('${MITGLIED}', 'E2E-B22', current_date - 400, 'active');
commit;`,
    "Testkonto für B22 ließ sich nicht anlegen",
  );
}

/** Austritt gestern, wie end_membership ihn einträgt. */
function austrittGestern() {
  sqlLokal(
    `update public.memberships set ended_on = current_date - 1, status = 'ended'
      where member_id = '${MITGLIED}';
     update public.members set status = 'inactive' where id = '${MITGLIED}';`,
    "Austritt für B22 ließ sich nicht eintragen",
  );
}

test.describe("Kein Zugang mehr", () => {
  test.skip(!istLokalerStack(), "legt ein Konto per psql an, nur gegen den lokalen Stack");

  test.beforeEach(() => anlegen());
  test.afterAll(() => sqlLokal(wegraeumen, "Testkonto für B22 ließ sich nicht wegräumen"));

  test("wer gestern ausgetreten ist, sieht nach der Anmeldung den Hinweis und ist abgemeldet", async ({ page }) => {
    austrittGestern();
    await anmelden(page, EMAIL);

    await expect(page).toHaveURL(/\/kein-zugang\?grund=ausgetreten$/);
    await expect(page.getByRole("heading", { name: "Kein Zugang mehr" })).toBeVisible();
    await expect(page.getByText("Deine Mitgliedschaft ist beendet.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vorstand kontaktieren" })).toHaveAttribute(
      "href",
      "/impressum#kontakt",
    );

    // Abgemeldet: der Plan führt zur Anmeldung, nicht auf eine leere Seite.
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/login/);
  });

  test("eine bestehende Sitzung endet beim nächsten Seitenaufruf", async ({ page }) => {
    await anmelden(page, EMAIL);
    await expect(page).not.toHaveURL(/kein-zugang/);

    austrittGestern();
    await page.goto("/plan");

    await expect(page).toHaveURL(/\/kein-zugang\?grund=ausgetreten$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
