/*
 * Eigene Stammdaten pruefen
 *
 * Portierung von memberProfileSchema (packages/core/src/schemas.ts), wie
 * Kern/Profil.swift der iOS-App: erst pruefen, dann schicken - eine
 * vierstellige Postleitzahl soll nicht als Datenbankfehler zurueckkommen,
 * sondern als Satz, der das Feld nennt. Golden Files gibt es dafuer keine;
 * die Faelle aus schemas.test.ts stehen in ProfilTest.
 *
 * Die Felder heissen wie die Spalten von members, damit das Formular und
 * save_my_profile dieselben Namen benutzen.
 */

package de.tcmuckensturm.kern

object Profil {
    /** Genau die Felder, die save_my_profile annimmt, in der Reihenfolge des Schemas. */
    val felder = listOf("first_name", "last_name", "title", "phone", "mobile", "street", "postcode", "city")

    /** Die Notfallkontakt-Felder (save_my_notfallkontakt). */
    val notfallFelder = listOf("emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation")

    /** Hoechstlaengen aus dem Schema. */
    val hoechstens = mapOf(
        "first_name" to 100, "last_name" to 100, "title" to 50, "phone" to 50,
        "mobile" to 50, "street" to 200, "city" to 100,
    )

    data class Fehler(val feld: String, val meldung: String)

    /** Wie String.prototype.trim (Leerraum und Zeilenumbrueche an beiden Enden). */
    fun trim(s: String): String = s.trim()

    /**
     * Der erste Fehler wie issues[0] bei zod: Felder in Schema-Reihenfolge,
     * je Feld erst "fehlt", dann die Laenge. null, wenn alles passt.
     */
    fun pruefen(werte: Map<String, String>): Fehler? {
        for (feld in felder) {
            val wert = trim(werte[feld] ?: "")
            // String.length zaehlt UTF-16-Einheiten wie in JavaScript.
            val laenge = wert.length
            if (feld == "first_name" && wert.isEmpty()) return Fehler(feld, "Vorname fehlt.")
            if (feld == "last_name" && wert.isEmpty()) return Fehler(feld, "Nachname fehlt.")
            if (feld == "postcode" && wert.isNotEmpty() && !istPostleitzahl(wert)) {
                return Fehler(feld, "Postleitzahl muss fünfstellig sein.")
            }
            val max = hoechstens[feld]
            if (max != null && laenge > max) {
                // zod schreibt hier englisch ("String must contain at most …"); nativ steht ein Satz.
                return Fehler(feld, "Höchstens $max Zeichen.")
            }
        }
        return null
    }

    /** /^\d{5}$/ - nur die Ziffern 0 bis 9 wie \d in JavaScript. */
    fun istPostleitzahl(s: String): Boolean = s.length == 5 && s.all { it in '0'..'9' }

    /** Was sich gegenueber dem gespeicherten Stand geaendert hat (verglichen nach trim). */
    fun geaendert(neu: Map<String, String>, alt: Map<String, String>): List<String> =
        felder.filter { trim(neu[it] ?: "") != trim(alt[it] ?: "") }

    sealed interface Speichern {
        data object NichtsGeaendert : Speichern

        data class Fehlerhaft(val fehler: Fehler) : Speichern

        /** Spalte -> getrimmter Wert; ein leerer Text leert das Feld. */
        data class Senden(val patch: Map<String, String>) : Speichern
    }

    /**
     * Wie speichereStammdaten in apps/mobile/src/lib/daten.ts: nur geaenderte
     * Felder gehen hinaus, geprueft wird der ganze Datensatz. Fuer
     * save_my_profile heisst ein fehlendes Feld "unveraendert" und "" "leeren".
     */
    fun speichern(neu: Map<String, String>, alt: Map<String, String>): Speichern {
        val felder = geaendert(neu, alt)
        if (felder.isEmpty()) return Speichern.NichtsGeaendert
        pruefen(neu)?.let { return Speichern.Fehlerhaft(it) }
        return Speichern.Senden(felder.associateWith { trim(neu[it] ?: "") })
    }

    /** Eine Notfallnummer ohne Namen (wie speichereNotfallkontakt und der Constraint). */
    fun pruefeNotfallkontakt(werte: Map<String, String>): Fehler? {
        val name = trim(werte["emergency_contact_name"] ?: "")
        val telefon = trim(werte["emergency_contact_phone"] ?: "")
        if (telefon.isNotEmpty() && name.isEmpty()) {
            return Fehler("emergency_contact_name", "Zur Notfallnummer gehört auch ein Name.")
        }
        return null
    }
}
