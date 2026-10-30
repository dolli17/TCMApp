package de.tcmuckensturm.app.bildschirme.verwaltung

import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.daten.Serie
import de.tcmuckensturm.app.daten.SerienTermin
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.daten.VerwalteterPlatz
import de.tcmuckensturm.app.start.Umgebung
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verwaltung: die reinen Funktionen aus VerwaltungLogik mit denselben
 * Faellen wie VerwaltungTests.swift der iOS-App und
 * apps/mobile/src/lib/verwaltung/plaetze.test.ts (normZeit, zustandJetzt,
 * Pruefen vor dem Sperren, pruefeSerie, Meldungen), dazu Sichtbarkeit,
 * Datumsumwandlung und das Decoding der Modelle.
 */
class VerwaltungLogikTest {
    private inline fun <reified T> lies(json: String): T = SupabaseVerbindung.json.decodeFromString(json)

    private fun zeit(iso: String): Instant = Zeit.datum(iso)!!

    private val platz = "11111111-1111-4111-8111-111111111111"

    private val serie = SerienEingabe(
        courtId = platz, bookingTypeCode = "training", weekday = 2, startTime = "18:30", endTime = "20:00",
        validFrom = "01.10.2026", validTo = "31.10.2026", title = "Training Herren",
    )

    private val Result<*>.fehlerText: String? get() = exceptionOrNull()?.message

    // ---- Sichtbarkeit -------------------------------------------------------------------

    @Test
    fun sichtbarNurMitPlatzrechten() {
        val platzwart = lies<List<Ich>>("""[{"member_id":"m","admin":false,"platz_rechte":true}]""").first()
        val admin = lies<List<Ich>>("""[{"member_id":"m","admin":true,"platz_rechte":true}]""").first()
        val mitglied = lies<List<Ich>>("""[{"member_id":"m","admin":false,"platz_rechte":false}]""").first()
        assertTrue(VerwaltungLogik.sichtbar(platzwart))
        assertTrue(VerwaltungLogik.sichtbar(admin))
        assertFalse(VerwaltungLogik.sichtbar(mitglied))
        assertFalse(VerwaltungLogik.sichtbar(null))
        assertFalse(VerwaltungLogik.sichtbar(lies<List<Ich>>("""[{"member_id":null}]""").first()))
    }

    @Test
    fun webLinkJeNachRechten() {
        assertEquals("/admin", VerwaltungLogik.webPfad(admin = true))
        assertEquals("/admin/plaetze", VerwaltungLogik.webPfad(admin = false))
        assertEquals("Plätze & Serien am PC", VerwaltungLogik.webTitel(admin = false))
        assertEquals("Weitere Verwaltung am PC", VerwaltungLogik.webTitel(admin = true))
        assertTrue(VerwaltungLogik.webText(admin = true).startsWith("Mitglieder, Kasse"))
    }

    @Test
    fun webLinkAusDerUmgebung() {
        val u = Umgebung.aus("https://x.supabase.co", "k", "https://tcm.example/", "")
        assertEquals("https://tcm.example/admin/plaetze", u.webLink(VerwaltungLogik.webPfad(admin = false)))
        assertEquals("https://tcm.example/admin", u.webLink(VerwaltungLogik.webPfad(admin = true)))
        // Lokal ohne Webadresse: kein Link, nur der Satz.
        assertNull(Umgebung.aus("https://x.supabase.co", "k", "", "").webLink("/admin"))
    }

    // ---- normZeit -----------------------------------------------------------------------

    @Test
    fun normZeitNimmtKurzeStundenUndPunktAn() {
        assertEquals("08:00", VerwaltungLogik.normZeit("8:00"))
        assertEquals("18:30", VerwaltungLogik.normZeit(" 18.30 "))
        assertEquals("24:00", VerwaltungLogik.normZeit("24:00"))
    }

    @Test
    fun normZeitWeistUnsinnAb() {
        assertNull(VerwaltungLogik.normZeit("25:00"))
        assertNull(VerwaltungLogik.normZeit("8:60"))
        assertNull(VerwaltungLogik.normZeit("acht"))
        assertNull(VerwaltungLogik.normZeit("24:30"))
        assertNull(VerwaltungLogik.normZeit("8:0"))
    }

    // ---- Datum --------------------------------------------------------------------------

    @Test
    fun deutschZuIso() {
        assertEquals("2026-09-29", VerwaltungLogik.deutschZuIso("29.09.2026"))
        assertEquals("2026-09-29", VerwaltungLogik.deutschZuIso("29.9.26"))
        assertEquals("2026-09-29", VerwaltungLogik.deutschZuIso("2026-09-29"))
        assertNull(VerwaltungLogik.deutschZuIso("31.02.2026"))
        assertNull(VerwaltungLogik.deutschZuIso("29.13.2026"))
        assertNull(VerwaltungLogik.deutschZuIso("morgen"))
    }

    @Test
    fun isoZuDeutsch() {
        assertEquals("29.09.2026", VerwaltungLogik.isoZuDeutsch("2026-09-29"))
        assertEquals("", VerwaltungLogik.isoZuDeutsch(null))
        assertEquals("", VerwaltungLogik.isoZuDeutsch(""))
    }

    // ---- zustandJetzt -------------------------------------------------------------------

    private fun plan(json: String): List<TagesBelegung> = lies(json)

    @Test
    fun zustandNenntLaufendeSperrungUndSerieNichtAberBuchungen() {
        val p = plan(
            """
            [
              {"booking_id":"1","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T12:00:00Z"},
              {"booking_id":"2","court_id":"b","kind":"blocking","series_id":"s","starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T11:00:00Z"},
              {"booking_id":"3","court_id":"c","kind":"booking","starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T11:00:00Z"},
              {"booking_id":"4","court_id":"d","kind":"blocking","starts_at":"2026-09-29T12:00:00Z","ends_at":"2026-09-29T13:00:00Z"}
            ]
            """,
        )
        // 12:00 UTC ist 14:00 in Berlin (Sommerzeit)
        assertEquals(
            mapOf(
                "a" to PlatzJetzt(PlatzJetzt.Art.GESPERRT, "gesperrt bis 14:00"),
                "b" to PlatzJetzt(PlatzJetzt.Art.SERIE, "Serie bis 13:00"),
            ),
            VerwaltungLogik.zustandJetzt(p, zeit("2026-09-29T10:00:00Z")),
        )
    }

    @Test
    fun zustandZaehltDenBeginnMitDasEndeNicht() {
        val p = plan(
            """[{"booking_id":"1","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T10:00:00Z"}]""",
        )
        assertEquals(
            mapOf("a" to PlatzJetzt(PlatzJetzt.Art.GESPERRT, "gesperrt bis 12:00")),
            VerwaltungLogik.zustandJetzt(p, zeit("2026-09-29T09:00:00Z")),
        )
        assertEquals(emptyMap<String, PlatzJetzt>(), VerwaltungLogik.zustandJetzt(p, zeit("2026-09-29T10:00:00Z")))
    }

    @Test
    fun zustandNimmtJePlatzDenErstenLaufendenEintrag() {
        val p = plan(
            """
            [
              {"booking_id":"1","court_id":"a","kind":"blocking","series_id":"s","starts_at":"2026-12-01T09:00:00Z","ends_at":"2026-12-01T11:00:00Z"},
              {"booking_id":"2","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-12-01T09:30:00Z","ends_at":"2026-12-01T15:00:00Z"}
            ]
            """,
        )
        // Im Winter liegt Berlin nur eine Stunde vor UTC
        assertEquals(
            mapOf("a" to PlatzJetzt(PlatzJetzt.Art.SERIE, "Serie bis 12:00")),
            VerwaltungLogik.zustandJetzt(p, zeit("2026-12-01T10:00:00Z")),
        )
    }

    @Test
    fun zustandIstOhneEintraegeLeer() {
        assertEquals(emptyMap<String, PlatzJetzt>(), VerwaltungLogik.zustandJetzt(emptyList()))
    }

    @Test
    fun platzHinweis() {
        assertEquals("stillgelegt" to HinweisTon.LEISE, VerwaltungLogik.platzHinweis(aktiv = false, jetzt = null))
        assertEquals("frei" to HinweisTon.GRUEN, VerwaltungLogik.platzHinweis(aktiv = true, jetzt = null))
        val gesperrt = PlatzJetzt(PlatzJetzt.Art.GESPERRT, "gesperrt bis 14:00")
        val laufend = PlatzJetzt(PlatzJetzt.Art.SERIE, "Serie bis 13:00")
        assertEquals("gesperrt bis 14:00" to HinweisTon.ROT, VerwaltungLogik.platzHinweis(aktiv = true, jetzt = gesperrt))
        assertEquals(HinweisTon.GOLD, VerwaltungLogik.platzHinweis(aktiv = true, jetzt = laufend).second)
        // Ein stillgelegter Platz bleibt stillgelegt, auch wenn etwas auf ihm liegt.
        assertEquals("stillgelegt", VerwaltungLogik.platzHinweis(aktiv = false, jetzt = gesperrt).first)
        // Nur eine Sperrung fuehrt in den Platzplan.
        assertTrue(VerwaltungLogik.fuehrtZuPlaetzen(gesperrt))
        assertFalse(VerwaltungLogik.fuehrtZuPlaetzen(laufend))
        assertFalse(VerwaltungLogik.fuehrtZuPlaetzen(null))
    }

    // ---- Sperren ------------------------------------------------------------------------

    @Test
    fun sperreRechnetDieZeitenInBerlinerZeit() {
        val z = VerwaltungLogik.pruefeSperre(tag = "11.08.2026", von = "8:00", bis = "21:00").getOrThrow()
        assertEquals("2026-08-11T06:00:00.000Z", Zeit.iso(z.von))
        assertEquals("2026-08-11T19:00:00.000Z", Zeit.iso(z.bis))
    }

    @Test
    fun sperreWeistUnlesbaresDatumUndUhrzeitAb() {
        assertEquals(
            "Das Datum bitte als TT.MM.JJJJ angeben.",
            VerwaltungLogik.pruefeSperre(tag = "31.02.2026", von = "8:00", bis = "21:00").fehlerText,
        )
        assertEquals(
            "Uhrzeit als HH:MM angeben.",
            VerwaltungLogik.pruefeSperre(tag = "11.08.2026", von = "8 Uhr", bis = "21:00").fehlerText,
        )
    }

    @Test
    fun sperrMeldungen() {
        assertEquals("1 Platz gesperrt.", VerwaltungLogik.gesperrtMeldung(angelegt = 1, verdraengt = 0))
        assertEquals("3 Plätze gesperrt.", VerwaltungLogik.gesperrtMeldung(angelegt = 3, verdraengt = 0))
        assertEquals(
            "2 Plätze gesperrt, 4 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.",
            VerwaltungLogik.gesperrtMeldung(angelegt = 2, verdraengt = 4),
        )
        // Die Zahl der Kollisionen aus der Meldung der Datenbank
        assertEquals(3, PlaetzeLogik.kollisionen("3 Buchungen liegen im gewählten Zeitraum."))
    }

    // ---- Serien -------------------------------------------------------------------------

    @Test
    fun seriePrueftMitDemSchemaDesWebs() {
        assertEquals("Die Endzeit muss nach der Startzeit liegen.", VerwaltungLogik.pruefeSerie(serie.copy(endTime = "17:00")).fehlerText)
        assertEquals(
            "Das Enddatum darf nicht vor dem Startdatum liegen.",
            VerwaltungLogik.pruefeSerie(serie.copy(validTo = "01.09.2026")).fehlerText,
        )
        assertEquals("Titel fehlt.", VerwaltungLogik.pruefeSerie(serie.copy(title = " ")).fehlerText)
        assertEquals("Das Datum bitte als TT.MM.JJJJ angeben.", VerwaltungLogik.pruefeSerie(serie.copy(validFrom = "1.10.")).fehlerText)
        assertEquals("Uhrzeit als HH:MM angeben.", VerwaltungLogik.pruefeSerie(serie.copy(startTime = "halb sieben")).fehlerText)
        assertEquals("Die Angaben stimmen nicht.", VerwaltungLogik.pruefeSerie(serie.copy(courtId = "")).fehlerText)
        assertEquals("Die Angaben stimmen nicht.", VerwaltungLogik.pruefeSerie(serie.copy(weekday = 7)).fehlerText)
        assertEquals("Die Angaben stimmen nicht.", VerwaltungLogik.pruefeSerie(serie.copy(title = "x".repeat(201))).fehlerText)
    }

    @Test
    fun serieGibtDieWerteFuerDieRpcs() {
        val w = VerwaltungLogik.pruefeSerie(serie.copy(startTime = "9:00", endTime = "10.30")).getOrThrow()
        assertEquals("09:00", w.startTime)
        assertEquals("10:30", w.endTime)
        assertEquals("2026-10-01", w.validFrom)
        assertEquals("2026-10-31", w.validTo)
        assertEquals(2, w.weekday)
        assertEquals("Training Herren", w.title)
    }

    @Test
    fun serienMeldungen() {
        assertEquals(
            "Serie angelegt: 5 Termine, 2 bestehende Buchungen verdrängt und die Betroffenen benachrichtigt.",
            VerwaltungLogik.serieAngelegtMeldung(angelegt = 5, verdraengt = 2),
        )
        assertEquals("Serie angelegt: 5 Termine.", VerwaltungLogik.serieAngelegtMeldung(angelegt = 5, verdraengt = 0))
        assertEquals(
            "Serie geändert: 1 künftige Termin steht in der neuen Lage.",
            VerwaltungLogik.serieGeaendertMeldung(neu = 1, verdraengt = 0),
        )
        assertEquals(
            "Serie geändert: 3 Termine neu angelegt, 1 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.",
            VerwaltungLogik.serieGeaendertMeldung(neu = 3, verdraengt = 1),
        )
        assertEquals("Serie beendet. 4 künftige Termine wurden abgesagt.", VerwaltungLogik.serieBeendetMeldung(4))
        assertEquals("Serie beendet. 1 künftige Termin wurde abgesagt.", VerwaltungLogik.serieBeendetMeldung(1))
        assertEquals("Serie beendet. Es standen keine Termine mehr aus.", VerwaltungLogik.serieBeendetMeldung(0))
        assertEquals(2, VerwaltungLogik.terminKollisionen("2 Termine kollidieren mit Buchungen."))
        assertNull(VerwaltungLogik.terminKollisionen("Keine Berechtigung."))
    }

    @Test
    fun vorschauUndKnopf() {
        assertEquals(
            "5 Termine, nichts im Weg. Die Serie kann so angelegt werden.",
            VerwaltungLogik.vorschauText(termine = 5, kollisionen = 0),
        )
        assertTrue(VerwaltungLogik.vorschauText(termine = 5, kollisionen = 2).startsWith("2 Buchungen liegen im Weg."))
        assertEquals("Serie anlegen · 5 Termine", VerwaltungLogik.anlegenText(termine = 5, kollisionen = 0))
        assertEquals("Anlegen und 1 Buchung verdrängen", VerwaltungLogik.anlegenText(termine = 5, kollisionen = 1))
        // 16:30 UTC am 6.10. ist Dienstag 18:30 in Berlin
        assertEquals(
            "• Di, 06.10., 18:30 · Max Muster",
            VerwaltungLogik.kollisionsZeile(startsAt = "2026-10-06T16:30:00+00:00", mitglied = "Max Muster", art = "booking"),
        )
        assertTrue(VerwaltungLogik.kollisionsZeile(startsAt = "2026-10-06T16:30:00Z", mitglied = null, art = "blocking").endsWith("andere Blockung"))
        assertEquals("• unbekannt", VerwaltungLogik.kollisionsZeile(startsAt = "gestern", mitglied = null, art = "booking"))
    }

    @Test
    fun serienZeile() {
        assertEquals("Dienstag · 18:30 – 20:00", VerwaltungLogik.serienZeit(weekday = 2, start = "18:30:00", ende = "20:00:00"))
        assertEquals(
            "Training · Platz 1 · bis 31.10.2026",
            VerwaltungLogik.serienKontext(typ = "Training", platz = "Platz 1", bis = "2026-10-31"),
        )
        assertEquals("Platz 1 · Dienstag · Training", VerwaltungLogik.serienUnterzeile("Platz 1", 2, "Training"))
        assertEquals("3", VerwaltungLogik.platzChip("P3"))
        assertEquals("3", VerwaltungLogik.platzOhneWort("Platz 3"))
        assertEquals("08:00", VerwaltungLogik.uhrzeit("08:00:00", ersatz = "07:00"))
        assertEquals("21:00", VerwaltungLogik.uhrzeit(null, ersatz = "21:00"))
        // Die Datenbank zaehlt ab Sonntag, die Wahl beginnt am Montag.
        assertEquals(listOf(1, 2, 3, 4, 5, 6, 0), VerwaltungLogik.wochentagWahl.map { it.first })
    }

    // ---- Decoding -----------------------------------------------------------------------

    @Test
    fun modelleLesen() {
        val plaetze = lies<List<VerwalteterPlatz>>(
            """
            [{"id":"p1","name":"Platz 1","short_name":"P1","subline":"Sand","sort_position":1,"active":true,"offene_buchungen":3},
             {"id":"p2","name":"Platz 2","short_name":"P2","subline":null,"sort_position":2,"active":false,"offene_buchungen":0},
             {"id":"p3","neue_spalte":1}]
            """,
        )
        assertEquals(listOf(true, false, true), plaetze.map { it.aktiv })
        val serien = lies<List<Serie>>(
            """
            [{"id":"s1","court_name":"Platz 1","type_name":"Training","title":"Herren","weekday":2,
              "start_time":"18:30:00","end_time":"20:00:00","valid_from":"2026-10-01","valid_to":"2026-10-31","kuenftige":4}]
            """,
        )
        assertEquals(4, serien.first().kuenftige)
        val termine = lies<List<SerienTermin>>(
            """
            [{"starts_at":"2026-10-06T16:30:00+00:00","ends_at":"2026-10-06T18:00:00+00:00","conflict_booking_id":null,
              "conflict_member_name":null,"conflict_kind":null}]
            """,
        )
        assertNull(termine.first().conflictBookingId)
    }
}
