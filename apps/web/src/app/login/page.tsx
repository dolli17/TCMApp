"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
import { createClient } from "@/lib/supabase/client";

function Formular() {
  const router = useRouter();
  const params = useSearchParams();
  // Ziel "/" statt "/plan": die Startseite entscheidet, ob jemand ein Mitglied
  // ist oder ein Kiosk-Geraet, und leitet entsprechend weiter.
  const weiter = params.get("weiter") ?? "/";

  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function anmelden(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLaeuft(true);

    const { error } = await createClient().auth.signInWithPassword({
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

    router.push(weiter);
    router.refresh();
  }

  return (
    <AnmeldeBuehne titel="Willkommen zurück auf dem Platz.">
        <form onSubmit={anmelden}>
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
