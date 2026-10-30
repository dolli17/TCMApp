package de.tcmuckensturm.app.widgets

import de.tcmuckensturm.app.bildschirme.home.FreiDaten
import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.push.PushZiel
import de.tcmuckensturm.app.widgets.WidgetBeispiel.JETZT
import de.tcmuckensturm.app.widgets.WidgetBeispiel.berlin
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.TimelineSegment
import de.tcmuckensturm.kern.Zeit
import java.time.Duration
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Schnappschuss, Zeitplan, Aufbereitung und Links der Widgets - wie WidgetTests.swift. */
class WidgetLogikTest {
    private val beispiel = WidgetBeispiel.schnappschuss()

    // ---- Schnappschuss --------------------------------------------------------------

    @Test
    fun kodierungHinUndZurueck() {
        val text = WidgetSchnappschuss.kodieren(beispiel)
        assertEquals(beispiel, WidgetSchnappschuss.dekodieren(text))
        // Zeitpunkte als ISO-Text, lesbar fuer Menschen und andere Werkzeuge
        assertTrue(text.contains("\"stand\":\"2026-09-28T12:00:00Z\""))
    }

    @Test
    fun fremdeVersionOderKaputteDateiGiltAlsLeer() {
        val fremd = beispiel.copy(version = WidgetSchnappschuss.AKTUELLE_VERSION + 1)
        assertNull(WidgetSchnappschuss.dekodieren(WidgetSchnappschuss.kodieren(fremd)))
        assertNull(WidgetSchnappschuss.dekodieren("kaputt"))
        assertNull(WidgetSchnappschuss.dekodieren("{}"))
    }

    @Test
    fun nichtGeladenesBleibtAusDemAltenStehen() {
        val spaeter = JETZT.plusSeconds(600)
        val neu = WidgetSchnappschuss(stand = spaeter, termine = emptyList(), plan = null, veranstaltungen = null)
        val gesamt = neu.ueber(beispiel)
        assertEquals(spaeter, gesamt.stand)
        assertEquals("leer geladen ist nicht 'nicht geladen'", emptyList<WidgetTermin>(), gesamt.termine)
        assertEquals(beispiel.plan, gesamt.plan)
        assertEquals(beispiel.veranstaltungen, gesamt.veranstaltungen)
        assertEquals(neu, neu.ueber(null))
    }

    @Test
    fun gleicherInhaltOhneZeitpunkt() {
        val b = beispiel.copy(stand = JETZT.plusSeconds(60))
        assertTrue(beispiel.gleicherInhalt(b))
        assertFalse(beispiel.gleicherInhalt(b.copy(termine = emptyList())))
    }

    @Test
    fun ausDenDatenDerAppOhneNamenFremder() {
        val json = SupabaseVerbindung.json
        val buchungen = json.decodeFromString<List<MeineBuchung>>(
            """
            [{"booking_id":"alt","starts_at":"2026-09-28T08:00:00Z","ends_at":"2026-09-28T09:00:00Z","court_name":"Platz 2"},
             {"booking_id":"b2","starts_at":"2026-09-29T08:00:00Z","ends_at":"2026-09-29T09:00:00Z","court_name":"Platz 3",
              "type_name":"Doppel","owner_name":"Max","players":["Max","Erika"]},
             {"booking_id":"b1","starts_at":"2026-09-28T16:00:00Z","ends_at":"2026-09-28T17:00:00Z","court_name":"Platz 1",
              "type_name":"Einzel","bin_bucher":true,"players":[]}]
            """,
        )
        val belegung = json.decodeFromString<List<TagesBelegung>>(
            """
            [{"booking_id":"x","court_id":"c1","starts_at":"2026-09-28T14:00:00Z","ends_at":"2026-09-28T15:00:00Z",
              "kind":"booking","owner_name":"Fremde Person","players":["Fremde Person","Noch Jemand"],"guest_names":["Gast Name"]}]
            """,
        )
        val plaetze = listOf(AktiverPlatz(id = "c1", name = "Platz 1"))
        val einstellungen = json.decodeFromString<Buchungseinstellungen>(
            """{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30,"lead_days":7}""",
        )
        val frei = FreiDaten("2026-09-28", plaetze, belegung, einstellungen, 60)

        val s = WidgetSchnappschuss.aus(termine = buchungen, frei = frei, events = null, jetzt = JETZT)
        // Vorbei faellt weg, der naechste zuerst
        assertEquals(listOf("b1", "b2"), s.termine?.map { it.id })
        assertEquals("Du hast gebucht", s.termine?.first()?.mit)
        assertEquals("mit Erika", s.termine?.last()?.mit)
        assertEquals(480, s.plan?.oeffnung)
        assertEquals(1260, s.plan?.schluss)
        assertEquals(7, s.plan?.vorlaufTage)
        assertEquals(1, s.plan?.belegungen?.size)
        assertNull(s.veranstaltungen)

        val text = WidgetSchnappschuss.kodieren(s)
        assertFalse(text.contains("Fremde Person"))
        assertFalse(text.contains("Noch Jemand"))
        assertFalse(text.contains("Gast Name"))
    }

    @Test
    fun veranstaltungenAusDemVerein() {
        val events = listOf(
            MitgliedEvent(id = "vorbei", status = "published", title = "Alt", startsAt = "2026-09-20T17:00:00Z"),
            MitgliedEvent(
                id = "e1", status = "published", title = "Fest", location = "Clubhaus",
                startsAt = "2026-10-02T17:00:00Z", endsAt = "2026-10-02T21:00:00Z", meinStatus = "registered",
            ),
            MitgliedEvent(id = "entwurf", status = "draft", title = "Geheim", startsAt = "2026-10-01T17:00:00Z"),
        )
        val v = WidgetSchnappschuss.aus(termine = null, frei = null, events = events, jetzt = JETZT).veranstaltungen
        assertEquals(listOf("e1"), v?.map { it.id })
        assertEquals("Fr 19–23 Uhr · Clubhaus", v?.first()?.zeit)
        assertEquals("Angemeldet", v?.first()?.marke)
    }

    // ---- Zeitplan ---------------------------------------------------------------------

    @Test
    fun neuLadenNachDemNaechstenSpielUmMitternachtOderImTakt() {
        val termine = beispiel.termine!!
        val stunde = Duration.ofHours(1)
        // 14:00: der Takt kommt vor dem Spiel um 18:00
        assertEquals(berlin("15:00"), WidgetZeitplan.neuLaden(termine, JETZT, stunde))
        // 18:30, das Spiel laeuft bis 19:00: eine Minute danach
        assertEquals(berlin("19:01"), WidgetZeitplan.neuLaden(termine, berlin("18:30"), stunde))
        // 23:30: Mitternacht kommt vor dem Takt
        assertEquals(berlin("00:00", tag = "2026-09-29"), WidgetZeitplan.neuLaden(termine, berlin("23:30"), stunde))
        // Ohne Termine: der Takt
        assertEquals(berlin("14:30"), WidgetZeitplan.neuLaden(emptyList(), JETZT))
    }

    @Test
    fun naechsterLaufAuchZuBeginnEinesSpiels() {
        val termine = beispiel.termine!!
        // 17:45: das Spiel beginnt um 18:00, vor dem Takt (18:15)
        assertEquals(berlin("18:00"), WidgetZeitplan.naechsterLauf(termine, berlin("17:45")))
        // 14:00: der Takt
        assertEquals(berlin("14:30"), WidgetZeitplan.naechsterLauf(termine, JETZT))
        // 18:45 laeuft es: das Ende plus eine Minute
        assertEquals(berlin("19:01"), WidgetZeitplan.naechsterLauf(termine, berlin("18:45")))
    }

    @Test
    fun mitternachtInBerlinAuchBeimUmstellen() {
        // Sommerzeit: Mitternacht ist 22:00 UTC
        assertEquals(Instant.parse("2026-09-28T22:00:00Z"), WidgetZeitplan.naechsteMitternacht(JETZT))
        // 25.10.2026 hat 25 Stunden: die naechste Mitternacht ist 23:00 UTC
        assertEquals(Instant.parse("2026-10-25T23:00:00Z"), WidgetZeitplan.naechsteMitternacht(Instant.parse("2026-10-25T12:00:00Z")))
        // Kurz vor Mitternacht (Winterzeit) ist es die desselben Abends
        assertEquals(Instant.parse("2026-11-02T23:00:00Z"), WidgetZeitplan.naechsteMitternacht(Instant.parse("2026-11-02T22:59:00Z")))
        // Genau um Mitternacht: die naechste
        assertEquals(Instant.parse("2026-11-03T23:00:00Z"), WidgetZeitplan.naechsteMitternacht(Instant.parse("2026-11-02T23:00:00Z")))
    }

    @Test
    fun frisch() {
        assertTrue(WidgetZeitplan.mussLaden(null, JETZT))
        assertFalse(WidgetZeitplan.mussLaden(JETZT.minusSeconds(4 * 60), JETZT))
        assertTrue(WidgetZeitplan.mussLaden(JETZT.minusSeconds(6 * 60), JETZT))
    }

    // ---- Aufbereitung -------------------------------------------------------------------

    @Test
    fun spiele() {
        val termine = beispiel.termine!!
        val zeilen = WidgetInhalt.spiele(termine, JETZT, hoechstens = 3)
        assertEquals(listOf("Heute · in 4 Stunden", "Morgen"), zeilen.map { it.kicker })
        assertEquals("18:00", zeilen.first().beginn)
        assertEquals("18:00 – 19:00", zeilen.first().zeit)
        // Waehrend des Spiels steht es noch da, danach nicht mehr
        assertEquals("Heute · läuft gerade", WidgetInhalt.spiele(termine, berlin("18:30"), 1).first().kicker)
        assertEquals("Morgen", WidgetInhalt.spiele(termine, berlin("19:00"), 1).first().kicker)
        assertEquals(1, WidgetInhalt.spiele(termine, JETZT, 1).size)
    }

    @Test
    fun plaetzeJetzt() {
        val lage = WidgetInhalt.plaetze(beispiel.plan, JETZT)!!
        assertEquals("4 von 6 frei", lage.ueberschrift)
        assertFalse(lage.geschlossen)
        assertEquals(
            listOf("frei bis 15:00", "belegt bis 17:30", "frei bis 16:00", "belegt bis 21:00", "frei bis 17:30", "frei bis 21:00"),
            lage.zeilen.map { it.status },
        )
        assertEquals("14:00–15:00, 16:30–18:00, 19:00–21:00", lage.zeilen[0].lueckenText)
        assertEquals("keine freie Zeit mehr", lage.zeilen[3].lueckenText)
        assertEquals(emptyList<LeistenStueck>(), lage.zeilen[3].frei)
        // 14:00 auf der Leiste 08:00 bis 21:00
        assertEquals(6.0 / 13.0 * 100, lage.jetzt, 0.001)
        assertEquals(listOf(TimelineKind.EIGEN, TimelineKind.BELEGT), lage.zeilen[0].belegt.map { it.art })
        assertEquals(listOf("Platz 1", "Platz 3", "Platz 5", "Platz 6"), WidgetInhalt.mittelZeilen(lage.zeilen, 4).map { it.name })
    }

    @Test
    fun belegtBisUeberAnschliessendeBelegungen() {
        // 16:15: Platz 3 ist von 16:00 bis 17:00 und gleich danach bis 19:00 belegt
        val lage = WidgetInhalt.plaetze(beispiel.plan, berlin("16:15"))!!
        assertEquals("belegt bis 19:00", lage.zeilen[2].status)
    }

    @Test
    fun freiAbWennDieZeitBisZurNaechstenBelegungNichtReicht() {
        val plan = WidgetPlan(
            tag = "2026-09-28", oeffnung = 480, schluss = 1260, raster = 30, dauer = 60, vorlaufTage = null,
            plaetze = listOf(WidgetPlatz("c1", "Platz 1")),
            belegungen = listOf(
                WidgetBelegung("c1", Zeit.iso(berlin("14:30")), Zeit.iso(berlin("15:00")), "booking", false, false, 0, null),
            ),
        )
        val lage = WidgetInhalt.plaetze(plan, JETZT)!!
        assertEquals("frei ab 15:00", lage.zeilen[0].status)
        assertEquals("0 von 1 frei", lage.ueberschrift)
    }

    @Test
    fun nachSchlussUndAmNaechstenTag() {
        val abends = WidgetInhalt.plaetze(beispiel.plan, berlin("21:30"))!!
        assertTrue(abends.geschlossen)
        assertEquals("Für heute geschlossen", abends.ueberschrift)
        assertEquals(setOf("geschlossen"), abends.zeilen.map { it.status }.toSet())
        // Der Plan von gestern zaehlt nicht mehr: erst neu laden
        assertNull(WidgetInhalt.plaetze(beispiel.plan, berlin("00:05", tag = "2026-09-29")))
        assertNull(WidgetInhalt.plaetze(null, JETZT))
    }

    @Test
    fun standNurWennAlt() {
        assertNull(WidgetInhalt.standText(JETZT, JETZT.plusSeconds(30 * 60)))
        assertEquals("Stand 14:00", WidgetInhalt.standText(JETZT, JETZT.plusSeconds(60 * 60)))
        assertEquals("Stand 28.09. 14:00", WidgetInhalt.standText(JETZT, JETZT.plusSeconds(86_400)))
    }

    @Test
    fun naechsteVeranstaltung() {
        val e = WidgetVeranstaltung("e", "Fest", "2026-09-28T17:00:00Z", "2026-09-28T21:00:00Z", "", null)
        assertEquals("e", WidgetInhalt.veranstaltung(listOf(e), JETZT)?.id)
        assertEquals("laeuft noch", "e", WidgetInhalt.veranstaltung(listOf(e), Instant.parse("2026-09-28T20:00:00Z"))?.id)
        assertNull(WidgetInhalt.veranstaltung(listOf(e), Instant.parse("2026-09-28T21:30:00Z")))
    }

    // ---- Zustand, Groesse, Ziele --------------------------------------------------------

    @Test
    fun zustand() {
        assertEquals(WidgetZustand.Daten(beispiel), WidgetZustand.aus(beispiel, sitzungVorhanden = false))
        assertEquals(WidgetZustand.KeineDaten, WidgetZustand.aus(null, sitzungVorhanden = true))
        assertEquals(WidgetZustand.Abgemeldet, WidgetZustand.aus(null, sitzungVorhanden = false))
    }

    @Test
    fun familie() {
        assertEquals(WidgetFamilie.KLEIN, WidgetGroesse.familie(150f, 150f))
        assertEquals(WidgetFamilie.MITTEL, WidgetGroesse.familie(340f, 150f))
        assertEquals(WidgetFamilie.GROSS, WidgetGroesse.familie(340f, 340f))
        assertEquals(WidgetFamilie.KLEIN, WidgetGroesse.familie(150f, 340f))
    }

    @Test
    fun zieleBeimTippen() {
        val daten = WidgetZustand.Daten(beispiel)
        assertEquals("/home", WidgetZiele.spiele(WidgetZustand.Abgemeldet))
        assertEquals("/plaetze", WidgetZiele.spiele(daten))
        assertEquals("/plaetze", WidgetZiele.plaetze(WidgetZustand.KeineDaten))
        assertEquals("/verein/veranstaltung/e1", WidgetZiele.veranstaltung(daten, JETZT))
        assertEquals("/verein", WidgetZiele.veranstaltung(WidgetZustand.Daten(beispiel.copy(veranstaltungen = emptyList())), JETZT))
        assertEquals("/home", WidgetZiele.veranstaltung(WidgetZustand.Abgemeldet, JETZT))
    }

    // ---- Zeitleiste ---------------------------------------------------------------------

    @Test
    fun leisteLueckenlosUndBelegtUeberFrei() {
        val belegt = listOf(TimelineSegment(20.0, 10.0, TimelineKind.EIGEN), TimelineSegment(50.0, 50.0, TimelineKind.GESPERRT))
        val frei = listOf(LeistenStueck(10.0, 30.0))
        assertEquals(
            listOf(
                LeistenAbschnitt(0.0, 10.0, LeistenArt.LEER),
                LeistenAbschnitt(10.0, 20.0, LeistenArt.FREI),
                LeistenAbschnitt(20.0, 30.0, LeistenArt.EIGEN),
                LeistenAbschnitt(30.0, 40.0, LeistenArt.FREI),
                LeistenAbschnitt(40.0, 50.0, LeistenArt.LEER),
                LeistenAbschnitt(50.0, 100.0, LeistenArt.GESPERRT),
            ),
            WidgetLeiste.abschnitte(belegt, frei),
        )
        assertEquals(listOf(LeistenAbschnitt(0.0, 100.0, LeistenArt.LEER)), WidgetLeiste.abschnitte(emptyList(), emptyList()))
    }

    @Test
    fun leisteGleichesZusammenUndBreitenGenau() {
        val belegt = listOf(TimelineSegment(0.0, 33.3, TimelineKind.BELEGT), TimelineSegment(33.3, 33.3, TimelineKind.BELEGT))
        val abschnitte = WidgetLeiste.abschnitte(belegt, emptyList())
        assertEquals(2, abschnitte.size)
        val breiten = WidgetLeiste.breiten(WidgetLeiste.abschnitte(belegt, listOf(LeistenStueck(66.6, 33.4))), 101)
        assertEquals(101, breiten.sum())
        assertEquals(0, WidgetLeiste.marke(-5.0, 100))
        assertEquals(98, WidgetLeiste.marke(100.0, 100))
        assertEquals(46, WidgetLeiste.marke(46.15, 100))
    }

    // ---- Links --------------------------------------------------------------------------

    @Test
    fun linksHinUndZurueck() {
        val url = WidgetLink.url(WidgetLink.veranstaltung("4f1c-9a"), "tcmlokal")
        assertEquals("tcmlokal://verein/veranstaltung/4f1c-9a", url)
        val pfad = WidgetLink.pfad(url!!, "tcmlokal")
        assertEquals("/verein/veranstaltung/4f1c-9a", pfad)
        assertEquals(PushZiel.Veranstaltung("4f1c-9a"), PushZiel.ausPfad(pfad!!))

        assertEquals("tcm://plaetze", WidgetLink.url(WidgetLink.PLAETZE, "tcm"))
        assertEquals(PushZiel.Tab(HauptTab.PLAETZE), WidgetLink.pfad("tcm://plaetze", "tcm")?.let(PushZiel::ausPfad))
        assertEquals(PushZiel.Tab(HauptTab.HOME), WidgetLink.pfad("tcm://home", "tcm")?.let(PushZiel::ausPfad))
        assertEquals(PushZiel.Tab(HauptTab.VEREIN), WidgetLink.pfad("TCM://verein", "tcm")?.let(PushZiel::ausPfad))
    }

    @Test
    fun fremdeLinksNicht() {
        assertNull(WidgetLink.url("/plaetze", null))
        assertNull(WidgetLink.pfad("tcmdev://plaetze", "tcm"))
        assertNull(WidgetLink.pfad("https://app.tennisclub-muckensturm.de/plaetze", "tcm"))
        assertNull(WidgetLink.pfad("tcm://passwort-setzen?token_hash=x&type=recovery", "tcm"))
        assertNull(WidgetLink.pfad("tcm:plaetze", "tcm"))
        // Unbekannte Pfade oeffnen nichts
        assertNull(WidgetLink.pfad("tcm://admin", "tcm")?.let(PushZiel::ausPfad))
    }

    @Test
    fun jedesWidgetZielIstEinPushZiel() {
        val daten = WidgetZustand.Daten(beispiel)
        val pfade = listOf(
            WidgetZiele.spiele(daten), WidgetZiele.spiele(WidgetZustand.Abgemeldet),
            WidgetZiele.veranstaltung(daten, JETZT), WidgetLink.VEREIN,
        )
        for (pfad in pfade) assertNotNull(pfad, WidgetLink.pfad(WidgetLink.url(pfad, "tcm")!!, "tcm")?.let(PushZiel::ausPfad))
    }
}
