package de.tcmuckensturm.app.bildschirme.home

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.OffenesSpiel
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Zeit

/** Beispieldaten fuer Tests und Bildschirmfotos. JETZT ist Montag, 28.09.2026, 14:00 in Berlin. */
object Beispiele {
    val jetzt = Zeit.datum("2026-09-28T12:00:00Z")!!

    val termine = listOf(
        MeineBuchung(
            "b1", "2026-09-28T15:00:00Z", "2026-09-28T16:00:00Z", courtName = "Platz 3", typeName = "Einzel",
            ownerName = "Max Muster", binBucher = true, players = listOf("Max Muster", "Erika Muster"),
        ),
        MeineBuchung(
            "b2", "2026-09-30T16:00:00Z", "2026-09-30T17:30:00Z", courtName = "Platz 1", typeName = "Doppel",
            ownerName = "Jonas Weber", binBucher = false, players = listOf("Jonas Weber"),
        ),
    )

    val plaetze = (1..4).map { AktiverPlatz("c$it", "Platz $it") }

    val belegung = listOf(
        TagesBelegung("t1", "c1", "2026-09-28T07:00:00Z", "2026-09-28T09:00:00Z", kind = "booking"),
        TagesBelegung("t2", "c1", "2026-09-28T14:00:00Z", "2026-09-28T15:00:00Z", kind = "booking", isOwn = true),
        TagesBelegung("t3", "c2", "2026-09-28T15:00:00Z", "2026-09-28T17:00:00Z", kind = "booking", seriesId = "s1"),
        TagesBelegung("t4", "c3", "2026-09-28T12:00:00Z", "2026-09-28T13:00:00Z", kind = "booking"),
        TagesBelegung("t5", "c4", "2026-09-28T09:00:00Z", "2026-09-28T19:00:00Z", kind = "blocking"),
    )

    val einstellungen = Buchungseinstellungen("08:00:00", "21:00:00", slotMinutes = 30, leadDays = 7)

    val offen = listOf(
        OffenesSpiel(
            "o1", "2026-09-28T16:00:00Z", "2026-09-28T17:30:00Z", courtName = "Platz 2", typeName = "Doppel",
            ownerName = "Erika Muster", frei = 2, binDabei = false,
        ),
        OffenesSpiel(
            "o2", "2026-09-30T08:00:00Z", "2026-09-30T09:00:00Z", courtName = "Platz 4", typeName = "Einzel",
            ownerName = "Jonas Weber", frei = 1, binDabei = true,
        ),
    )

    val nachrichten = listOf(
        Benachrichtigung(
            "n1", kind = "booking_cancelled", title = "Buchung storniert",
            body = "Deine Buchung auf Platz 1 am Dienstag um 17 Uhr wurde vom Platzwart storniert.",
            createdAt = "2026-09-28T11:55:00Z",
        ),
        Benachrichtigung(
            "n2", kind = "event_reminder", title = "Saisonabschluss",
            body = "Am Samstag ab 18 Uhr im Clubhaus. Melde dich bis Donnerstag an.",
            createdAt = "2026-09-27T09:00:00Z", eventId = "e1",
        ),
        Benachrichtigung(
            "n3", kind = "charge_created", title = "Neue Gebühr",
            body = "Gastgebühr 5,00 € für das Spiel am 24.09.", createdAt = "2026-09-24T10:00:00Z",
            readAt = "2026-09-24T12:00:00Z",
        ),
        Benachrichtigung(
            "n4", kind = "application_new", title = "Neuer Antrag", body = "Lena Fischer möchte Mitglied werden.",
            createdAt = "2026-09-10T10:00:00Z", readAt = "2026-09-10T12:00:00Z",
        ),
    )

    val events = listOf(
        MitgliedEvent(
            "e1", kind = "fest", status = "published", title = "Saisonabschluss", location = "Clubhaus",
            startsAt = "2026-10-03T16:00:00Z", endsAt = "2026-10-03T21:00:00Z", registrationEnabled = true,
            registrationDeadline = "2026-10-01T20:00:00Z", maxParticipants = 60, personen = 23,
        ),
        MitgliedEvent(
            "e2", kind = "arbeitsdienst", status = "published", title = "Plätze winterfest machen",
            startsAt = "2026-10-10T07:00:00Z", endsAt = "2026-10-10T11:00:00Z", registrationEnabled = true,
            maxParticipants = 12, personen = 5, workHours = 4.0, meinStatus = "registered",
        ),
    )

    val voll = HomeInhalt(
        name = MeinName("Max", "Muster"),
        termine = Abschnitt.Wert(termine),
        frei = Abschnitt.Wert(FreiDaten("2026-09-28", plaetze, belegung, einstellungen, 60)),
        offen = Abschnitt.Wert(offen),
        getraenke = Abschnitt.Wert(listOf(EigenesGetraenk("g1", totalCents = 1250))),
        dienst = Abschnitt.Wert(Arbeitsdienst(2026, 10.0, 4.0, 6.0)),
        neues = Abschnitt.Wert(nachrichten.take(3)),
        events = Abschnitt.Wert(events),
    )

    val leer = HomeInhalt(
        name = MeinName("Erika", "Muster"),
        termine = Abschnitt.Wert(emptyList()),
        frei = Abschnitt.Wert(FreiDaten("2026-09-28", plaetze.take(1), listOf(belegung[4].copy(courtId = "c1")), einstellungen, 60)),
        offen = Abschnitt.Wert(emptyList()),
        getraenke = Abschnitt.Wert(emptyList()),
        dienst = Abschnitt.Wert(null),
        neues = Abschnitt.Wert(emptyList()),
        events = Abschnitt.Wert(emptyList()),
    )

    val fehler = HomeInhalt(
        name = null,
        termine = Abschnitt.Fehler("Keine Verbindung zum Server."),
        frei = Abschnitt.Fehler("Keine Verbindung zum Server."),
        offen = Abschnitt.Wert(offen.take(1)),
        getraenke = Abschnitt.Fehler("Keine Verbindung zum Server."),
        dienst = Abschnitt.Wert(Arbeitsdienst(2026, 10.0, 10.0, 0.0)),
        neues = Abschnitt.Wert(emptyList()),
        events = Abschnitt.Fehler("Keine Verbindung zum Server."),
    )
}
