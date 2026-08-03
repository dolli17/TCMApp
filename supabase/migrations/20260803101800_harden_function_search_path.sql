-- Ein veraenderlicher search_path laesst sich missbrauchen: wer ihn setzen
-- kann, entscheidet, welche Funktion hinter einem unqualifizierten Namen
-- steckt. Bei den IBAN-Helfern und series_occurrences war er offen.
--
-- Die Testfunktionen im Schema tests bleiben ausgenommen: sie sind fuer anon
-- und authenticated nicht erreichbar und werden vor dem Produktivgang samt
-- pgTAP entfernt.

alter function public.iban_to_numeric(text)         set search_path = '';
alter function public.mod97(text)                   set search_path = '';
alter function public.iban_check_digits(text, text) set search_path = 'public';
alter function public.iban_is_valid(text)           set search_path = 'public';
alter function private.series_occurrences(integer, time, time, date, date)
  set search_path = '';
