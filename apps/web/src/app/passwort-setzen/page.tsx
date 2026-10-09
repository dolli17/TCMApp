"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
import { createClient } from "@/lib/supabase/client";

/**
 * Passwort festlegen.
 *
 * Hier landet, wer eine Einladung angenommen oder „Passwort vergessen“ benutzt
 * hat. Der Link aus der E-Mail bringt ein kurzlebiges Token mit, das der
 * Supabase-Client selbst aus der Adresse liest und in eine Sitzung verwandelt –
 * deshalb wartet die Seite kurz, bevor sie über den Zustand urteilt.
 *
 * Der Verein sieht das Passwort an keiner Stelle: es geht von hier direkt an
 * Supabase.
 */
export default function PasswortSetzenSeite() {
  const router = useRouter();
  const [bereit, setBereit] = useState(false);
  const [gueltig, setGueltig] = useState(false);
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let aktiv = true;

    (async () => {
      // Einladung und Zurücksetzen durch den Vorstand entstehen auf dem Server
      // (Edge Function member-login) und kommen im impliziten Verfahren an: die
      // Sitzung steht im Fragment (#access_token=…&refresh_token=…). Der
      // Browser-Client arbeitet mit PKCE (?code=…) und übergeht das Fragment –
      // ohne diesen Schritt meldete die Seite jeden Einladungslink als
      // abgelaufen, obwohl Supabase ihn gerade bestätigt hatte.
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const access = fragment.get("access_token");
      const refresh = fragment.get("refresh_token");
      if (access && refresh) {
        const { error } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        // Die Token nicht in Adresszeile und Verlauf stehen lassen.
        window.history.replaceState(null, "", window.location.pathname);
        if (!aktiv) return;
        if (!error) {
          setGueltig(true);
          setBereit(true);
          return;
        }
      }

      // „Passwort vergessen“ aus der Web-App kommt mit ?code=… (PKCE); den
      // tauscht der Client selbst, getSession wartet darauf.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!aktiv) return;
      setGueltig(Boolean(session));
      setBereit(true);
    })();

    return () => {
      aktiv = false;
    };
  }, []);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);

    if (passwort.length < 8) {
      setFehler("Bitte mindestens acht Zeichen wählen.");
      return;
    }
    if (passwort !== wiederholung) {
      setFehler("Die beiden Eingaben stimmen nicht überein.");
      return;
    }

    setLaeuft(true);
    const { error } = await createClient().auth.updateUser({ password: passwort });

    if (error) {
      setFehler(error.message);
      setLaeuft(false);
      return;
    }

    setFertig(true);
    setLaeuft(false);
    // Kurz stehen lassen, damit die Bestätigung ankommt.
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  return (
    <AnmeldeBuehne titel="Passwort festlegen" unterzeile="Danach kannst du Plätze buchen und deine Daten selbst pflegen.">
        {!bereit ? (
          <p className="leer">Einen Moment…</p>
        ) : !gueltig ? (
          <>
            <div className="hinweis fehler">
              Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite
              einen neuen an – oder melde dich beim Vorstand.
            </div>
            <a className="knopf block" href="/passwort-vergessen">
              Neuen Link anfordern
            </a>
          </>
        ) : fertig ? (
          <div className="hinweis erfolg" role="status">
            Passwort gespeichert. Es geht gleich weiter…
          </div>
        ) : (
          <form onSubmit={speichern}>
            <label>
              <span>Neues Passwort</span>
              <input
                type="password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
              <span className="beschreibung">Mindestens acht Zeichen.</span>
            </label>
            <label>
              <span>Noch einmal</span>
              <input
                type="password"
                value={wiederholung}
                onChange={(e) => setWiederholung(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {fehler && <div className="hinweis fehler">{fehler}</div>}

            <button className="knopf block" disabled={laeuft}>
              {laeuft ? "Wird gespeichert…" : "Passwort speichern"}
            </button>
          </form>
        )}
    </AnmeldeBuehne>
  );
}
