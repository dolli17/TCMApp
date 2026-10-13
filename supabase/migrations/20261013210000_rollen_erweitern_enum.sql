-- ===========================================================================
-- Weitere Rollen: Vorstand und Platzwart
--
-- Eigene Datei, weil ein neuer Enum-Wert erst nach dem Commit der Transaktion
-- benutzt werden darf, die ihn anlegt. Die Funktionen, die 'board' und
-- 'groundskeeper' verwenden, folgen in der naechsten Migration.
--
-- Rollenbild des Vereins:
--   member         Spieler / Basic, hat jedes Mitglied
--   admin          App Admin, darf alles
--   board          Vorstand, darf ebenfalls alles
--   groundskeeper  Platzwart, vorerst ohne eigene Rechte
-- Trainer und Mannschaftsfuehrer bleiben Eigenschaften am Mitglied
-- (members.is_trainer, members.is_team_captain), weil der Mannschaftsfuehrer
-- an seine Mannschaft gebunden ist.
-- ===========================================================================

alter type public.app_role add value if not exists 'board';
alter type public.app_role add value if not exists 'groundskeeper';
