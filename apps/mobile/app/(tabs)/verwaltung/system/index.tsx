/**
 * System (Nachbau von apps/web/src/app/admin/system/page.tsx)
 *
 * Was einmal eingerichtet und danach selten angefasst wird: Benachrichtigungen,
 * Arbeitsdienst, Datenschutz - und der Auffangbehaelter fuer alles ohne
 * bekannten Praefix, damit eine neue Einstellung nicht ungesehen verschwindet.
 * Die Merkmale gehoeren seit der Verwaltung v2 hierher.
 */

import { Bildschirm } from "@/components/Bildschirm";
import { EinstellungsGruppe } from "@/components/verwaltung/EinstellungsGruppe";
import { ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { useLaden } from "@/lib/laden";
import { ladeSystem } from "@/lib/verwaltung/system";

export default function SystemSeite() {
  const zustand = useLaden(ladeSystem);

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      <VerwaltungsKopf unterzeile="Werte, die man einmal einrichtet. Änderungen wirken sofort – auch für alle anderen." />

      <ListenGruppe>
        <Listenzeile
          href="/verwaltung/system/merkmale"
          titel="Merkmale"
          kontext="Einwilligungen, Ehrungen, eigene Kennzeichnungen"
        />
      </ListenGruppe>

      {(zustand.daten ?? []).map((g) => (
        <EinstellungsGruppe
          key={g.praefix || "weitere"}
          titel={g.titel}
          text={g.text}
          eintraege={g.eintraege}
          onGespeichert={() => void zustand.erneutHolen()}
        />
      ))}
    </Bildschirm>
  );
}
