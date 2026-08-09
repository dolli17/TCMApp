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

module.exports = config;
