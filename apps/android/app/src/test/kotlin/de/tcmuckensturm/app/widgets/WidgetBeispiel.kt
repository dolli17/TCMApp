/*
 * Beispieldaten fuer die Widget-Tests und die Bilder in apps/android/docs,
 * wie TCMWidgets/Gemeinsam/WidgetBeispiel.swift. Erfundene Namen, keine
 * echten Mitglieder.
 */

package de.tcmuckensturm.app.widgets

import de.tcmuckensturm.kern.Zeit
import java.time.Instant

object WidgetBeispiel {
    /** Montag, 28.09.2026, 14:00 in Berlin (Sommerzeit) - wie in WidgetTests.swift */
    val JETZT: Instant = Instant.parse("2026-09-28T12:00:00Z")

    fun berlin(uhr: String, tag: String = "2026-09-28"): Instant = Zeit.berlinTime(tag, Zeit.timeToMinutes(uhr))

    /** Ein Nachmittag um `jetzt`: zwei eigene Spiele, sechs Plaetze, eine Veranstaltung. */
    fun schnappschuss(jetzt: Instant = JETZT): WidgetSchnappschuss {
        val heute = Zeit.berlinDay(jetzt)
        val morgen = Zeit.berlinDay(jetzt.plusSeconds(86_400))
        fun iso(tag: String, uhr: String) = Zeit.iso(Zeit.berlinTime(tag, Zeit.timeToMinutes(uhr)))
        val plaetze = (1..6).map { WidgetPlatz("p$it", "Platz $it") }
        fun belegung(platz: Int, von: String, bis: String, kind: String, eigen: Boolean, sucht: Boolean) = WidgetBelegung(
            courtId = "p$platz",
            startsAt = iso(heute, von),
            endsAt = iso(heute, bis),
            kind = kind,
            isOwn = eigen,
            partnerWanted = sucht,
            frei = if (sucht) 2 else 0,
            seriesId = null,
        )
        val fest = Zeit.datum(iso(morgen, "19:00")) ?: jetzt
        return WidgetSchnappschuss(
            stand = jetzt,
            termine = listOf(
                WidgetTermin("b1", iso(heute, "18:00"), iso(heute, "19:00"), "Platz 1", "Einzel", "mit Mara Beispiel"),
                WidgetTermin(
                    "b2", iso(morgen, "10:00"), iso(morgen, "11:30"), "Platz 3", "Doppel",
                    "mit Jonas Muster, Lea Probe, Tim Test",
                ),
            ),
            plan = WidgetPlan(
                tag = heute,
                oeffnung = 8 * 60,
                schluss = 21 * 60,
                raster = 30,
                dauer = 60,
                vorlaufTage = 7,
                plaetze = plaetze,
                belegungen = listOf(
                    belegung(1, "18:00", "19:00", "booking", eigen = true, sucht = false),
                    belegung(1, "15:00", "16:30", "booking", eigen = false, sucht = false),
                    belegung(2, "14:00", "17:30", "booking", eigen = false, sucht = false),
                    belegung(3, "16:00", "17:00", "booking", eigen = false, sucht = true),
                    belegung(3, "17:00", "19:00", "booking", eigen = false, sucht = false),
                    belegung(4, "08:00", "21:00", "blocking", eigen = false, sucht = false),
                    belegung(5, "17:30", "20:00", "booking", eigen = false, sucht = false),
                ),
            ),
            veranstaltungen = listOf(
                WidgetVeranstaltung(
                    id = "e1",
                    titel = "Saisonabschlussfest",
                    startsAt = iso(morgen, "19:00"),
                    endsAt = iso(morgen, "23:00"),
                    zeit = "${Zeit.kurzerWochentag(fest)} 19–23 Uhr · Clubhaus",
                    marke = "Angemeldet",
                ),
            ),
        )
    }
}
