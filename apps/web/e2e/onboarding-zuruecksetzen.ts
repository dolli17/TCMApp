import { istLokalerStack, sqlLokal } from "./lokale-db";

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

const SQL = `
begin;
create temp table ziel on commit drop as
  select id from public.members
   where id in ('e2e00000-0000-4000-8000-000000000004', 'e2e00000-0000-4000-8000-000000000005');
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
  if (!istLokalerStack()) return;
  sqlLokal(SQL, "Onboarding-Konten ließen sich nicht zurücksetzen");
}
