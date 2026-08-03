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

  return (
    <button className="knopf leise" onClick={abmelden} disabled={laeuft}>
      {laeuft ? "…" : "Abmelden"}
    </button>
  );
}
