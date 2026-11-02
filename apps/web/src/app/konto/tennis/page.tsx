import {
  LK_FELD_HINWEIS,
  LK_FELD_LABEL,
  LK_WICHTIG_TEXT,
  MANNSCHAFT_INTERESSE_HINWEIS,
  MANNSCHAFT_INTERESSE_TEXT,
  tennisKurzfassung,
  translateDbError,
  type OnboardingZustand,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { tennisAngabenSpeichern } from "../aktionen";

export const dynamic = "force-dynamic";

/**
 * Tennis - LK, nuLiga-ID und Mannschaftsinteresse nach dem Onboarding
 * (Vereinsentscheidung vom 02.11.2026). Dieselben Felder wie der
 * Onboarding-Schritt; gelesen über my_onboarding(), geschrieben über
 * save_my_tennis. Mannschaft und Mannschaftsführer setzt nur der Vorstand,
 * sie stehen hier nur zum Ansehen.
 */
export default async function TennisSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const [zustandRes, ichRes] = await Promise.all([
    supabase.rpc("my_onboarding"),
    meineId
      ? supabase.from("members").select("is_team_captain, teams(name)").eq("id", meineId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const tennis = (zustandRes.data as unknown as OnboardingZustand | null)?.tennis ?? null;
  const ich = ichRes.data;

  const felder: Feld[] = tennis
    ? [
        { name: "tennis_lk", label: LK_FELD_LABEL, art: "text", wert: tennis.tennis_lk, hinweis: LK_FELD_HINWEIS },
        { name: "nuliga_id", label: "nuLiga-ID", art: "text", wert: tennis.nuliga_id },
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
          <p className="beschreibung" data-testid="tennis-stand">
            Aktuell: {tennisKurzfassung(tennis)}
          </p>
          <Stammdatenkarte titel="Tennis" ohneTitel felder={felder} aktion={tennisAngabenSpeichern} />
        </>
      )}
      {ich?.teams && (
        <p className="beschreibung">
          Mannschaft: {ich.teams.name}
          {ich.is_team_captain ? " · Mannschaftsführer" : ""}. Das trägt der Vorstand ein.
        </p>
      )}
    </KontoUnterseite>
  );
}
