"use client";

import Link from "next/link";
import { useState } from "react";
import { authStoerungText } from "@tcm/core";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
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
  const [fehler, setFehler] = useState<string | null>(null);

  async function anfordern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLaeuft(true);

    const ziel =
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}/passwort-setzen`;

    // Ob es die Adresse gibt, verrät die Antwort bewusst nicht. Eine Störung
    // (kein Netz, zu viele Versuche) schon - sonst wartet jemand auf eine
    // Mail, die nie verschickt wurde (U19).
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: ziel });
    const stoerung = authStoerungText(error);
    if (stoerung) {
      setFehler(stoerung);
      setLaeuft(false);
      return;
    }

    setAbgeschickt(true);
    setLaeuft(false);
  }

  return (
    <AnmeldeBuehne titel="Passwort vergessen" unterzeile="Wir schicken dir einen Link, mit dem du ein neues festlegen kannst.">
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

            {fehler && <div className="hinweis fehler" role="alert">{fehler}</div>}

            <button className="knopf block" disabled={laeuft}>
              {laeuft ? "Wird verschickt…" : "Link anfordern"}
            </button>

            <p className="beschreibung" style={{ marginTop: 12 }}>
              Jedes Mitglied hat einen Zugang mit seiner E-Mail-Adresse, auch Kinder. Kam keine Einladung an oder kennst du die hinterlegte Adresse nicht? Dann frag den Vorstand.
            </p>
          </form>
        )}
    </AnmeldeBuehne>
  );
}
