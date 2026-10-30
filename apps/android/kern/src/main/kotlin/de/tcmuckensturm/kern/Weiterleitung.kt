/*
 * Nur eigene Pfade als Ziel
 *
 * Portierung aus packages/core/src/weiterleitung.ts (sichererWeiterPfad), wie
 * PushZiel.istSichererPfad der iOS-App. Gebraucht fuer Ziele aus Push-
 * Nachrichten und Widgets: Was dort steht, soll nie aus der App hinausfuehren.
 *
 * Erlaubt ist ein fuehrender Schraegstrich, aber kein zweiter (//host ist
 * eine Adresse ohne Schema), kein Backslash (Browser lesen /\host wie //host)
 * und keine Steuerzeichen (der URL-Parser wirft Tab und Zeilenumbruch weg).
 * Die letzte Pruefung in TypeScript, ob der URL-Parser auf derselben Seite
 * bleibt, kann nach diesen Regeln nicht mehr anschlagen und fehlt hier.
 */

package de.tcmuckensturm.kern

object Weiterleitung {
    const val FALLBACK = "/"

    /** `wert` darf alles sein (wie `unknown` in TypeScript); nur ein Text kann ein Pfad sein. */
    fun sichererWeiterPfad(wert: Any?, fallback: String = FALLBACK): String {
        if (wert !is String || wert.isEmpty()) return fallback
        if (!wert.startsWith("/") || wert.startsWith("//")) return fallback
        if (wert.contains('\\')) return fallback
        if (wert.any { it.code < 0x20 || it.code == 0x7f }) return fallback
        return wert
    }
}
