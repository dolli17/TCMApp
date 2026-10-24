"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";

/**
 * Suchfeld, das schon beim Tippen sucht (U48).
 *
 * Nach einer kurzen Pause schreibt es den Begriff in die Adresse (`q`), die
 * übrigen Parameter bleiben, nur die Seite fängt wieder bei 1 an. Die Liste
 * filtert weiter auf dem Server; ohne JavaScript schickt die Eingabetaste das
 * Formular ab wie bisher.
 */
export function LiveSuche({
  name = "q",
  warten = 250,
  ...props
}: Omit<ComponentProps<"input">, "type" | "onChange"> & { name?: string; warten?: number }) {
  const router = useRouter();
  const pfad = usePathname();
  const parameter = useSearchParams();
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
  }, []);

  function suche(wert: string) {
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    zeitgeber.current = setTimeout(() => {
      const p = new URLSearchParams(parameter.toString());
      const begriff = wert.trim();
      if (begriff === (p.get(name) ?? "")) return;
      if (begriff) p.set(name, begriff);
      else p.delete(name);
      p.delete("seite");
      const s = p.toString();
      router.replace(`${pfad}${s ? `?${s}` : ""}`, { scroll: false });
    }, warten);
  }

  return <input {...props} type="search" name={name} onChange={(e) => suche(e.target.value)} />;
}
