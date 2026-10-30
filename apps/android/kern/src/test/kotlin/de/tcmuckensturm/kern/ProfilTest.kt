package de.tcmuckensturm.kern

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Pruefung der Stammdaten (dieselben Faelle wie packages/core/src/schemas.test.ts
 * und KontoTests.swift) und die Kuendigung (kontoloeschung.test.ts).
 */
class ProfilTest {
    private val gueltig = mapOf(
        "first_name" to "Anna", "last_name" to "Meier", "title" to "", "phone" to "",
        "mobile" to "0170 1234567", "street" to "Bahnhofstr. 20", "postcode" to "70376", "city" to "Stuttgart",
    )

    private fun mit(feld: String, wert: String) = gueltig + (feld to wert)

    @Test
    fun `nimmt vollstaendigen Datensatz an`() {
        assertNull(Profil.pruefen(gueltig))
    }

    @Test
    fun `erlaubt leere optionale Felder`() {
        val w = gueltig + listOf("mobile", "street", "postcode", "city").associateWith { "" }
        assertNull(Profil.pruefen(w))
    }

    @Test
    fun `besteht auf Vor- und Nachname`() {
        assertEquals(Profil.Fehler("first_name", "Vorname fehlt."), Profil.pruefen(mit("first_name", "   ")))
        assertEquals(Profil.Fehler("last_name", "Nachname fehlt."), Profil.pruefen(mit("last_name", "")))
    }

    @Test
    fun postleitzahl() {
        assertEquals(Profil.Fehler("postcode", "Postleitzahl muss fünfstellig sein."), Profil.pruefen(mit("postcode", "7037")))
        assertNotNull(Profil.pruefen(mit("postcode", "7037A")))
        // Arabisch-indische Ziffern sind fuer \d in JavaScript keine Ziffern.
        assertNotNull(Profil.pruefen(mit("postcode", "٧٠٣٧٦")))
        assertNull(Profil.pruefen(mit("postcode", " 70376 ")))
    }

    @Test
    fun laengen() {
        assertNull(Profil.pruefen(mit("phone", "1".repeat(50))))
        assertEquals("phone", Profil.pruefen(mit("phone", "1".repeat(51)))?.feld)
        assertEquals("Höchstens 200 Zeichen.", Profil.pruefen(mit("street", "a".repeat(201)))?.meldung)
        assertEquals("Höchstens 50 Zeichen.", Profil.pruefen(mit("mobile", "1".repeat(51)))?.meldung)
    }

    @Test
    fun `erster Fehler in Schema-Reihenfolge`() {
        val w = mit("postcode", "1") + ("first_name" to "")
        assertEquals("first_name", Profil.pruefen(w)?.feld)
    }

    @Test
    fun `speichern schickt nur geaenderte Felder`() {
        assertEquals(Profil.Speichern.NichtsGeaendert, Profil.speichern(gueltig, gueltig))
        // Nur Leerraum geaendert zaehlt nicht.
        assertEquals(Profil.Speichern.NichtsGeaendert, Profil.speichern(mit("city", " Stuttgart "), gueltig))
        assertEquals(Profil.Speichern.Senden(mapOf("city" to "Ludwigsburg")), Profil.speichern(mit("city", "  Ludwigsburg "), gueltig))
        // Leeren schickt den leeren Text: save_my_profile leert dann das Feld.
        assertEquals(Profil.Speichern.Senden(mapOf("mobile" to "")), Profil.speichern(mit("mobile", ""), gueltig))
        assertEquals(
            Profil.Speichern.Fehlerhaft(Profil.Fehler("postcode", "Postleitzahl muss fünfstellig sein.")),
            Profil.speichern(mit("postcode", "123"), gueltig),
        )
    }

    @Test
    fun notfallkontakt() {
        assertEquals(
            Profil.Fehler("emergency_contact_name", "Zur Notfallnummer gehört auch ein Name."),
            Profil.pruefeNotfallkontakt(mapOf("emergency_contact_name" to " ", "emergency_contact_phone" to "0711 1")),
        )
        assertNull(Profil.pruefeNotfallkontakt(mapOf("emergency_contact_name" to "", "emergency_contact_phone" to "")))
        assertNull(Profil.pruefeNotfallkontakt(mapOf("emergency_contact_name" to "Eva", "emergency_contact_phone" to "")))
    }

    @Test
    fun `Kuendigung pruefen`() {
        assertEquals(Kontoloeschung.Eingabe.Ok(null), Kontoloeschung.pruefen(""))
        assertEquals(Kontoloeschung.Eingabe.Ok(null), Kontoloeschung.pruefen("   "))
        assertEquals(Kontoloeschung.Eingabe.Ok(null), Kontoloeschung.pruefen(null))
        assertEquals(Kontoloeschung.Eingabe.Ok("Ich ziehe weg."), Kontoloeschung.pruefen("  Ich ziehe weg. "))
        assertEquals(Kontoloeschung.Eingabe.Ok("a".repeat(1000)), Kontoloeschung.pruefen("a".repeat(1000)))
        assertEquals(
            Kontoloeschung.Eingabe.Fehler("Die Nachricht ist zu lang (höchstens 1000 Zeichen)."),
            Kontoloeschung.pruefen("a".repeat(1001)),
        )
    }

    @Test
    fun `Kuendigung Meldung`() {
        assertEquals(Kontoloeschung.EINGEGANGEN, Kontoloeschung.meldung(neu = true))
        assertEquals("Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum.", Kontoloeschung.meldung(neu = false))
    }
}
