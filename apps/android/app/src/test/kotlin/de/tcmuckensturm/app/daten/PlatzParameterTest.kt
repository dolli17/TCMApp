package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.SuchFuer
import de.tcmuckensturm.kern.Suchfilter
import de.tcmuckensturm.kern.Zeit
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Was create_booking und set_partner_wanted bekommen (lk-vertrag): die
 * Filter nur, wenn sie etwas einschraenken - sonst dieselben Parameter wie
 * vor dem Filter, damit auch eine Datenbank ohne die neuen Parameter antwortet.
 */
class PlatzParameterTest {
    private val beginn = Zeit.berlinTime("2026-10-29", 17 * 60)

    @Test
    fun buchenOhneFilterWieBisher() {
        val p = buchungsParameter("p1", beginn, "einzel", listOf("m1"), emptyList(), true, Suchfilter.OFFEN)
        assertEquals(
            setOf("p_court_id", "p_starts_at", "p_booking_type_code", "p_player_member_ids", "p_guest_names", "p_partner_wanted"),
            p.keys,
        )
    }

    @Test
    fun buchenMitFilter() {
        val p = buchungsParameter("p1", beginn, "doppel", emptyList(), emptyList(), true, Suchfilter(101, 160, SuchFuer.HERREN))
        assertEquals(JsonPrimitive(10.1), p["p_partner_lk_von"])
        assertEquals(JsonPrimitive(16.0), p["p_partner_lk_bis"])
        assertEquals(JsonPrimitive("male"), p["p_partner_fuer"])
        assertEquals("10.1", p["p_partner_lk_von"].toString())
    }

    @Test
    fun ohneSucheKeinFilter() {
        val p = buchungsParameter("p1", beginn, "doppel", emptyList(), emptyList(), false, Suchfilter(100, 160, SuchFuer.DAMEN))
        assertFalse("p_partner_lk_von" in p)
        assertFalse("p_partner_fuer" in p)
    }

    @Test
    fun grenzenGehenAlsNullBzwGarNicht() {
        val p = buchungsParameter("p1", beginn, "doppel", emptyList(), emptyList(), true, Suchfilter(10, 160))
        assertFalse("p_partner_lk_von" in p)
        assertEquals(JsonPrimitive(16.0), p["p_partner_lk_bis"])
    }

    @Test
    fun ausschreiben() {
        assertEquals(setOf("p_booking_id", "p_wanted"), ausschreibParameter("b1", true, Suchfilter.OFFEN).keys)
        assertEquals(setOf("p_booking_id", "p_wanted"), ausschreibParameter("b1", false, Suchfilter(fuer = SuchFuer.DAMEN)).keys)
        val p = ausschreibParameter("b1", true, Suchfilter(von = 125, fuer = SuchFuer.DAMEN))
        assertEquals(JsonPrimitive(12.5), p["p_lk_von"])
        assertFalse("p_lk_bis" in p)
        assertEquals(JsonPrimitive("female"), p["p_fuer"])
    }
}
