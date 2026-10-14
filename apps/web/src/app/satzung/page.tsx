import { RechtstextSeite } from "@/components/Rechtstext";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Satzung – TC Muckensturm",
  description: "Satzung des TC Muckensturm e. V.",
};

/**
 * Satzung, ohne Anmeldung erreichbar. Der Text steht in legal_documents; wer
 * im Onboarding zustimmt, stimmt genau der hier angezeigten Version zu.
 */
export default function SatzungSeite() {
  return <RechtstextSeite code="satzung" unterzeile="Die Grundordnung des Vereins." />;
}
