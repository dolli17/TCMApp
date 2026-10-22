"use client";

import type { ComponentProps } from "react";

/**
 * Ein Auswahlfeld, das sein Formular beim Wechsel gleich abschickt - etwa
 * „Bestand“ neben der Suche in der Mitgliederliste. Ohne JavaScript bleibt es
 * ein normales Feld, das mit der Suche (Eingabetaste) mitgeht.
 */
export function AuswahlSofort(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
