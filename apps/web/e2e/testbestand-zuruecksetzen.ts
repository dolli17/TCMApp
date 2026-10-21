import { istLokalerStack, sqlLokal } from "./lokale-db";

/**
 * Den Ausgangszustand der Testkonten herstellen, vor jedem Lauf (T3, O19).
 *
 * Die Tests buchen feste Termine im Fenster, das der Seed frei hält (08:00 und
 * 11–15 Uhr, siehe supabase/seed.sql). Was ein abgebrochener Lauf dort liegen
 * ließ, stünde dem nächsten im Weg – früher sprangen die Tests dann mit
 * test.skip zur nächsten freien Zelle oder ließen sich ganz überspringen.
 *
 * Hier also, nur für die Testkonten (feste UUIDs, Präfix e2e00000-):
 * - künftige Buchungen weg, als Bucher, Ersteller oder Mitspieler;
 * - Sperrungen weg, die ein Test angelegt hat (Serientermine bleiben);
 * - der Serientitel aus dem Seed, falls ein Lauf beim Umbenennen abbrach;
 * - keine Nachrichten in der Glocke;
 * - Rollen: admin@ ist Admin, alle anderen nur Mitglied;
 * - Buchungsvorlauf und Kontingent auf den Standardwerten;
 * - keine Wahl bei „E-Mails zu Buchungen“;
 * - eine fremde Buchung für die Berechtigungstests: Mia Mitspiel mit Max
 *   Mitspiel, morgen 12:00 auf Platz 8.
 */

export const FREMDE_BUCHUNG = { platz: "Platz 8", zeit: "12:00", inTagen: 1 } as const;

const SQL = `
begin;
create temp table e2e on commit drop as
  select id from public.members where id::text like 'e2e00000-%';

delete from public.bookings b
 where upper(b.slot) > now()
   and b.kind = 'booking'
   and (b.member_id in (select id from e2e)
        or b.created_by in (select id from e2e)
        or exists (select 1 from public.booking_players p
                    where p.booking_id = b.id and p.member_id in (select id from e2e)));

delete from public.bookings b
 where upper(b.slot) > now()
   and b.kind = 'blocking'
   and b.series_id is null
   and (b.created_by in (select id from e2e) or b.title like 'ZZTest%');

update public.booking_series set title = 'Jugendtraining'
 where title like 'Jugendtraining%' and title <> 'Jugendtraining';
update public.bookings set title = 'Jugendtraining'
 where series_id is not null and title like 'Jugendtraining%' and title <> 'Jugendtraining';

delete from public.notifications where member_id in (select id from e2e);

delete from public.member_roles
 where member_id in (select id from e2e) and role <> 'member'
   and member_id <> 'e2e00000-0000-4000-8000-000000000001';
insert into public.member_roles (member_id, role)
values ('e2e00000-0000-4000-8000-000000000001', 'admin')
on conflict do nothing;

update public.settings set value = '7'::jsonb where key = 'booking.lead_days';
update public.settings set value = '0'::jsonb where key = 'booking.max_open_bookings';

delete from public.member_attribute_values v using public.member_attribute_types t
 where t.id = v.attribute_type_id and t.code = 'booking_mail'
   and v.member_id in (select id from e2e);

with termin as (
  select ((now() at time zone 'Europe/Berlin')::date + ${FREMDE_BUCHUNG.inTagen}
          + time '${FREMDE_BUCHUNG.zeit}') at time zone 'Europe/Berlin' as beginn
), neu as (
  insert into public.bookings (court_id, slot, kind, booking_type_id, member_id, created_by)
  select c.id, tstzrange(t.beginn, t.beginn + interval '1 hour', '[)'), 'booking', bt.id,
         'e2e00000-0000-4000-8000-000000000006', 'e2e00000-0000-4000-8000-000000000006'
    from termin t, public.courts c, public.booking_types bt
   where c.name = '${FREMDE_BUCHUNG.platz}' and bt.code = 'einzel'
  returning id
)
insert into public.booking_players (booking_id, member_id)
select id, 'e2e00000-0000-4000-8000-000000000007' from neu;
commit;
`;

export default async function testbestandZuruecksetzen(): Promise<void> {
  if (!istLokalerStack()) return;
  sqlLokal(SQL, "Der Testbestand ließ sich nicht zurücksetzen");
}
