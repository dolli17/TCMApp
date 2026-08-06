-- ===========================================================================
-- Ausfuehrung der gesamten Suite
--
-- Die Dateien davor definieren ausschliesslich Funktionen - dort steht kein
-- einziger Testaufruf. Ohne diese Datei laeuft "supabase test db" deshalb ins
-- Leere: pg_prove findet keinen Plan und meldet "No subtests run".
--
-- runtests() sammelt alles, was im Schema tests mit test_ beginnt, und fuehrt
-- jede Funktion in einer eigenen Transaktion aus, die danach zurueckgerollt
-- wird. Die Tests hinterlassen also keinen Zustand - auch nicht die
-- auth.users-Eintraege, die sie fuer die Rollentests anlegen.
--
-- Die Datei heisst 99_, weil pg_prove alphabetisch laeuft: erst definieren,
-- dann ausfuehren.
-- ===========================================================================

set search_path = extensions, public, tests;

select * from runtests('tests'::name);
