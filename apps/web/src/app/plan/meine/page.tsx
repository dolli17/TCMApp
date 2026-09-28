import { redirect } from "next/navigation";

/**
 * Alte Adresse /plan/meine - "Meine Buchungen" und "Offene Spiele" stehen seit
 * dem Umbau auf einer Seite. Die Adresse bleibt, damit Links aus E-Mails und
 * Lesezeichen weiter ankommen.
 */
export default function Weiterleitung(): never {
  redirect("/plan/spiele");
}
