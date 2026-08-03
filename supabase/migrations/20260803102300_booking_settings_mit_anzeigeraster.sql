-- Anzeige-Raster als eigener Wert: gebucht wird im feinen Raster
-- (booking.slot_minutes), angezeigt im groben (booking.display_minutes).
-- Eine Belegung sperrt jede Anzeigezeile, die sie beruehrt.
insert into public.settings (key, value, value_type, label, description) values
  ('booking.display_minutes', '60'::jsonb, 'integer', 'Raster der Plananzeige',
   'In welchen Schritten der Belegungsplan Zeilen zeigt. Gebucht wird im feineren '
   || 'Raster aus booking.slot_minutes.')
on conflict (key) do nothing;

drop function if exists public.booking_settings();

create function public.booking_settings()
returns table (max_open_bookings integer, lead_days integer, opening_time time,
               closing_time time, slot_minutes integer, display_minutes integer,
               guest_fee_cents integer)
language sql stable security definer set search_path = '' as $$
  select public.setting_int('booking.max_open_bookings'),
         public.setting_int('booking.lead_days'),
         public.setting_time('booking.opening_time'),
         public.setting_time('booking.closing_time'),
         public.setting_int('booking.slot_minutes'),
         public.setting_int('booking.display_minutes'),
         public.setting_int('booking.guest_fee_cents')
  where private.is_member() or private.is_kiosk();
$$;
revoke execute on function public.booking_settings() from public, anon;
grant  execute on function public.booking_settings() to authenticated;
