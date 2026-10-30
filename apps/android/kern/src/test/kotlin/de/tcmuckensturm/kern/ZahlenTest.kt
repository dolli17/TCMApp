package de.tcmuckensturm.kern

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ZahlenTest {
    @Test
    fun `deutsch mit Komma und Tausenderpunkt`() {
        assertEquals("3", Zahlen.deutsch(3.0))
        assertEquals("6,5", Zahlen.deutsch(6.5))
        assertEquals("0", Zahlen.deutsch(0.0))
        assertEquals("0", Zahlen.deutsch(-0.0))
        assertEquals("12,25", Zahlen.deutsch(12.25))
        assertEquals("1.234,5", Zahlen.deutsch(1234.5))
        assertEquals("-2,5", Zahlen.deutsch(-2.5))
        // Hoechstens zwei Nachkommastellen, kaufmaennisch gerundet
        assertEquals("0,33", Zahlen.deutsch(1.0 / 3))
        assertEquals("2,13", Zahlen.deutsch(2.125))
    }

    @Serializable
    private data class Stunden(@Serializable(ZahlOderText::class) val h: Double? = null)

    @Test
    fun `ZahlOderText liest Zahl und Text, sonst null`() {
        val json = Json
        assertEquals(2.5, json.decodeFromString<Stunden>("""{"h":2.5}""").h)
        assertEquals(2.5, json.decodeFromString<Stunden>("""{"h":"2.5"}""").h)
        assertEquals(null, json.decodeFromString<Stunden>("""{"h":null}""").h)
        assertEquals(null, json.decodeFromString<Stunden>("""{"h":"viel"}""").h)
        assertEquals(null, json.decodeFromString<Stunden>("""{}""").h)
    }

    @Test
    fun `Uhrzeiten und Daten auch auf einem arabisch eingestellten Telefon mit lateinischen Ziffern`() {
        val vorher = java.util.Locale.getDefault()
        try {
            java.util.Locale.setDefault(java.util.Locale.forLanguageTag("ar-EG"))
            assertEquals("09:05", Zeit.minutesToTime(9 * 60 + 5))
            assertEquals("07.03.", "%02d.%02d.".formatiert(7, 3))
        } finally {
            java.util.Locale.setDefault(vorher)
        }
    }
}
