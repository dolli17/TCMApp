package de.tcmuckensturm.app.bildschirme.verein

import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Getraenk
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.kern.Getraenke
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Veranstaltungen
import de.tcmuckensturm.kern.Zeit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verein: Decoding der Modelle mit Beispiel-JSON, die Texte der Bildschirme
 * (VereinLogik, wortgleich mit getraenke.tsx und veranstaltung/[id].tsx) und
 * der Korb im VereinZustand mit seiner Erinnerung - wie VereinLogikTests der iOS-App.
 */
class VereinLogikTest {
    private val json = Json { ignoreUnknownKeys = true }

    private val fest = """
        {"id":"fest","kind":"fest","title":"Saisonabschlussfest","description":null,"location":"Clubhaus",
         "status":"published","starts_at":"2026-11-06T18:00:00+00:00","ends_at":"2026-11-06T22:30:00+00:00",
         "registration_enabled":true,"registration_deadline":"2026-10-30T22:59:00+00:00","max_participants":80,
         "companions_allowed":true,"fee_cents":1800,"work_hours":null,"personen":62,"warteliste":0,
         "mein_status":"registered","meine_begleitpersonen":1,"meine_bemerkung":"vegetarisch",
         "meine_forderung_cents":3600,"meine_forderung_status":"open"}
    """.trimIndent()

    private fun event(vararg aenderung: Pair<String, Any?>): MitgliedEvent {
        val objekt = json.parseToJsonElement(fest).jsonObject.toMutableMap()
        for ((k, v) in aenderung) {
            objekt[k] = when (v) {
                null -> JsonNull
                is String -> JsonPrimitive(v)
                is Number -> JsonPrimitive(v)
                is Boolean -> JsonPrimitive(v)
                else -> v as JsonElement
            }
        }
        return json.decodeFromJsonElement(JsonObject(objekt))
    }

    private val vorher = Zeit.datum("2026-10-20T10:00:00Z")!!
    private val nachSchluss = Zeit.datum("2026-11-02T10:00:00Z")!!
    private val danach = Zeit.datum("2026-11-08T10:00:00Z")!!

    // ---- Decoding ----

    @Test
    fun eventMitEigenerForderung() {
        val e = event()
        assertEquals(3600, e.meineForderungCents)
        assertEquals("open", e.meineForderungStatus)
        assertEquals(1, e.meineBegleitpersonen)
    }

    @Test
    fun eventOhneForderungsspalten() {
        // Aeltere Server liefern die Spalten nicht; die App bleibt trotzdem lesbar.
        val e = json.decodeFromString<MitgliedEvent>("""{"id":"x","starts_at":"2026-11-06T18:00:00Z","work_hours":"2.5"}""")
        assertNull(e.meineForderungCents)
        assertEquals(2.5, e.workHours!!, 0.0)
        assertEquals(3.0, json.decodeFromString<MitgliedEvent>("""{"id":"x","starts_at":"x","work_hours":3}""").workHours!!, 0.0)
    }

    @Test
    fun getraenkekarte() {
        val karte = json.decodeFromString<List<Getraenk>>(
            """
            [{"id":"a","name":"Bier","category":"bier","description":"0,5 l","price_cents":250,"sort_order":1},
             {"id":"b","name":"Wasser","category":null,"description":null,"price_cents":null,"sort_order":null}]
            """,
        )
        assertEquals(listOf("Bier", "Wasser"), karte.map { it.name })
        assertEquals("2,50 € · 0,5 l", VereinLogik.artikelZeile(karte[0]))
        assertEquals("0,00 €", VereinLogik.artikelZeile(karte[1]))
    }

    // ---- Getraenke ----

    @Test
    fun entnahme() {
        val g = json.decodeFromString<EigenesGetraenk>(
            """
            {"id":"g","item_name":"Bier","quantity":2,"unit_price_cents":250,"total_cents":500,
             "created_at":"2026-10-29T17:05:00+00:00","voided_at":null,"source":"kiosk"}
            """,
        )
        assertEquals("2× Bier", VereinLogik.entnahmeTitel(g))
        assertEquals("Do., 29.10., 18:05 · Theke", VereinLogik.entnahmeZeile(g))
        val zurueck = json.decodeFromString<EigenesGetraenk>(
            """{"id":"h","item_name":"Wasser","quantity":1,"created_at":"2026-07-01T08:00:00Z","voided_at":"2026-07-01T08:01:00Z","source":"neu"}""",
        )
        assertEquals("Wasser", VereinLogik.entnahmeTitel(zurueck))
        assertEquals("Mi., 01.07., 10:00 · App · zurückgenommen", VereinLogik.entnahmeZeile(zurueck))
    }

    @Test
    fun quelle() {
        assertEquals("Theke", VereinLogik.quelleText("kiosk"))
        assertEquals("Thekendienst", VereinLogik.quelleText("bar_duty"))
        assertEquals("App", VereinLogik.quelleText("app"))
        assertEquals("App", VereinLogik.quelleText(null))
    }

    @Test
    fun monatUndLeiste() {
        assertEquals("Oktober · läuft noch", VereinLogik.monatKicker(vorher))
        assertEquals("1 Entnahme · wird mit der Monatsabrechnung eingezogen", VereinLogik.entnahmenText(1))
        assertEquals("0 Entnahmen · wird mit der Monatsabrechnung eingezogen", VereinLogik.entnahmenText(0))
        assertEquals("1 Getränk · 2,50 €", VereinLogik.korbZeile(1, 250))
        assertEquals("3 Getränke · 6,50 €", VereinLogik.korbZeile(3, 650))
        assertEquals("Eine Entnahme lässt sich 15 Minuten lang selbst zurücknehmen.", VereinLogik.stornoHinweis(15))
        assertEquals(
            "2 Getränke (5,00 €) sind noch nicht eingetragen. Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt.",
            VereinLogik.erinnerung(2, 500),
        )
    }

    @Test
    fun canVoidSelfOhneZeitpunkt() {
        assertFalse(Getraenke.canVoidSelf(null, null, 15, vorher))
        assertFalse(Getraenke.canVoidSelf("kaputt", null, 15, vorher))
    }

    @Test
    fun hervorhebung() {
        assertTrue(Hervorhebung.Neu(setOf("a")).trifft("b"))
        assertFalse(Hervorhebung.Neu(setOf("a")).trifft("a"))
        assertTrue(Hervorhebung.Eine("a").trifft("a"))
        assertFalse(Hervorhebung.Eine("a").trifft("b"))
    }

    @Test
    fun initialen() {
        assertEquals("", VereinLogik.initialen(null))
        assertEquals("LD", VereinLogik.initialen(Ich(firstName = "lucas", lastName = "Dollmann")))
        assertEquals("M", VereinLogik.initialen(Ich(firstName = "Mia")))
    }

    // ---- Veranstaltung im Detail ----

    @Test
    fun belegungAnteil() {
        assertEquals(0.775, Veranstaltungen.eventBelegungAnteil(event())!!, 0.0001)
        assertNull(Veranstaltungen.eventBelegungAnteil(event("max_participants" to null)))
        assertEquals(1.0, Veranstaltungen.eventBelegungAnteil(event("personen" to 90))!!, 0.0)
    }

    @Test
    fun dabeiNurOhneAbsage() {
        assertTrue(VereinLogik.dabei(event()))
        assertFalse(VereinLogik.dabei(event("status" to "cancelled")))
        assertFalse(VereinLogik.dabei(event("mein_status" to "cancelled")))
        assertTrue(VereinLogik.dabei(event("mein_status" to "waitlisted")))
    }

    @Test
    fun forderung() {
        assertEquals("steht in deinem Konto unter „Offen“", VereinLogik.forderungText("open"))
        assertEquals("steht in deinem Konto unter „Offen“", VereinLogik.forderungText("returned"))
        assertEquals("ist im Einzug", VereinLogik.forderungText("submitted"))
        assertEquals("ist im Einzug", VereinLogik.forderungText(null))
    }

    @Test
    fun knoepfeUndFragen() {
        val e = event()
        assertEquals("Änderung sichern · 54,00 €", VereinLogik.aenderungKnopf(e, 2))
        assertEquals("Änderung sichern", VereinLogik.aenderungKnopf(event("mein_status" to "waitlisted"), 2))
        assertEquals("Wirklich abmelden?", VereinLogik.abmeldenFrage(e, vorher))
        assertEquals(
            "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?",
            VereinLogik.abmeldenFrage(e, nachSchluss),
        )
        assertEquals("Wirklich abmelden?", VereinLogik.abmeldenFrage(event("mein_status" to "waitlisted"), nachSchluss))
        assertEquals("je 18,00 €", VereinLogik.begleitHinweis(e))
        assertEquals("Familie, Freunde", VereinLogik.begleitHinweis(event("fee_cents" to null)))
        assertEquals(
            "Auch für Begleitpersonen. Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen.",
            VereinLogik.preisHinweis(e),
        )
        assertTrue(VereinLogik.wartelisteVorab(2).startsWith("Für euch alle ist gerade kein Platz frei"))
        assertTrue(VereinLogik.wartelisteVorab(0).startsWith("Für dich ist gerade kein Platz frei"))
    }

    @Test
    fun nichtsZuTun() {
        assertEquals("Diese Veranstaltung ist abgesagt.", VereinLogik.nichtsZuTun(event("status" to "cancelled"), vorher))
        assertEquals("Diese Veranstaltung ist vorbei.", VereinLogik.nichtsZuTun(event(), danach))
        assertEquals(
            "Ohne Anmeldung – komm einfach vorbei.",
            VereinLogik.nichtsZuTun(event("registration_enabled" to false), vorher),
        )
        assertEquals("Der Anmeldeschluss ist vorbei.", VereinLogik.nichtsZuTun(event(), nachSchluss))
        assertEquals(
            "Die Veranstaltung läuft schon.",
            VereinLogik.nichtsZuTun(event(), Zeit.datum("2026-11-06T19:00:00Z")!!),
        )
    }

    @Test
    fun marken() {
        assertEquals(listOf("Fest"), VereinLogik.marken(event(), vorher).map { it.text })
        assertEquals(listOf("Fest", "Abgeschlossen"), VereinLogik.marken(event(), danach).map { it.text })
        assertEquals(listOf("Fest", "Abgesagt"), VereinLogik.marken(event("status" to "cancelled"), vorher).map { it.text })
    }

    @Test
    fun kartenBeschreibung() {
        assertEquals("Saisonabschlussfest, Fr 19–23:30 Uhr · Clubhaus, Angemeldet · 2", VereinLogik.kartenBeschreibung(event(), vorher))
        val offen = event("mein_status" to null)
        assertEquals("Saisonabschlussfest, Fr 19–23:30 Uhr · Clubhaus", VereinLogik.kartenBeschreibung(offen, vorher))
        assertEquals(
            "Saisonabschlussfest, Fr 19–23:30 Uhr · Clubhaus, Anmelden",
            VereinLogik.kartenBeschreibung(offen, vorher, aufforderung = true),
        )
    }

    @Test
    fun reiterAusGemerktem() {
        assertEquals(VereinReiter.GETRAENKE, VereinReiter.aus(null))
        assertEquals(VereinReiter.GETRAENKE, VereinReiter.aus("quatsch"))
        assertEquals(VereinReiter.VERANSTALTUNGEN, VereinReiter.aus("veranstaltungen"))
    }

    // ---- Korb und Erinnerung ----

    private class Speicher(var wert: String? = null) : Reiterspeicher {
        override fun lesen() = wert

        override fun schreiben(wert: String) {
            this.wert = wert
        }
    }

    @Test
    fun erinnerungNurMitVollemKorb() {
        val speicher = Speicher()
        val z = VereinZustand(speicher)
        assertEquals(VereinReiter.GETRAENKE, z.reiter)
        z.karte = json.decodeFromString(
            """[{"id":"bier","name":"Bier","price_cents":250},{"id":"wasser","name":"Wasser","price_cents":150}]""",
        )

        z.wechsle(VereinReiter.VERANSTALTUNGEN)
        assertNull("leerer Korb: keine Rueckfrage", z.erinnerung)

        z.wechsle(VereinReiter.GETRAENKE)
        z.korb = mapOf("bier" to 2, "wasser" to 1, "weg" to 3)
        assertEquals(3 to 650, z.korbSumme)
        z.wechsle(VereinReiter.VERANSTALTUNGEN)
        assertEquals(VereinLogik.erinnerung(3, 650), z.erinnerung)
        assertEquals("der Korb bleibt", 2, z.korb["bier"])
        assertEquals("veranstaltungen", speicher.wert)

        z.erinnerung = null
        z.oeffne(VereinZiel.Veranstaltung("e1"))
        assertNull("schon auf den Veranstaltungen: keine neue Rueckfrage", z.erinnerung)
        z.oeffne(VereinZiel.Getraenke)
        assertEquals(VereinReiter.GETRAENKE, z.reiter)
        assertEquals("getraenke", speicher.wert)
    }

    @Test
    fun gemerkterReiterGiltBeimStart() {
        assertEquals(VereinReiter.VERANSTALTUNGEN, VereinZustand(Speicher("veranstaltungen")).reiter)
    }

    @Test
    fun erinnerungAmTabWechsel() {
        val z = VereinZustand(Speicher())
        z.karte = listOf(Getraenk("bier", "Bier", priceCents = 250))
        z.erinnereAnKorb()
        assertNull(z.erinnerung)
        z.korb = Getraenke.changeBasket(z.korb, "bier", 1)
        z.erinnereAnKorb()
        assertEquals("1 Getränk (2,50 €) ist noch nicht eingetragen. Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt.", z.erinnerung)
    }
}
