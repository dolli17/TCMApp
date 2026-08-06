"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import logo from "@tcm/ui/logo.png";
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

    // Der Client verarbeitet das Token aus der Adresse asynchron. Erst danach
    // steht fest, ob der Link noch gültig war.
    const { data } = supabase.auth.onAuthStateChange((_ereignis, sitzung) => {
      setGueltig(Boolean(sitzung));
      setBereit(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setGueltig(true);
      setBereit(true);
    });

    return () => data.subscription.unsubscribe();
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
    <div className="auth antragsseite">
      <div className="crown">
        <Image src={logo} alt="TC Muckensturm" height={34} priority />
        <h1>Passwort festlegen</h1>
        <p>Danach kannst du Plätze buchen und deine Daten selbst pflegen.</p>
      </div>

      <div className="sheet">
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
      </div>
    </div>
  );
}
