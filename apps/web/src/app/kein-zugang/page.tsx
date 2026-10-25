import Link from "next/link";
import { KEIN_ZUGANG_KONTAKT, KEIN_ZUGANG_TITEL, keinZugangText, zugangsGrund } from "@tcm/core";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";

/**
 * Kein Zugang mehr (B22)
 *
 * Hierher leitet die Middleware, wer ausgetreten, archiviert oder gesperrt
 * ist - schon abgemeldet. Sonst stuende hinter der Anmeldung nur eine Reihe
 * leerer Seiten. Der Grund kommt aus der Adresse; was dort nicht hingehoert,
 * wird zum allgemeinen Satz (zugangsGrund).
 */
export default async function KeinZugangSeite({
  searchParams,
}: {
  searchParams: Promise<{ grund?: string }>;
}) {
  const { grund } = await searchParams;

  return (
    <AnmeldeBuehne titel={KEIN_ZUGANG_TITEL} unterzeile={keinZugangText(zugangsGrund(grund))}>
      <div className="kein-zugang">
        <p>{KEIN_ZUGANG_KONTAKT} Du bist abgemeldet.</p>
        <Link className="knopf block" href="/impressum#kontakt">
          Vorstand kontaktieren
        </Link>
        <Link className="knopf block leise" href="/login">
          Mit einem anderen Konto anmelden
        </Link>
      </div>
    </AnmeldeBuehne>
  );
}
