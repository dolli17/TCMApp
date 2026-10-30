package de.tcmuckensturm.app.daten

import org.junit.Assert.assertEquals
import org.junit.Test

/** Die Initialen fuer Avatar und Chips stehen an einer Stelle (vorher HomeLogik, KontoLogik, PlaetzeLogik). */
class InitialenTest {
    @Test
    fun ausVorUndNachname() {
        assertEquals("MM", Initialen.von("max", "Muster"))
        assertEquals("E", Initialen.von("Erika", ""))
        assertEquals("", Initialen.von("", ""))
        assertEquals("", Initialen.von(null, null))
    }

    @Test
    fun ausMeinName() {
        assertEquals("MM", Initialen.von(MeinName("max", "muster")))
        // Solange der Name laedt, bleibt der Avatar leer.
        assertEquals("", Initialen.von(null as MeinName?))
    }

    @Test
    fun ausGanzemNamen() {
        assertEquals("EM", Initialen.ausName("Eva Maria Muster"))
        assertEquals("E", Initialen.ausName("Eva"))
        assertEquals("", Initialen.ausName(null))
    }
}
