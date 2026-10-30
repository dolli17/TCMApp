package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.Forderungen
import de.tcmuckensturm.kern.Merkmaltexte
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Forderungsarten und Merkmaltexte des Kontos gegen jeden Fall der Golden Files.
 * formatCents und sumOpenDrinks, die das Konto auch nimmt, prueft StartseiteGoldenTest.
 */
class KontoGoldenTest {
    @TestFactory
    fun chargeKindLabel() = Golden.pruefen("CHARGE_KIND_LABEL") { input ->
        Forderungen.chargeKindLabel(input.text("kind")!!)?.let(::JsonPrimitive)
    }

    @Test
    fun `Forderungsarten in der Reihenfolge von CHARGE_KINDS`() {
        val kinds = Golden.faelle("CHARGE_KIND_LABEL").map { it.input.text("kind") }
        assertEquals(kinds, Forderungen.arten.map { it.first })
    }

    @TestFactory
    fun merkmalBeschreibung() = Golden.pruefen("merkmalBeschreibung") { input ->
        val sicht = requireNotNull(Merkmaltexte.Sicht.aus(input.text("sicht")!!))
        JsonPrimitive(Merkmaltexte.merkmalBeschreibung(input.text("code")!!, input.text("beschreibung")!!, sicht))
    }
}
