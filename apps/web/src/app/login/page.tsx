"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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
    <div style={{ maxWidth: 380, margin: "4rem auto" }}>
      <h1>TC Muckensturm</h1>
      <p className="unterzeile">Platzbuchung, Getränke und Beiträge.</p>

      <form onSubmit={anmelden} className="karte">
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

        {fehler && <div className="hinweis fehler">{fehler}</div>}

        <button className="knopf" style={{ width: "100%" }} disabled={laeuft}>
          {laeuft ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}

export default function LoginSeite() {
  return (
    <Suspense fallback={null}>
      <Formular />
    </Suspense>
  );
}
