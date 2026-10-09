"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
import { aktivitaetMerken } from "@/lib/inaktivitaet";
import { kontoGewechselt } from "@/lib/konto-kanal";
import { createClient } from "@/lib/supabase/client";

function Formular() {
  const router = useRouter();
  const params = useSearchParams();
  // Ziel "/" statt "/plan": die Startseite entscheidet, ob jemand ein Mitglied
  // ist oder ein Kiosk-Geraet, und leitet entsprechend weiter.
  const weiter = params.get("weiter") ?? "/";
  // Nach der automatischen Abmeldung (lib/inaktivitaet.ts) sagen, warum.
  const grund = params.get("grund");
  const hinweis =
    grund === "inaktiv"
      ? "Du wurdest nach 30 Minuten ohne Aktivität abgemeldet. Bitte melde dich erneut an."
      : grund === "anderes-konto"
        ? "Du wurdest in diesem Tab abgemeldet, weil sich im selben Browser ein anderes Konto angemeldet hat."
        : grund === "abgemeldet"
          ? "Du wurdest in diesem Tab abgemeldet, weil du dich in einem anderen Tab abgemeldet hast."
          : null;

  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function anmelden(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLaeuft(true);

    const supabase = createClient();

    // Nie zwei Konten zugleich (lib/konto-kanal.ts): ist hier schon ein
    // anderes Konto angemeldet, wird dessen Sitzung erst beendet - auch bei
    // Supabase, nicht nur im Browser.
    const {
      data: { session: bisher },
    } = await supabase.auth.getSession();
    if (bisher && bisher.user.email?.toLowerCase() !== email.trim().toLowerCase()) {
      await supabase.auth.signOut({ scope: "local" });
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: passwort,
    });

    if (error) {
      // Die Meldung nennt bewusst nicht, ob die Adresse existiert - sonst
      // liesse sich damit herausfinden, wer im Verein ist.
      setFehler("E-Mail-Adresse oder Passwort stimmt nicht.");
      setLaeuft(false);
      return;
    }

    // Frischer Stempel, bevor die erste Seite hinter dem Login geladen wird.
    aktivitaetMerken();
    kontoGewechselt();
    router.push(weiter);
    router.refresh();
  }

  return (
    <AnmeldeBuehne titel="Willkommen zurück auf dem Platz.">
        <form onSubmit={anmelden}>
          {hinweis && !fehler && (
            <div className="hinweis" role="status">
              {hinweis}
            </div>
          )}
          <label>
            <span>E-Mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Passwort</span>
            <input
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <p className="vergessen">
            <Link href="/passwort-vergessen">Passwort vergessen?</Link>
          </p>

          {fehler && <div className="hinweis fehler" role="alert">{fehler}</div>}

          <button className="knopf gold gross block" disabled={laeuft}>
            {laeuft ? "Anmelden…" : "Anmelden"}
          </button>

          <p className="antrag-hinweis">
            Noch kein Mitglied? <Link href="/antrag">Antrag stellen</Link>
          </p>
          <p className="rechtliches">
            <Link href="/datenschutz">Datenschutz</Link> · <Link href="/impressum">Impressum</Link>
          </p>
        </form>
    </AnmeldeBuehne>
  );
}

export default function LoginSeite() {
  return (
    <Suspense fallback={null}>
      <Formular />
    </Suspense>
  );
}
