-- ===========================================================================
-- Veranstaltungen: neue Forderungsart
--
-- Eigene Datei, weil ein neuer Enum-Wert erst nach dem Commit der Transaktion
-- benutzt werden darf, die ihn anlegt. Tabellen und Funktionen folgen in der
-- naechsten Migration.
--
-- Teilnahmegebuehren von Festen und Terminen landen als Forderung der Art
-- 'event' in der Kasse, eine je Mitglied und Veranstaltung.
-- ===========================================================================

alter type public.charge_kind add value if not exists 'event';
