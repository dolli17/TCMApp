import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Die beiden Onboarding-Konten des Seeds zurücksetzen (neu@, kind@).
 *
 * Die Onboarding-Tests schließen die Einrichtung wirklich ab, und auch die
 * App (apps/mobile) testet mit denselben Konten gegen dieselbe lokale
 * Datenbank. Statt sich auf den Seed-Zustand zu verlassen, stellt dieser
 * Schritt ihn vor jedem Lauf wieder her: kein Mandat, keine Zustimmungen,
 * keine Erziehungsberechtigten, Onboarding offen.
 *
 * Über psql im Datenbank-Container, als postgres: der Dienstschlüssel hat auf
 * members bewusst kein SELECT, und genau das hier ist Testvorbereitung, keine
 * Anwendungslogik. Nur gegen den lokalen Stack.
 */

const WURZEL = resolve(__dirname, "../../..");

const SQL = `
begin;
create temp table ziel on commit drop as
  select id from public.members where email in ('neu@tcm.local', 'kind@tcm.local');
delete from public.sepa_mandates where member_id in (select id from ziel);
delete from public.bank_accounts where member_id in (select id from ziel);
delete from public.member_consents where member_id in (select id from ziel);
delete from public.member_attribute_values v using public.member_attribute_types t
 where t.id = v.attribute_type_id and v.member_id in (select id from ziel)
   and t.code in ('foto', 'newsletter', 'whatsapp', 'mannschaft_interesse', 'booking_mail');
update public.members set
  onboarding_completed_at = null, onboarding_stammdaten_at = null,
  guardian_name = null, guardian_email = null, guardian_phone = null, guardian_consent_at = null,
  emergency_contact_name = null, emergency_contact_phone = null, emergency_contact_relation = null,
  tennis_lk = null, nuliga_id = null
 where id in (select id from ziel);
commit;
`;

export default async function onboardingZuruecksetzen(): Promise<void> {
  const adresse = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(adresse)) return;

  const config = readFileSync(join(WURZEL, "supabase", "config.toml"), "utf8");
  const projekt = /^project_id\s*=\s*"(.+)"/m.exec(config)?.[1] ?? "";

  const r = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projekt}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: SQL, encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`Onboarding-Konten ließen sich nicht zurücksetzen: ${r.stderr || r.error?.message}`);
  }
}
