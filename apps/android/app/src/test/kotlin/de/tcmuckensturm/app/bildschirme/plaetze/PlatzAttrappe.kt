package de.tcmuckensturm.app.bildschirme.plaetze

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Buchungsart
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.daten.Kontingent
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Mitglied
import de.tcmuckensturm.app.daten.PlatzErgebnis
import de.tcmuckensturm.app.daten.PlatzQuelle
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow

/**
 * Beispieldaten fuer Bildschirmfotos und Modelltests - ohne Netz.
 *
 * Donnerstag, 29.10.2026, 15:00 Berlin: vier Plaetze, 08:00-21:00, Raster
 * 30 Minuten, Vorlauf 7 Tage, Gast 5 Euro. Auf dem Plan liegen die eigene
 * Buchung, ein Training, eine fremde Buchung, ein Spiel, das Mitspieler
 * sucht, und eine Sperrung.
 */
class PlatzAttrappe(
    var platzrechte: Boolean = false,
    var fehler: String? = null,
) : PlatzQuelle {
    companion object {
        const val TAG = "2026-10-29"
        val JETZT: Instant = Zeit.datum("2026-10-29T14:00:00Z")!!

        fun zeit(minuten: Int): String = Zeit.iso(Zeit.berlinTime(TAG, minuten))

        val EIGENE = TagesBelegung(
            bookingId = "eigen", courtId = "p1", startsAt = zeit(16 * 60), endsAt = zeit(17 * 60), kind = "booking",
            typeCode = "einzel", typeName = "Einzel", ownerMemberId = "ich", ownerName = "Lucas Beispiel", isOwn = true,
            players = listOf("Eva Muster"), playerMemberIds = listOf("m1"), guestNames = emptyList(), frei = 0,
        )
        val TRAINING = TagesBelegung(
            bookingId = "training", courtId = "p2", startsAt = zeit(15 * 60), endsAt = zeit(17 * 60), kind = "blocking",
            seriesId = "s1", typeCode = "training", typeName = "Training", title = "Jugendtraining",
        )
        val FREMD = TagesBelegung(
            bookingId = "fremd", courtId = "p3", startsAt = zeit(17 * 60), endsAt = zeit(18 * 60), kind = "booking",
            typeCode = "doppel", typeName = "Doppel", ownerMemberId = "m2", ownerName = "Max Mustermann",
            players = listOf("Jonas Berg", "Anna Schmidt", "Gast"), playerMemberIds = listOf("m3", "m4"),
            guestNames = listOf("Gast"), frei = 0,
        )
        val SUCHT = TagesBelegung(
            bookingId = "sucht", courtId = "p4", startsAt = zeit(18 * 60), endsAt = zeit(19 * 60), kind = "booking",
            typeCode = "doppel", typeName = "Doppel", ownerMemberId = "m3", ownerName = "Jonas Berg", partnerWanted = true,
            frei = 2, players = listOf("Anna Schmidt"), playerMemberIds = listOf("m4"), guestNames = emptyList(),
        )
        val SPERRE = TagesBelegung(
            bookingId = "sperre", courtId = "p3", startsAt = zeit(19 * 60), endsAt = zeit(21 * 60), kind = "blocking",
            typeCode = "platzpflege", typeName = "Platzpflege", title = "nach Regen",
        )
        val BELEGT = TagesBelegung(
            bookingId = "belegt", courtId = "p1", startsAt = zeit(19 * 60), endsAt = zeit(20 * 60), kind = "booking",
            typeCode = "einzel", typeName = "Einzel", ownerMemberId = "m5", ownerName = "Robin Heinzler", frei = 0,
        )

        val PLAETZE = (1..4).map { AktiverPlatz("p$it", "Platz $it", "P$it", it) }
        val EINSTELLUNGEN = Buchungseinstellungen(
            openingTime = "08:00", closingTime = "21:00", slotMinutes = 30, leadDays = 7, maxOpenBookings = 3,
            displayMinutes = 60, guestFeeCents = 500,
        )
        val ARTEN = listOf(
            Buchungsart("einzel", "Einzel", 60, requiresPartner = true, minPlayers = 2, maxPlayers = 2, sortOrder = 1),
            Buchungsart("doppel", "Doppel", 60, requiresPartner = true, minPlayers = 4, maxPlayers = 4, sortOrder = 2),
        )
        val BLOCKUNGSARTEN = listOf(
            Buchungsart("platzpflege", "Platzpflege"),
            Buchungsart("verbandsspiel", "Verbandsspiel"),
            Buchungsart("turnier", "Turnier"),
        )
        val VERZEICHNIS = listOf(
            Mitglied("ich", "Lucas", "Beispiel"),
            Mitglied("m1", "Eva", "Muster"),
            Mitglied("m2", "Max", "Mustermann"),
            Mitglied("m3", "Jonas", "Berg"),
            Mitglied("m4", "Anna", "Schmidt"),
            Mitglied("m5", "Robin", "Heinzler"),
        )
    }

    var belegung = listOf(EIGENE, TRAINING, FREMD, SUCHT, SPERRE, BELEGT)
    var kontingent = Kontingent(used = 1, allowed = 3)

    /** Wie oft der Tagesplan gelesen wurde. */
    var tagesplanAufrufe = 0

    /** Was zuletzt geschrieben wurde: RPC-Name und Kennung. */
    val geschrieben = mutableListOf<String>()

    /** Antwort der naechsten Sperrung; null heisst ok. */
    var sperrAntwort: PlatzErgebnis? = null

    val aenderungen = MutableSharedFlow<Unit>(extraBufferCapacity = 100)

    private fun pruefe() {
        fehler?.let { throw Meldung(it) }
    }

    override suspend fun plaetze() = PLAETZE.also { pruefe() }

    override suspend fun tagesplan(tag: String): List<TagesBelegung> {
        pruefe()
        tagesplanAufrufe++
        return if (tag == TAG) belegung else emptyList()
    }

    override suspend fun kontingent() = kontingent

    override suspend fun buchungseinstellungen() = EINSTELLUNGEN

    override suspend fun buchungsarten() = ARTEN

    override suspend fun blockungsarten() = BLOCKUNGSARTEN

    override suspend fun verzeichnis() = VERZEICHNIS

    override suspend fun ich() = Ich(memberId = "ich", firstName = "Lucas", lastName = "Beispiel", platzRechte = platzrechte)

    override fun aenderungen(tag: String): Flow<Unit> = aenderungen

    private fun ok(rpc: String, id: String, meldung: String): PlatzErgebnis {
        geschrieben += "$rpc:$id"
        return PlatzErgebnis(ok = true, meldung = meldung)
    }

    override suspend fun bucheplatz(
        courtId: String,
        beginn: Instant,
        typ: String,
        mitspieler: List<String>,
        gaeste: List<String>,
        sucheMitspieler: Boolean,
    ) = ok("create_booking", "$courtId@${Zeit.iso(beginn)}", "Platz gebucht.")

    override suspend fun aendereMitspieler(bookingId: String, mitglieder: List<String>, gaeste: List<String>) =
        ok("update_booking_players", bookingId, "Mitspieler aktualisiert.")

    override suspend fun storniereBuchung(bookingId: String, grund: String?) =
        PlatzErgebnis(ok = false, meldung = "Die Spielzeit hat schon begonnen.")

    override suspend fun sageSerienterminAb(bookingId: String, grund: String?) =
        ok("cancel_series_occurrence", bookingId, "Der Termin ist abgesagt.")

    override suspend fun hebeSperreAuf(bookingId: String) = ok("cancel_booking", bookingId, "Die Sperrung ist aufgehoben.")

    override suspend fun spieleMit(bookingId: String) = ok("join_booking", bookingId, "Du bist eingetragen. Viel Spaß!")

    override suspend fun sucheMitspieler(bookingId: String, gesucht: Boolean) =
        ok("set_partner_wanted", bookingId, "Die Buchung steht jetzt bei den offenen Spielen.")

    override suspend fun setzeUm(bookingId: String, platzId: String, tag: String, minute: Int, grund: String?) =
        ok("move_booking", bookingId, "Die Buchung ist umgesetzt.")

    override suspend fun sperre(
        platzId: String,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis {
        val antwort = sperrAntwort
        if (antwort != null && !verdraengen) return antwort
        return ok("create_blocking", platzId, "Gesperrt.")
    }

    override suspend fun aendereSperre(
        bookingId: String,
        platzIds: List<String>,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ) = ok("update_blocking", bookingId, "Sperrung geändert.")
}
