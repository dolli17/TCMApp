/**
 * Metro im Monorepo
 *
 * Ohne diese Datei sucht Metro nur unterhalb von apps/mobile und kennt weder
 * die Geschwisterpakete noch den gemeinsamen Speicher von pnpm. Das faellt
 * erst auf, wenn eine Datei aus @tcm/ui gebraucht wird, die kein TypeScript
 * ist: Quelltext loest der Bundler ueber die Paketangabe auf, ein Bild nicht.
 *
 * Aufbau nach der Monorepo-Anleitung von Expo.
 */

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projekt = __dirname;
const wurzel = path.resolve(projekt, "../..");

const config = getDefaultConfig(projekt);

// Aenderungen in packages/* sollen die App neu laden.
config.watchFolders = [wurzel];

// Bewusst ohne disableHierarchicalLookup: pnpm legt die Abhaengigkeiten jedes
// Pakets neben dieses in .pnpm ab, und genau die findet Metro nur ueber die
// stufenweise Suche nach oben. Abgeschaltet verliert schon expo sein
// expo-modules-core.

// @tcm/ui gibt sein Logo ueber den exports-Eintrag "./logo.png" heraus. Ohne
// diesen Schalter liest Metro nur "main" und meldet den Pfad als unbekannt.
config.resolver.unstable_enablePackageExports = true;

// React immer aus apps/mobile. expo-router fuehrt react nicht als
// Abhaengigkeit, pnpm legt es ihm also nicht daneben, und Metro nimmt dann
// die hochgezogene Kopie in node_modules/.pnpm/node_modules. Welche Version
// dort liegt, entscheidet pnpm je nach Installation: lokal 18, auf EAS auch
// schon die 19 der Web-App. Mit der 19 erzeugt der Router Elemente, die der
// Renderer von React Native 0.76 ablehnt, und die App stuerzt beim Start ab.
const reactAusApp = path.join(projekt, "package.json");
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === "react" || name.startsWith("react/")) {
    return context.resolveRequest({ ...context, originModulePath: reactAusApp }, name, platform);
  }
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
