package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.Forderungen
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Getraenkekauf
import de.tcmuckensturm.kern.Merkmaltexte
import de.tcmuckensturm.kern.Startseite
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/** Geld, Forderungsarten, Merkmaltexte und die Getraenkesumme des Kontos gegen jeden Fall der Golden Files. */
class KontoGoldenTest {
    @TestFactory
    fun formatCents() = Golden.pruefen("formatCents") { input ->
        JsonPrimitive(Geld.formatCents(input.zahl("cents")))
    }

    @Test
    fun `formatCents mit Tausenderpunkt und Vorzeichen`() {
        // Ueber die Golden Files hinaus: Intl.NumberFormat("de-DE", EUR)
        assertEquals("1.234.567,89 €", Geld.formatCents(123456789))
        assertEquals("-12,50 €", Geld.formatCents(-1250))
        assertEquals("999,99 €", Geld.formatCents(99999))
    }

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

    private data class Kauf(override val totalCents: Int?, override val voidedAt: String?) : Getraenkekauf

    @TestFactory
    fun sumOpenDrinks() = Golden.pruefen("sumOpenDrinks") { input ->
        val kaeufe = (input["kaeufe"] as JsonArray).map {
            val k = it as JsonObject
            Kauf(k["total_cents"]?.jsonPrimitive?.intOrNull, k.text("voided_at"))
        }
        JsonPrimitive(Startseite.sumOpenDrinks(kaeufe))
    }
}
