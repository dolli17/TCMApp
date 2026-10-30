package de.tcmuckensturm.app.bildschirme.verwaltung

import de.tcmuckensturm.app.daten.Buchungsart
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.PlatzErgebnis
import de.tcmuckensturm.app.daten.Serie
import de.tcmuckensturm.app.daten.SerienTermin
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.daten.VerwalteterPlatz
import de.tcmuckensturm.app.daten.VerwaltungsQuelle
import de.tcmuckensturm.app.daten.VerwaltungsStand
import java.time.Instant

/**
 * Beispieldaten der Verwaltung ohne Netz: fuenf Plaetze, einer stillgelegt,
 * auf Platz 2 eine Sperrung, auf Platz 3 eine laufende Serie. JETZT ist
 * Donnerstag, 29.10.2026, 12:00 Berlin. Merkt sich, was aufgerufen wurde.
 */
class VerwaltungAttrappe(
    private val admin: Boolean = false,
    private val fehler: String? = null,
    /** Ohne `verdraengen` weist sperre so viele Kollisionen zurueck. */
    private val sperrKollisionen: Int = 0,
) : VerwaltungsQuelle {
    val aufrufe = mutableListOf<String>()
    var ladeZaehler = 0
        private set

    companion object {
        val JETZT: Instant = Instant.parse("2026-10-29T11:00:00Z")

        val PLAETZE = listOf(
            VerwalteterPlatz("p1", "Platz 1", "P1", "Sand · Flutlicht", 1, true, 4),
            VerwalteterPlatz("p2", "Platz 2", "P2", "Sand", 2, true, 2),
            VerwalteterPlatz("p3", "Platz 3", "P3", "Sand", 3, true, 0),
            VerwalteterPlatz("p4", "Platz 4", "P4", "Sand · am Clubhaus", 4, true, 1),
            VerwalteterPlatz("p5", "Platz 5", "P5", "Kunstrasen", 5, false, 0),
        )

        val ARTEN = listOf(
            Buchungsart("platzpflege", "Platzpflege"),
            Buchungsart("training", "Training"),
            Buchungsart("turnier", "Turnier"),
            Buchungsart("medenspiel", "Medenspiel"),
        )

        val SERIEN = listOf(
            Serie("s1", "Platz 1", "Training", "Training Herren 40", 2, "18:30:00", "20:00:00", "2026-04-01", "2026-12-15", 7),
            Serie("s2", "Platz 3", "Training", "Jugendtraining", 4, "11:00:00", "13:00:00", "2026-04-01", "2026-11-26", 4),
            Serie("s3", "Platz 4", "Medenspiel", "Damen 30 Heimspiele", 6, "09:00:00", "14:00:00", "2026-05-02", "2026-10-31", 1),
        )

        /** Auf Platz 2 gesperrt bis 14:00, auf Platz 3 die Serie bis 13:00 (Berlin, MEZ). */
        val PLAN: List<TagesBelegung> = SupabaseVerbindung.json.decodeFromString(
            """
            [
              {"booking_id":"b1","court_id":"p2","kind":"blocking","series_id":null,"type_name":"Platzpflege",
               "starts_at":"2026-10-29T07:00:00Z","ends_at":"2026-10-29T13:00:00Z"},
              {"booking_id":"b2","court_id":"p3","kind":"blocking","series_id":"s2","type_name":"Training",
               "starts_at":"2026-10-29T10:00:00Z","ends_at":"2026-10-29T12:00:00Z"},
              {"booking_id":"b3","court_id":"p1","kind":"booking","starts_at":"2026-10-29T10:00:00Z","ends_at":"2026-10-29T11:30:00Z"},
              {"booking_id":"b4","court_id":"p5","kind":"blocking","starts_at":"2026-10-29T07:00:00Z","ends_at":"2026-10-29T20:00:00Z"}
            ]
            """,
        )

        val STAND = VerwaltungsStand(
            plaetze = PLAETZE,
            blockungsarten = ARTEN,
            serien = SERIEN,
            zustand = VerwaltungLogik.zustandJetzt(PLAN, JETZT),
            oeffnung = "08:00",
            schluss = "21:00",
        )

        val TERMINE = listOf(
            SerienTermin("2026-11-03T17:30:00Z", "2026-11-03T19:00:00Z"),
            SerienTermin("2026-11-10T17:30:00Z", "2026-11-10T19:00:00Z", "x1", "Max Muster", "booking"),
            SerienTermin("2026-11-17T17:30:00Z", "2026-11-17T19:00:00Z"),
            SerienTermin("2026-11-24T17:30:00Z", "2026-11-24T19:00:00Z", "x2", null, "blocking"),
        )
    }

    override suspend fun ich(): Ich = Ich(memberId = "ich", firstName = "Paula", lastName = "Platzwart", admin = admin, platzRechte = true)

    override suspend fun laden(jetzt: Instant): VerwaltungsStand {
        ladeZaehler++
        fehler?.let { throw Meldung(it) }
        return STAND
    }

    override suspend fun sperre(
        platzIds: List<String>,
        tag: String,
        von: String,
        bis: String,
        artCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis {
        aufrufe += "sperre ${platzIds.joinToString(",")} $tag $von-$bis $artCode verdraengen=$verdraengen"
        VerwaltungLogik.pruefeSperre(tag, von, bis).onFailure { return PlatzErgebnis(false, it.message!!) }
        if (sperrKollisionen > 0 && !verdraengen) {
            return PlatzErgebnis(false, "$sperrKollisionen Buchungen liegen im gewählten Zeitraum.", kollisionen = sperrKollisionen)
        }
        return PlatzErgebnis(true, VerwaltungLogik.gesperrtMeldung(platzIds.size, if (verdraengen) sperrKollisionen else 0))
    }

    override suspend fun vorschau(f: SerienEingabe): Result<List<SerienTermin>> {
        aufrufe += "vorschau ${f.courtId}"
        return VerwaltungLogik.pruefeSerie(f).map { TERMINE }
    }

    override suspend fun legeSerieAn(f: SerienEingabe, verdraengen: Boolean): PlatzErgebnis {
        aufrufe += "anlegen ${f.title} verdraengen=$verdraengen"
        return PlatzErgebnis(true, VerwaltungLogik.serieAngelegtMeldung(TERMINE.size, if (verdraengen) 2 else 0))
    }

    override suspend fun aendereSerie(
        id: String,
        startTime: String,
        endTime: String,
        titel: String,
        validTo: String,
        verdraengen: Boolean,
    ): PlatzErgebnis {
        aufrufe += "aendern $id $startTime-$endTime"
        return PlatzErgebnis(true, VerwaltungLogik.serieGeaendertMeldung(3, 0))
    }

    override suspend fun beendeSerie(id: String): PlatzErgebnis {
        aufrufe += "beenden $id"
        return PlatzErgebnis(true, VerwaltungLogik.serieBeendetMeldung(SERIEN.first { it.id == id }.kuenftige ?: 0))
    }
}
