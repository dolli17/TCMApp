import { RechtstextSeite } from "@/components/Rechtstext";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Beitragsordnung – TC Muckensturm",
  description: "Beitragsordnung des TC Muckensturm e. V.",
};

/** Beitragsordnung, ohne Anmeldung erreichbar. Wie die Satzung aus legal_documents. */
export default function BeitragsordnungSeite() {
  return <RechtstextSeite code="beitragsordnung" unterzeile="Was die Mitgliedschaft kostet." />;
}
