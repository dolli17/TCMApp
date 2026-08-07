-- ===========================================================================
-- Realtime auf bookings
--
-- Zwei Leute, die gleichzeitig denselben Slot ansehen, sollen sich nicht
-- gegenseitig behindern: wer zu spaet klickt, bekommt heute den Satz "Dieser
-- Platz ist zu der Zeit bereits belegt." - richtig, aber aergerlich, weil der
-- Plan die Buchung schon eine Minute lang verschwiegen hat.
--
-- RLS gilt auch fuer Realtime. Die Policy bookings_select erlaubt jedem
-- Mitglied das Lesen, damit kommen die Ereignisse bei allen an - und bei
-- niemandem sonst.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
