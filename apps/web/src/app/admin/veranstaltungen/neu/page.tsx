import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { VeranstaltungsFormular } from "@/components/VeranstaltungsFormular";

export const dynamic = "force-dynamic";

/** Neue Veranstaltung (Entwurf AdminFormular). Sie beginnt als Fest mit Anmeldung. */
export default function NeueVeranstaltungSeite() {
  return (
    <div className="verwaltung veranstaltung-bearbeiten">
      <VerwaltungsKopf
        titel="Neue Veranstaltung"
        zurueck={{ href: "/admin/veranstaltungen", text: "Veranstaltungen" }}
      />
      <VeranstaltungsFormular
        id={null}
        entwurf
        anfang={{
          kind: "fest", title: "", description: "", location: "", start: "", ende: "",
          anmeldung: true, schluss: "", plaetze: "", begleitung: true, gebuehr: false, preis: "", stunden: "",
        }}
      />
    </div>
  );
}
