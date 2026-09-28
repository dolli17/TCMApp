"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AbmeldeKnopf() {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);

  async function abmelden() {
    setLaeuft(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Nur ein Symbol in der Nutzerkarte der Seitenleiste; der Name fuer
  // Screenreader kommt aus aria-label, der Tooltip aus title.
  return (
    <button
      type="button"
      className="abmelden"
      onClick={abmelden}
      disabled={laeuft}
      aria-label="Abmelden"
      title="Abmelden"
    >
      <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
        <path
          d="M15 12H3M7 8l-4 4 4 4M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6"
          strokeWidth="1.9"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
