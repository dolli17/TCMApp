import {
  LK_FELD_HINWEIS,
  LK_FELD_LABEL,
  LK_WICHTIG_TEXT,
  MANNSCHAFT_INTERESSE_HINWEIS,
  MANNSCHAFT_INTERESSE_TEXT,
  MANNSCHAFT_TEXT,
  meineMannschaftLesen,
  tennisKurzfassung,
  translateDbError,
  type OnboardingZustand,
} from "@tcm/core";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { tennisAngabenSpeichern } from "../aktionen";
import { telefonFreigabeSpeichern } from "../mannschaft/aktionen";

export const dynamic = "force-dynamic";

/**
 * Tennis - LK, nuLiga-ID und Mannschaftsinteresse nach dem Onboarding
 * (Vereinsentscheidung vom 02.11.2026). Dieselben Felder wie der
 * Onboarding-Schritt; gelesen über my_onboarding(), geschrieben über
 * save_my_tennis. Wer in einer Mannschaft ist, gibt hier außerdem seine
 * Telefonnummer für den Mannschaftsführer frei (set_team_phone_visible).
 */
export default async function TennisSeite() {
  const supabase = await createServerSupabase();

  const [zustandRes, mannschaftRes] = await Promise.all([
    supabase.rpc("my_onboarding"),
    supabase.rpc("meine_mannschaft"),
  ]);

  const tennis = (zustandRes.data as unknown as OnboardingZustand | null)?.tennis ?? null;
  const mannschaft = mannschaftRes.error ? null : meineMannschaftLesen(mannschaftRes.data);

  const felder: Feld[] = tennis
    ? [
        { name: "tennis_lk", halb: true, label: LK_FELD_LABEL, art: "text", wert: tennis.tennis_lk, hinweis: LK_FELD_HINWEIS },
        { name: "nuliga_id", halb: true, label: "nuLiga-ID", art: "text", wert: tennis.nuliga_id },
        {
          name: "mannschaft_interesse",
          label: MANNSCHAFT_INTERESSE_TEXT,
          art: "schalter",
          wert: tennis.mannschaft_interesse,
          hinweis: MANNSCHAFT_INTERESSE_HINWEIS,
          breit: true,
        },
      ]
    : [];

  return (
    <KontoUnterseite titel="Tennis" text={LK_WICHTIG_TEXT}>
      {zustandRes.error && (
        <Fehlerzustand kompakt titel="Deine Tennisangaben ließen sich nicht laden." text={translateDbError(zustandRes.error)} />
      )}
      {tennis && (
        <>
          {/* Entwurf "Tennis": der Stand groß in einer Karte, darunter die Felder */}
          <p className="karte stand-karte" data-testid="tennis-stand">
            <span className="kicker">Aktuell: </span>
            <b className="dpl">{tennisKurzfassung(tennis)}</b>
          </p>
          <Stammdatenkarte titel="Tennis" ohneTitel hauptaktion felder={felder} aktion={tennisAngabenSpeichern} />
        </>
      )}
      {mannschaft && (
        <>
          <div className="karte mannschaft-box">
          <p className="kopf">
            <b className="dpl">
              Mannschaft: {mannschaft.name}
              {mannschaft.ich_bin_mf ? " · Mannschaftsführer" : ""}.
            </b>{" "}
            <Link href="/konto/mannschaft" className="textknopf">Zur Mannschaft</Link>
          </p>
          <Stammdatenkarte
            titel="Mannschaft"
            ohneTitel
            sofort
            felder={[
              {
                name: "team_phone_visible",
                label: MANNSCHAFT_TEXT.telefonZustimmung,
                art: "schalter",
                wert: mannschaft.telefon_sichtbar,
                hinweis: "Im Kader steht dann deine Mobilnummer, sonst deine Telefonnummer.",
                breit: true,
              },
            ]}
            aktion={telefonFreigabeSpeichern}
          />
          </div>
        </>
      )}
    </KontoUnterseite>
  );
}
