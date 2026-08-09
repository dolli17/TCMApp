/**
 * Bilddateien als Modul
 *
 * Metro loest ein importiertes PNG zu einer Bildquelle auf, TypeScript kennt
 * die Endung von sich aus nicht. Die Erklaerung steht hier und nicht in
 * @tcm/ui: das Paket enthaelt reine Werte und weiss nichts von React Native.
 */

declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";

  const quelle: ImageSourcePropType;
  export default quelle;
}

declare module "@tcm/ui/logo.png" {
  import type { ImageSourcePropType } from "react-native";

  const quelle: ImageSourcePropType;
  export default quelle;
}
