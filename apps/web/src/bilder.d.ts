/**
 * Statische Bildimporte aus @tcm/ui. Next liefert dafuer ein Objekt mit
 * Abmessungen; ohne diese Deklaration kennt TypeScript den Modulpfad nicht.
 */
declare module "@tcm/ui/logo.png" {
  import type { StaticImageData } from "next/image";
  const wert: StaticImageData;
  export default wert;
}
