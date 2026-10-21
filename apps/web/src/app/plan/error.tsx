"use client";

import { SeitenFehler } from "@/components/Fehlerzustand";

export default function Fehler(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SeitenFehler {...props} titel="Der Belegungsplan ließ sich nicht laden." />;
}
