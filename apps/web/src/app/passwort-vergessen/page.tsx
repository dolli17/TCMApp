"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import logo from "@tcm/ui/logo.png";
import { createClient } from "@/lib/supabase/client";

/**
 * Passwort vergessen.
 *
 * Die Rückmeldung ist immer dieselbe, egal ob die Adresse im Verein bekannt
 * ist oder nicht. Andernfalls ließe sich hier durchprobieren, wer Mitglied ist –
 * dieselbe Überlegung wie auf der Anmeldeseite, die auch nicht verrät, ob die
 * Adresse oder das Passwort falsch war.
 */
export default function PasswortVergessenSeite() {
  const [email, setEmail] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [abgeschickt, setAbgeschickt] = useState(false);

  async function anfordern(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);

    const ziel =
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}/passwort-setzen`;

    // Der Fehler interessiert hier bewusst nicht: die Antwort bleibt dieselbe.
    await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: ziel });

    setAbgeschickt(true);
    setLaeuft(false);
  }

  return (
    <div className="auth antragsseite">
      <div className="crown">
        <Image src={logo} alt="TC Muckensturm" height={34} priority />
        <h1>Passwort vergessen</h1>
        <p>Wir schicken dir einen Link, mit dem du ein neues festlegen kannst.</p>
      </div>

      <div className="sheet">
        {abgeschickt ? (
          <>
            <div className="hinweis erfolg" role="status">
              Wenn zu dieser Adresse ein Zugang besteht, ist der Link unterwegs. Schau auch im
              Spam-Ordner nach.
            </div>
            <Link className="knopf block leise" href="/login">
              Zurück zur Anmeldung
            </Link>
          </>
        ) : (
          <form onSubmit={anfordern}>
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

            <button className="knopf block" disabled={laeuft}>
              {laeuft ? "Wird verschickt…" : "Link anfordern"}
            </button>

            <p className="beschreibung" style={{ marginTop: 12 }}>
              Kein Zugang, aber Mitglied? Dann meldet dich der Vorstand an – frag einfach nach.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
