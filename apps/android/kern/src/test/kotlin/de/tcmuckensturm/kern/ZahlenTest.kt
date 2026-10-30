package de.tcmuckensturm.kern

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
}
