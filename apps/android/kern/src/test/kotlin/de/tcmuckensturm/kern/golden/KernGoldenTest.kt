package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.DbFehler
import de.tcmuckensturm.kern.PostgresFehler
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Weiterleitung
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.ZugangsGrund
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/** Zeit, Fehlertexte, Zugang und Weiterleitung gegen jeden Fall der Golden Files. */
class KernGoldenTest {
    @Test
    fun `alle Golden Files sind lesbar`() {
        val funktionen = Golden.funktionen()
        assertTrue(funktionen.size > 40) { "Nur ${funktionen.size} Golden Files gefunden" }
        for (funktion in funktionen) {
            assertTrue(Golden.faelle(funktion).isNotEmpty()) { "$funktion.json ist leer" }
        }
    }

    // ---- Zeit -----------------------------------------------------------------

    @TestFactory
    fun berlinTime() = Golden.pruefen("berlinTime") { input ->
        JsonPrimitive(Zeit.iso(Zeit.berlinTime(input.text("day")!!, input.zahl("minutes"))))
    }

    @TestFactory
    fun minutesOf() = Golden.pruefen("minutesOf") { input ->
        JsonPrimitive(Zeit.minutesOf(input.text("iso")!!))
    }

    @TestFactory
    fun timeToMinutes() = Golden.pruefen("timeToMinutes") { input ->
        JsonPrimitive(Zeit.timeToMinutes(input.text("value")!!))
    }

    @TestFactory
    fun minutesToTime() = Golden.pruefen("minutesToTime") { input ->
        JsonPrimitive(Zeit.minutesToTime(input.zahl("minutes")))
    }

    @TestFactory
    fun dayLabel() = Golden.pruefen("dayLabel") { input ->
        JsonPrimitive(Startseite.dayLabel(input.text("startsAt")!!, input.zeitpunkt("now")))
    }

    @TestFactory
    fun dayTag() = Golden.pruefen("dayTag") { input ->
        JsonPrimitive(Startseite.dayTag(input.text("startsAt")!!, input.zeitpunkt("now")))
    }

    // ---- Fehler, Zugang, Weiterleitung ----------------------------------------

    @TestFactory
    fun translateDbError() = Golden.pruefen("translateDbError") { input ->
        val fehler = (input["error"] as? JsonObject)?.let { Golden.json.decodeFromJsonElement<PostgresFehler>(it) }
        JsonPrimitive(DbFehler.translateDbError(fehler))
    }

    @TestFactory
    fun zugangsGrund() = Golden.pruefen("zugangsGrund") { input ->
        JsonPrimitive(ZugangsGrund.aus(input.text("wert")).wert)
    }

    @TestFactory
    fun sichererWeiterPfad() = Golden.pruefen("sichererWeiterPfad") { input ->
        val fallback = input.text("fallback")
        val pfad = if (fallback == null) {
            Weiterleitung.sichererWeiterPfad(input.roh("wert"))
        } else {
            Weiterleitung.sichererWeiterPfad(input.roh("wert"), fallback)
        }
        JsonPrimitive(pfad)
    }
}
