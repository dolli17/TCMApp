package de.tcmuckensturm.app.bildschirme.home

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Zeit
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Texte und Auswahl von Home, Glocke und Neuigkeiten (HomeLogik) - wie HomeLogikTests.swift. */
class HomeLogikTest {
    private val jetzt = Zeit.datum("2026-09-28T12:00:00Z")!!

    private fun buchung(players: List<String?>?, owner: String? = "Max", bucher: Boolean? = null) = MeineBuchung(
        bookingId = "b1",
        startsAt = "2026-09-28T15:00:00Z",
        endsAt = "2026-09-28T16:00:00Z",
        courtName = "Platz 3",
        ownerName = owner,
        binBucher = bucher,
        players = players,
    )

    @Test
    fun titel() {
        assertEquals("Hallo, Max", HomeLogik.titel("Max"))
        assertEquals("Hallo", HomeLogik.titel(""))
        assertEquals("Hallo", HomeLogik.titel(null))
        assertEquals("Montag, 28. September", HomeLogik.kicker(jetzt))
    }

    @Test
    fun terminkarte() {
        assertEquals("mit Erika, Jonas", HomeLogik.mitText(buchung(listOf("Max", "Erika", "Jonas"))))
        assertEquals("Du hast gebucht", HomeLogik.mitText(buchung(listOf("Max"), bucher = true)))
        assertEquals("von Max", HomeLogik.mitText(buchung(emptyList(), bucher = false)))
        assertEquals("mit Erika", HomeLogik.mitText(buchung(listOf("Max", null, "", "Erika"))))
        val t = buchung(null)
        assertEquals("17:00 – 18:00", HomeLogik.zeitSpanne(t))
        assertEquals("Heute · in 3 Stunden, 17:00 – 18:00, Platz 3, Details", HomeLogik.terminLabel(t, jetzt))
    }

    @Test
    fun jetztFrei() {
        val belegung = listOf(
            TagesBelegung("x", "c1", "2026-09-28T14:00:00Z", "2026-09-28T15:00:00Z", kind = "booking"),
        )
        val plaetze = listOf(AktiverPlatz("c1", "Platz 1"), AktiverPlatz("c2", "Platz 2"))
        val einstellungen = Buchungseinstellungen("08:00:00", "21:00:00", slotMinutes = 30, leadDays = 7)
        val d = FreiDaten("2026-09-28", plaetze, belegung, einstellungen, 60)
        val karten = HomeLogik.jetztFreiKarten(d, jetzt)
        // 14:00 Berlin: Platz 2 frei bis Schluss, Platz 1 bis 16:00 (Belegung 16-17 Uhr)
        assertEquals(listOf("Platz 2", "Platz 1"), karten.map { it.name })
        assertEquals(listOf("21:00", "16:00"), karten.map { it.bis })
        assertEquals(1, karten[1].segmente.size)
        assertEquals((14 * 60 - 480).toDouble() / (1260 - 480) * 100, karten[0].jetzt, 0.0001)
    }

    @Test
    fun jetztFreiOhneEinstellungen() {
        // Ohne booking_settings: 08:00 bis 21:00, Raster 30
        val d = FreiDaten("2026-09-28", listOf(AktiverPlatz("c1")), emptyList(), null, 60)
        val karten = HomeLogik.jetztFreiKarten(d, jetzt)
        assertEquals(listOf("21:00"), karten.map { it.bis })
        assertEquals("", karten[0].name)
    }

    @Test
    fun deinStand() {
        val stand = HomeLogik.deinStand(
            getraenke = Abschnitt.Wert(listOf(EigenesGetraenk("g", totalCents = 450))),
            dienst = Abschnitt.Wert(Arbeitsdienst(2026, 10.0, 2.5, 7.5)),
            jetzt = jetzt,
        )
        assertEquals("Getränke September", stand.getraenkeTitel)
        assertEquals("4,50 €", stand.getraenkeWert)
        assertEquals("Getränke im September: 4,50 €, läuft noch. Zu den Getränken", stand.getraenkeLabel)
        assertEquals("Arbeitsdienst 2026", stand.dienstTitel)
        assertEquals("2.5 / 10 h", stand.dienstWert)
        assertEquals(0.25, stand.dienstAnteil, 0.0)
        assertEquals("Arbeitsdienst 2026: 2.5 von 10 Stunden. Zum Konto", stand.dienstLabel)

        val ohne = HomeLogik.deinStand(Abschnitt.Fehler("Kaputt."), Abschnitt.Wert(null), jetzt)
        assertNull(ohne.getraenkeWert)
        assertEquals("Getränke: Kaputt.", ohne.getraenkeLabel)
        assertNull(ohne.dienstWert)
        assertEquals("Arbeitsdienst 2026", ohne.dienstTitel)
        assertEquals("Arbeitsdienst 2026: kein Soll. Zum Konto", ohne.dienstLabel)

        val fehler = HomeLogik.deinStand(Abschnitt.Wert(emptyList()), Abschnitt.Fehler("Weg."), jetzt)
        assertEquals("Arbeitsdienst: Weg.", fehler.dienstLabel)
        assertEquals("Weg.", fehler.dienstFehler)

        val ueber = HomeLogik.deinStand(Abschnitt.Wert(emptyList()), Abschnitt.Wert(Arbeitsdienst(2026, 4.0, 6.0, 0.0)), jetzt)
        assertEquals(1.0, ueber.dienstAnteil, 0.0)
    }

    @Test
    fun glockeUndNachrichten() {
        assertEquals("3", HomeLogik.glockenZahl(3))
        assertEquals("9+", HomeLogik.glockenZahl(12))
        assertEquals("Benachrichtigungen", HomeLogik.glockenLabel(0))
        assertEquals("Benachrichtigungen, 2 ungelesen", HomeLogik.glockenLabel(2))

        val liste = listOf(
            Benachrichtigung("n1", title = "Storniert", body = "Platz 1 um 17 Uhr", createdAt = "2026-09-28T11:55:00Z"),
        )
        assertEquals("Neu: Storniert. Platz 1 um 17 Uhr. vor 5 Min.", HomeLogik.nachrichtLabel(liste[0], true, jetzt))
        assertTrue(HomeLogik.zeigeAlleGelesen(liste, alleGesehen = false))
        assertFalse(HomeLogik.zeigeAlleGelesen(liste, alleGesehen = true))
        assertFalse(HomeLogik.zeigeAlleGelesen(null, alleGesehen = false))
        assertTrue(HomeLogik.zeigeAlleNeuigkeiten(Abschnitt.Wert(liste)))
        assertFalse(HomeLogik.zeigeAlleNeuigkeiten(Abschnitt.Wert(emptyList())))
        assertFalse(HomeLogik.zeigeAlleNeuigkeiten(Abschnitt.Fehler("x")))
    }

    @Test
    fun initialenUndJsZahl() {
        assertEquals("MM", HomeLogik.initialen(MeinName("max", "muster")))
        assertEquals("", HomeLogik.initialen(null))
        assertEquals("E", HomeLogik.initialen(MeinName("Erika", "")))
        assertEquals("3", HomeLogik.jsZahl(3.0))
        assertEquals("2.5", HomeLogik.jsZahl(2.5))
    }

    @Test
    fun offeneSpiele() {
        val o = Beispiele.offen
        assertEquals("Doppel · sucht 2", HomeLogik.offenesSpielTitel(o[0]))
        assertEquals("Platz 2 · Erika Muster", HomeLogik.offenesSpielZeile(o[0]))
        assertEquals(3, HomeLogik.offeneSpiele(o + o).size)
    }

    @Test
    fun abschnittFaengtFehler() = runTest {
        assertEquals(Abschnitt.Wert(3), Abschnitt.von { 3 })
        assertEquals(Abschnitt.Fehler("Ging nicht."), Abschnitt.von<Int> { throw Meldung("Ging nicht.") })
    }
}
