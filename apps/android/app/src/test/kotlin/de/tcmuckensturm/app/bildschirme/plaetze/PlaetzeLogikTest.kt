package de.tcmuckensturm.app.bildschirme.plaetze

import de.tcmuckensturm.app.daten.Kontingent
import de.tcmuckensturm.app.daten.Mitglied
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.BookingTypeInfo
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.Zeit
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Texte und Entscheidungen des Tabs Plaetze (PlaetzeLogik, Verwalten) - wie PlaetzeLogikTests der iOS-App. */
class PlaetzeLogikTest {
    /** Eine Belegung aus day_schedule; `felder` ueberschreibt die Vorgaben. */
    private fun belegung(vararg felder: Pair<String, Any?>): TagesBelegung {
        val json = buildJsonObject {
            put("booking_id", JsonPrimitive("b1"))
            put("court_id", JsonPrimitive("c1"))
            put("starts_at", JsonPrimitive("2026-10-29T16:00:00Z"))
            put("ends_at", JsonPrimitive("2026-10-29T17:00:00Z"))
            put("kind", JsonPrimitive("booking"))
        }.toMutableMap()
        for ((k, v) in felder) {
            json[k] = when (v) {
                null -> kotlinx.serialization.json.JsonNull
                is String -> JsonPrimitive(v)
                is Boolean -> JsonPrimitive(v)
                is Int -> JsonPrimitive(v)
                else -> error("Unbekannter Typ $v")
            }
        }
        return SupabaseVerbindung.json.decodeFromJsonElement(TagesBelegung.serializer(), JsonObject(json))
    }

    /** Donnerstag, 29.10.2026, 15:00 Berlin (Winterzeit) */
    private val jetzt = Zeit.datum("2026-10-29T14:00:00Z")!!

    // ---- Tage -------------------------------------------------------------------

    @Test
    fun tage() {
        assertEquals(listOf("2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"), PlaetzeLogik.tage("2026-10-29", 3))
        assertEquals(listOf("2026-12-31", "2027-01-01"), PlaetzeLogik.tage("2026-12-31", 1))
        // Ueber die Zeitumstellung hinweg bleibt es ein Kalendertag.
        assertEquals("2026-10-25", PlaetzeLogik.verschiebe("2026-10-24", 1))
        assertEquals("2026-03-28", PlaetzeLogik.verschiebe("2026-03-29", -1))
    }

    @Test
    fun tageszeile() {
        assertEquals("Heute, 29.10.", PlaetzeLogik.tageszeile("2026-10-29", "2026-10-29"))
        assertEquals("Morgen, 30.10.", PlaetzeLogik.tageszeile("2026-10-30", "2026-10-29"))
        assertEquals("Sa., 31.10.", PlaetzeLogik.tageszeile("2026-10-31", "2026-10-29"))
        assertEquals("Donnerstag, 05. November", PlaetzeLogik.lesbar("2026-11-05"))
        assertEquals("Montag, 28.09.", PlaetzeLogik.tagText("2026-09-28"))
        assertEquals("MO", PlaetzeLogik.kachel("2026-09-28").wochentag)
        assertEquals(28, PlaetzeLogik.kachel("2026-09-28").tag)
        assertEquals("HEUTE", PlaetzeLogik.kachel("2026-09-28", heute = "2026-09-28").wochentag)
    }

    // ---- Kontingent und Plan ------------------------------------------------------

    @Test
    fun kontingent() {
        assertNull(PlaetzeLogik.kontingentText(Kontingent(used = 3, allowed = 0)))
        assertFalse(PlaetzeLogik.kontingentAus(Kontingent(used = 3, allowed = 0)))
        assertTrue(PlaetzeLogik.kontingentAus(Kontingent(used = 2, allowed = 2)))
        assertEquals(
            "Kontingent: 1 von 2 offenen Buchungen. Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit.",
            PlaetzeLogik.kontingentText(Kontingent(used = 1, allowed = 2)),
        )
    }

    @Test
    fun oeffnebar() {
        val sperre = belegung("kind" to "blocking")
        assertFalse(PlaetzeLogik.oeffnebar(sperre, darfPlaetze = false))
        assertTrue(PlaetzeLogik.oeffnebar(sperre, darfPlaetze = true))
        assertTrue(PlaetzeLogik.oeffnebar(belegung(), darfPlaetze = false))
        // Ein Training ist eine Serie, keine Sperrung: ansehen darf jeder.
        assertTrue(PlaetzeLogik.oeffnebar(belegung("kind" to "blocking", "series_id" to "s"), darfPlaetze = false))
    }

    @Test
    fun startzeitenUndStunde() {
        // 17:30-18:30 belegt: um 16 Uhr gehen beide Haelften, um 17 Uhr keine, um 18 Uhr nur 18:30.
        val b = belegung("starts_at" to "2026-10-29T16:30:00Z", "ends_at" to "2026-10-29T17:30:00Z")
        fun zeiten(stunde: Int) = PlaetzeLogik.startzeiten("2026-10-29", "c1", stunde, 60, 30, 60, 1260, listOf(b), 7, jetzt)
        assertEquals(listOf(960, 990), zeiten(960))
        assertEquals(emptyList<Int>(), zeiten(1020))
        assertEquals(listOf(1110), zeiten(1080))
        assertEquals(1020, PlaetzeLogik.stunde(1050, oeffnung = 480, anzeige = 60))
        assertEquals(1020, PlaetzeLogik.stunde(1020, oeffnung = 480, anzeige = 60))
    }

    @Test
    fun platzNummer() {
        assertEquals("3", PlaetzeLogik.platzNummer("Platz 3", "P3"))
        assertEquals("CC", PlaetzeLogik.platzNummer("Center Court", "CC"))
    }

    @Test
    fun drossel() {
        val t0 = Instant.ofEpochSecond(1000)
        assertEquals(Duration.ZERO, PlaetzeLogik.drosselWartezeit(t0, null))
        assertEquals(Duration.ofMillis(700), PlaetzeLogik.drosselWartezeit(t0.plusMillis(300), t0))
        assertEquals(Duration.ZERO, PlaetzeLogik.drosselWartezeit(t0.plusMillis(1500), t0))
    }

    @Test
    fun freiText() {
        assertEquals("voll", PlaetzeLogik.freiText(0))
        assertEquals("2 frei", PlaetzeLogik.freiText(2))
        assertEquals("1 Platz frei", PlaetzeLogik.freiLabel(1))
        assertEquals("3 Plätze frei", PlaetzeLogik.freiLabel(3))
    }

    // ---- Buchungsblatt --------------------------------------------------------------

    private val einzel = BookingTypeInfo("einzel", "Einzel", 60, minPlayers = 2, maxPlayers = 2, requiresPartner = true)
    private val doppel = BookingTypeInfo("doppel", "Doppel", 90, minPlayers = 3, maxPlayers = 4, requiresPartner = true)

    @Test
    fun buchenHinweis() {
        val einschalten = "Noch 1 Mitspieler wählen – oder „Mitspieler gesucht“ einschalten."
        assertEquals(einschalten, PlaetzeLogik.buchenHinweis(einzel, 0, 0, sucht = false))
        assertNull(PlaetzeLogik.buchenHinweis(einzel, 0, 0, sucht = true))
        assertNull(PlaetzeLogik.buchenHinweis(einzel, 1, 0, sucht = false))
        assertEquals(einschalten, PlaetzeLogik.buchenHinweis(doppel, 1, 0, sucht = false))
        assertNull(PlaetzeLogik.buchenHinweis(doppel, 1, 1, sucht = false))
        assertNull(PlaetzeLogik.buchenHinweis(null, 0, 0, sucht = false))
    }

    @Test
    fun kuerze() {
        val k = PlaetzeLogik.kuerze(listOf("a", "b"), listOf("Gast"), maxPlayers = 2)
        assertEquals(listOf("a"), k.mitglieder)
        assertEquals(emptyList<String>(), k.gaeste)
        assertEquals(2, PlaetzeLogik.kuerze(listOf("a"), listOf("Gast", "Gast", "Gast"), maxPlayers = 4).gaeste.size)
    }

    @Test
    fun treffer() {
        val verzeichnis = listOf(
            Mitglied("1", "Eva", "Muster"),
            Mitglied("2", "Max", "Mustermann"),
            Mitglied("3", "Jonas", "Berg"),
        )
        assertEquals(listOf("1", "2"), PlaetzeLogik.treffer("must", verzeichnis, emptyList()).map { it.id })
        assertEquals(listOf("1"), PlaetzeLogik.treffer("Muster Eva", verzeichnis, emptyList()).map { it.id })
        assertEquals(listOf("2"), PlaetzeLogik.treffer("must", verzeichnis, listOf("1")).map { it.id })
        assertEquals(emptyList<Mitglied>(), PlaetzeLogik.treffer("  ", verzeichnis, emptyList()))
        // Hoechstens sechs Treffer
        val viele = (1..10).map { Mitglied("$it", "Anna", "Nummer $it") }
        assertEquals(PlaetzeLogik.TREFFER_MAX, PlaetzeLogik.treffer("anna", viele, emptyList()).size)
    }

    @Test
    fun initialenUndGast() {
        assertEquals("EM", PlaetzeLogik.initialen("eva", "Muster"))
        assertEquals("?", PlaetzeLogik.initialen(null, null))
        assertEquals("EM", PlaetzeLogik.initialenAusName("Eva Maria Muster"))
        assertEquals("Gast", PlaetzeLogik.gastText(0))
        assertEquals("Gast · 5,00 €", PlaetzeLogik.gastText(500))
        assertEquals(
            "Für jeden Gast werden 5,00 € berechnet und mit der nächsten Lastschrift eingezogen.",
            PlaetzeLogik.gastHinweis(500),
        )
    }

    @Test
    fun sperrTexte() {
        assertEquals(3, PlaetzeLogik.kollisionen("3 Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen."))
        assertNull(PlaetzeLogik.kollisionen("Dafür fehlt dir die Berechtigung."))
        assertEquals("1 Buchung verdrängen", PlaetzeLogik.verdraengenText(1))
        assertEquals("2 Buchungen verdrängen", PlaetzeLogik.verdraengenText(2))
        assertEquals("Sperrung geändert.", PlaetzeLogik.sperreGeaendert(0))
        assertEquals("Sperrung geändert, 1 Buchung verdrängt.", PlaetzeLogik.sperreGeaendert(1))
        assertEquals("1 Buchung liegt im Weg. Sie wird abgesagt, die Mitglieder bekommen Bescheid.", PlaetzeLogik.imWegText(1))
    }

    // ---- Verwalten ----------------------------------------------------------------------

    @Test
    fun eigeneBuchungVorBeginn() {
        val b = belegung("is_own" to true, "type_name" to "Einzel", "partner_wanted" to true, "frei" to 1)
        val v = Verwalten(b, darfPlaetze = false, jetzt = jetzt)
        assertTrue(v.darfVerwalten)
        assertFalse(v.kannMitspielen)
        assertFalse(v.kannUmsetzen)
        assertFalse(v.grundNoetig)
        assertEquals("Einzel · gebucht von dir", v.untertitel)
        assertEquals("Buchung stornieren", v.stornoText(bestaetigen = false))
        assertEquals("Wirklich stornieren", v.stornoText(bestaetigen = true))
        assertEquals("Hier wird noch ein Mitspieler gesucht.", Verwalten.suchtText(b))
    }

    @Test
    fun fremdeBuchungMitspielen() {
        val b = belegung("owner_name" to "Eva Muster", "type_name" to "Doppel", "partner_wanted" to true, "frei" to 2)
        val v = Verwalten(b, darfPlaetze = false, jetzt = jetzt)
        assertFalse(v.darfVerwalten)
        assertTrue(v.kannMitspielen)
        assertEquals("Doppel · gebucht von Eva Muster", v.untertitel)
        assertEquals("Hier werden noch 2 Mitspieler gesucht.", Verwalten.suchtText(b))
        // Schon eingetragen: nicht noch einmal mitspielen.
        val dabei = belegung("partner_wanted" to true, "frei" to 1, "bin_dabei" to true)
        assertFalse(Verwalten(dabei, darfPlaetze = false, jetzt = jetzt).kannMitspielen)
    }

    @Test
    fun platzrechte() {
        val fremd = belegung("owner_name" to "Eva Muster", "type_name" to "Einzel")
        val v = Verwalten(fremd, darfPlaetze = true, jetzt = jetzt)
        assertTrue(v.darfVerwalten)
        assertTrue(v.kannUmsetzen)
        assertTrue(v.grundNoetig)

        val s = Verwalten(belegung("kind" to "blocking", "type_name" to "Platzpflege", "title" to "Regen"), true, jetzt)
        assertTrue(s.nurStorno)
        assertTrue(s.kannSperreAendern)
        assertFalse(s.kannUmsetzen)
        assertFalse(s.grundNoetig)
        assertFalse(s.grundFeld)
        assertEquals("Gesperrt · Platzpflege", s.untertitel)
        assertEquals("Sperrung aufheben", s.stornoText(bestaetigen = false))
        assertEquals("Wirklich aufheben", s.stornoText(bestaetigen = true))

        val training = belegung("kind" to "blocking", "series_id" to "s1", "title" to "Training", "type_name" to "Training")
        val t = Verwalten(training, darfPlaetze = true, jetzt = jetzt)
        assertTrue(t.serientermin)
        assertFalse(t.kannSperreAendern)
        assertTrue(t.grundFeld)
        assertEquals("Training · Serientermin", t.untertitel)
        assertEquals("Fällt diese Woche aus", t.stornoText(bestaetigen = false))
        assertEquals("Termin wirklich absagen", t.stornoText(bestaetigen = true))
    }

    @Test
    fun nachBeginn() {
        // Laeuft seit 14:30 Berlin: der Bucher darf nichts mehr, Platzrechte schon.
        val b = belegung("is_own" to true, "starts_at" to "2026-10-29T13:30:00Z", "ends_at" to "2026-10-29T14:30:00Z")
        assertFalse(Verwalten(b, darfPlaetze = false, jetzt = jetzt).darfVerwalten)
        assertTrue(Verwalten(b, darfPlaetze = false, jetzt = jetzt).laeuftSchon)
        assertTrue(Verwalten(b, darfPlaetze = true, jetzt = jetzt).darfVerwalten)
        assertTrue(Verwalten(b, darfPlaetze = true, jetzt = jetzt).kannUmsetzen)
    }

    @Test
    fun sperrZeit() {
        val z = Platzplan.sperrZeit(belegung("starts_at" to "2026-10-29T21:00:00Z", "ends_at" to "2026-10-30T01:00:00Z"))
        assertEquals(22 * 60, z.von)
        assertEquals(24 * 60, z.bis)
    }

    // ---- Lesen ----------------------------------------------------------------------------

    @Test
    fun kontingentUndMitglied() {
        val json = SupabaseVerbindung.json
        assertEquals(Kontingent(1, 2), json.decodeFromString<List<Kontingent>>("""[{"used":1,"allowed":2}]""").first())
        assertEquals(Kontingent.LEER, json.decodeFromString<Kontingent>("""{"used":null,"allowed":null}"""))
        val m = json.decodeFromString<List<Mitglied>>("""[{"id":"x","first_name":"Eva","last_name":"Muster"}]""")
        assertEquals("Eva Muster", m.first().name)
    }

    @Test
    fun tagesBelegungMitLueckenUndNeuenSpalten() {
        val b = SupabaseVerbindung.json.decodeFromString<TagesBelegung>(
            """{"booking_id":"b","court_id":"c","starts_at":"2026-10-29T16:00:00+00:00","ends_at":"2026-10-29T17:00:00+00:00",
               "players":["Eva",null],"guest_names":null,"neu":"egal"}""",
        )
        assertEquals(listOf("Eva", null), b.players)
        assertNull(b.guestNames)
        assertNull(b.isOwn)
    }
}
