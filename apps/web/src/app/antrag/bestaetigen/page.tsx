import Link from "next/link";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
import { createServerSupabase } from "@/lib/supabase/server";
import { antragBestaetigen } from "../aktionen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Antrag bestätigen – TC Muckensturm",
};

/**
 * Der Link aus der Bestätigungsmail (S22).
 *
 * Die Seite fragt nur nach, wo der Link steht, und bestätigt erst auf
 * Knopfdruck: Linkprüfer in Postfächern öffnen jeden Link einmal, und das
 * soll keinen Antrag an den Vorstand schicken. Nach dem Knopf lädt dieselbe
 * Seite neu und zeigt „bestätigt“ – auch bei jedem weiteren Klick auf den
 * Link.
 */
export default async function BestaetigenSeite({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; fehler?: string }>;
}) {
  const { token = "", fehler } = await searchParams;

  const supabase = await createServerSupabase();
  const { data, error } = token
    ? await supabase.rpc("membership_application_confirmation_state", { p_token: token })
    : { data: "expired", error: null };
  const stand = error ? "fehler" : String(data);

  if (stand === "already_confirmed") {
    return (
      <AnmeldeBuehne titel="Bestätigt." unterzeile="Dein Antrag ist beim Vorstand angekommen." breit>
          <div className="hinweis erfolg" role="status">
            Danke! Deine E-Mail-Adresse ist bestätigt.
          </div>

          <p className="beschreibung">
            Der Vorstand meldet sich in den nächsten Tagen bei dir, meist per E-Mail. Sobald er
            deinen Antrag angenommen hat, bekommst du eine Einladung zur Vereins-App. Damit buchst
            du Plätze, siehst deine Getränke und pflegst deine Daten selbst.
          </p>

          <p className="beschreibung">Fragen bis dahin? Sprich uns einfach auf der Anlage an.</p>
      </AnmeldeBuehne>
    );
  }

  if (stand === "pending" || stand === "fehler") {
    return (
      <AnmeldeBuehne titel="Antrag bestätigen." unterzeile="Ein Klick, dann geht dein Antrag an den Vorstand." breit>
          <form action={antragBestaetigen}>
            <input type="hidden" name="token" value={token} />

            <p className="beschreibung" style={{ marginTop: 0 }}>
              Damit bestätigst du, dass die E-Mail-Adresse im Antrag dir gehört.
            </p>

            {(fehler || stand === "fehler") && (
              <div className="hinweis fehler" role="alert">
                Das hat gerade nicht geklappt. Bitte versuch es noch einmal.
              </div>
            )}

            <button className="knopf block">Antrag bestätigen</button>
          </form>
      </AnmeldeBuehne>
    );
  }

  return (
    <AnmeldeBuehne titel="Link abgelaufen." unterzeile="Dieser Bestätigungslink gilt nicht mehr." breit>
        <div className="hinweis fehler" role="alert">
          Ein Bestätigungslink gilt 24 Stunden, und immer nur der neueste aus deinem Postfach.
        </div>

        <p className="beschreibung">
          Stell den Antrag einfach noch einmal. Du bekommst dann einen frischen Link.
        </p>

        <Link className="knopf block" href="/antrag">
          Antrag neu stellen
        </Link>
    </AnmeldeBuehne>
  );
}
