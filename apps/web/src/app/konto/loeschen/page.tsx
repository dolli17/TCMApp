import { KONTOLOESCHUNG_TEXT } from "@tcm/core";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { KontoloeschungFormular } from "@/components/KontoloeschungFormular";
import { kontoloeschungBeantragen } from "../aktionen";

export const dynamic = "force-dynamic";

/** Mitgliedschaft kündigen beantragen (O9, U44) - dieselben Sätze wie im Konto-Tab der App. */
export default function KontoLoeschenSeite() {
  return (
    <KontoUnterseite titel={KONTOLOESCHUNG_TEXT.titel}>
      <KontoloeschungFormular aktion={kontoloeschungBeantragen} />
    </KontoUnterseite>
  );
}
