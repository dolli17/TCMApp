/*
 * Zustand und Aktionen des Tabs Plaetze (apps/mobile/app/(tabs)/plaetze/index.tsx)
 *
 * Wie PlaetzeModell.swift der iOS-App: laedt den Tag, haelt ihn ueber
 * Realtime aktuell und fuehrt aus, was im Blatt angestossen wird. Klappt eine
 * Aktion, schliesst das Blatt, die Meldung kommt als Snackbar und die
 * betroffene Belegung ist kurz hervorgehoben (U16). Scheitert sie, bleibt das
 * Blatt offen und der Grund der Datenbank steht ueber dem Knopf.
 *
 * Ein ViewModel je Tab-Eintrag: Beim Wechsel zwischen den Tabs bleiben Tag,
 * Ansicht und Plan stehen.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Was im Blatt gerade bearbeitet wird. */
sealed interface Fenster {
    val tag: String
    val platzName: String

    /** stunde ist der Anzeigeblock (bei 60 Minuten 17:00-18:00), start die vorgewaehlte Zeit. */
    data class Buchen(
        val courtId: String,
        override val platzName: String,
        override val tag: String,
        val stunde: Int,
        val startzeiten: List<Int>,
        val start: Int,
    ) : Fenster

    data class Bestehend(val belegung: TagesBelegung, override val platzName: String, override val tag: String) : Fenster
}

/** Die ausgewaehlte freie Stelle im Raster: Platz, Beginn und wie lange er frei ist. */
data class Auswahl(val courtId: String, val minute: Int, val bis: Int)

/** Wohin nach einer Aktion der Blick soll: eine bestehende Buchung oder Platz und Beginn einer neuen. */
sealed interface Markierung {
    fun trifft(b: TagesBelegung): Boolean

    data class Buchung(val id: String) : Markierung {
        override fun trifft(b: TagesBelegung) = b.bookingId == id
    }

    data class Stelle(val courtId: String, val beginn: Instant) : Markierung {
        override fun trifft(b: TagesBelegung) = b.courtId == courtId && Zeit.datum(b.startsAt) == beginn
    }
}

enum class Ansicht(val wert: String) {
    UEBERSICHT("uebersicht"),
    FREIE_ZEITEN("freie-zeiten"),
    ;

    companion object {
        /** Ohne gemerkte Wahl beginnt es mit Freie Zeiten: dort sind alle Ziele gross (U18). */
        fun aus(wert: String?): Ansicht = entries.firstOrNull { it.wert == wert } ?: FREIE_ZEITEN
    }
}

/** Rueckmeldung nach einer Aktion; `nr` macht zwei gleiche Meldungen hintereinander unterscheidbar. */
data class Hinweis(val ok: Boolean, val text: String, val nr: Long = System.nanoTime())

/**
 * @param uhr die Zeit fuer Plan und Blatt; die Bildschirmfotos halten sie fest.
 * @param live Realtime, Minutentakt und Nachladen im Vordergrund - aus in den Bildschirmfotos.
 * @param bereich wo die Aktionen laufen; ohne Angabe der viewModelScope.
 */
class PlaetzeModell(
    val quelle: PlatzQuelle,
    val uhr: () -> Instant = Instant::now,
    val live: Boolean = true,
    ansichtAnfang: Ansicht = Ansicht.FREIE_ZEITEN,
    private val ansichtMerken: (Ansicht) -> Unit = {},
    private val bereich: CoroutineScope? = null,
) : ViewModel() {
    private val scope: CoroutineScope get() = bereich ?: viewModelScope

    var datum by mutableStateOf(Zeit.berlinDay(uhr()))
        private set
    var ansicht by mutableStateOf(ansichtAnfang)
        private set
    var auswahl by mutableStateOf<Auswahl?>(null)
    var tagwahlOffen by mutableStateOf(false)

    var plaetze by mutableStateOf<List<AktiverPlatz>>(emptyList())
        private set
    var belegung by mutableStateOf<List<TagesBelegung>>(emptyList())
        private set
    var arten by mutableStateOf<List<Buchungsart>>(emptyList())
        private set
    var blockungsarten by mutableStateOf<List<Buchungsart>>(emptyList())
        private set
    var verzeichnis by mutableStateOf<List<Mitglied>>(emptyList())
        private set
    var kontingent by mutableStateOf(Kontingent.LEER)
        private set
    var einstellungen by mutableStateOf<Buchungseinstellungen?>(null)
        private set
    var darfPlaetze by mutableStateOf(false)
        private set
    var meineId by mutableStateOf<String?>(null)
        private set
    var ich by mutableStateOf<Ich?>(null)
        private set

    var fenster by mutableStateOf<Fenster?>(null)
        private set
    var fensterFehler by mutableStateOf<String?>(null)
        private set
    var laedt by mutableStateOf(true)
        private set

    /** Fuer welchen Tag die Daten gerade stehen. */
    var geladenFuer by mutableStateOf<String?>(null)
        private set
    var aktualisiert by mutableStateOf(false)
        private set
    var laeuft by mutableStateOf(false)
        private set
    var meldung by mutableStateOf<Hinweis?>(null)

    /** Plan nicht ladbar: steht oben mit "Erneut versuchen" statt als Snackbar (U3). */
    var ladeFehler by mutableStateOf<String?>(null)
        private set
    var markiert by mutableStateOf<Markierung?>(null)

    private var letztesNachladen: Instant? = null
    private var nachladenWartet = false

    // ---- Einstellungen ----------------------------------------------------------

    val oeffnung get() = Zeit.timeToMinutes(einstellungen?.openingTime ?: "08:00")
    val schluss get() = Zeit.timeToMinutes(einstellungen?.closingTime ?: "21:00")
    val raster get() = einstellungen?.slotMinutes ?: 30
    val anzeige get() = einstellungen?.displayMinutes ?: 60
    val dauer get() = arten.firstOrNull()?.durationMinutes ?: 60
    val vorlauf get() = einstellungen?.leadDays ?: 7
    val gastgebuehr get() = einstellungen?.guestFeeCents ?: 0
    val heute: String get() = Zeit.berlinDay(uhr())
    val tage: List<String> get() = PlaetzeLogik.tage(heute, vorlauf)

    // ---- Laden ------------------------------------------------------------------

    /**
     * still: ohne Ladekreis nachladen. Das Nachladen durch Realtime oder durch
     * Herunterziehen darf den Inhalt nicht gegen einen Ladekreis tauschen.
     */
    suspend fun laden(tag: String = datum, still: Boolean = false) {
        if (!still) laedt = true
        try {
            coroutineScope {
                val p = async { quelle.plaetze() }
                val b = async { quelle.tagesplan(tag) }
                val k = async { quelle.kontingent() }
                val e = async { quelle.buchungseinstellungen() }
                val a = async { quelle.buchungsarten() }
                val ba = async { quelle.blockungsarten() }
                val v = async { quelle.verzeichnis() }
                val i = async { quelle.ich() }
                val werte = listOf(p, b, k, e, a, ba, v, i).map { it.await() }
                // Inzwischen auf einen anderen Tag gewechselt: diese Antwort gilt nicht mehr.
                if (tag != datum) return@coroutineScope
                @Suppress("UNCHECKED_CAST")
                run {
                    plaetze = werte[0] as List<AktiverPlatz>
                    belegung = werte[1] as List<TagesBelegung>
                    kontingent = werte[2] as Kontingent
                    einstellungen = werte[3] as Buchungseinstellungen?
                    arten = werte[4] as List<Buchungsart>
                    blockungsarten = werte[5] as List<Buchungsart>
                    verzeichnis = werte[6] as List<Mitglied>
                    ich = werte[7] as Ich?
                }
                darfPlaetze = ich?.platzRechte == true
                meineId = ich?.memberId
                geladenFuer = tag
                ladeFehler = null
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (tag == datum) ladeFehler = Meldung.aus(e).text
        }
        if (tag == datum) laedt = false
    }

    /** Herunterziehen laedt nach, ohne den Plan gegen einen Ladekreis zu tauschen. */
    fun vonHand() {
        scope.launch {
            aktualisiert = true
            try {
                laden(still = true)
            } finally {
                aktualisiert = false
            }
        }
    }

    /** Zurueck im Vordergrund: was waehrend des Schlafs passiert ist, hat der Kanal nicht gesehen. */
    fun imVordergrund() {
        scope.launch { laden(still = true) }
    }

    /**
     * Der Plan haelt sich selbst aktuell: Kanal plan-<datum> auf bookings.
     * Eine Serienanlage mit sechzig Terminen loest sechzig Ereignisse in
     * Sekunden aus - hoechstens ein Nachladen pro Sekunde. Endet, wenn der
     * Aufrufer abbricht (Tageswechsel, Bildschirm weg).
     */
    suspend fun beobachte(tag: String) {
        quelle.aenderungen(tag).collect { auffrischen() }
    }

    private fun auffrischen() {
        val warten = PlaetzeLogik.drosselWartezeit(Instant.now(), letztesNachladen)
        if (warten.isZero) {
            letztesNachladen = Instant.now()
            scope.launch { laden(still = true) }
            return
        }
        if (nachladenWartet) return
        nachladenWartet = true
        scope.launch {
            delay(warten.toMillis())
            nachladenWartet = false
            letztesNachladen = Instant.now()
            laden(still = true)
        }
    }

    // ---- Tag und Ansicht --------------------------------------------------------

    fun waehleTag(t: String) {
        if (t == datum) return
        datum = t
        auswahl = null
        laedt = true
    }

    fun waehleAnsicht(a: Ansicht) {
        ansicht = a
        auswahl = null
        ansichtMerken(a)
    }

    // ---- Blatt oeffnen ----------------------------------------------------------

    fun platz(id: String): AktiverPlatz? = plaetze.firstOrNull { it.id == id }

    fun oeffnebar(b: TagesBelegung): Boolean = PlaetzeLogik.oeffnebar(b, darfPlaetze)

    fun buchenAuf(platz: AktiverPlatz, minute: Int) {
        if (PlaetzeLogik.kontingentAus(kontingent)) {
            meldung = Hinweis(ok = false, text = PlaetzeLogik.KONTINGENT_AUS_TEXT)
            return
        }
        val stunde = PlaetzeLogik.stunde(minute, oeffnung, anzeige)
        fensterFehler = null
        fenster = Fenster.Buchen(
            courtId = platz.id,
            platzName = platz.name ?: "",
            tag = datum,
            stunde = stunde,
            startzeiten = PlaetzeLogik.startzeiten(
                datum, platz.id, stunde, anzeige, raster, dauer, schluss, belegung, vorlauf, uhr(),
            ),
            start = minute,
        )
    }

    fun oeffne(b: TagesBelegung) {
        if (!oeffnebar(b)) return
        val platz = platz(b.courtId) ?: return
        fensterFehler = null
        fenster = Fenster.Bestehend(b, platz.name ?: "", datum)
    }

    fun schliesseFenster() {
        fenster = null
        fensterFehler = null
    }

    // ---- Aktionen -----------------------------------------------------------------

    /** Fuehrt eine schreibende Aktion aus; danach Snackbar und Markierung oder der Fehler im Blatt. */
    private fun aktion(ziel: Markierung? = null, arbeit: suspend () -> PlatzErgebnis) {
        if (laeuft) return
        scope.launch { ergebnis(mitLauf(arbeit), ziel) }
    }

    private suspend fun mitLauf(arbeit: suspend () -> PlatzErgebnis): PlatzErgebnis {
        laeuft = true
        try {
            return arbeit()
        } finally {
            laeuft = false
        }
    }

    private suspend fun ergebnis(r: PlatzErgebnis, ziel: Markierung? = null) {
        if (r.ok) {
            meldung = Hinweis(ok = true, text = r.meldung)
            markiert = ziel
            fenster = null
            auswahl = null
            fensterFehler = null
            laden(still = true)
        } else {
            fensterFehler = r.meldung
        }
    }

    /** Der Zeitpunkt wird in Europe/Berlin gebildet, nicht in der Zeitzone des Telefons. */
    fun buchen(courtId: String, tag: String, start: Int, typ: String, mitglieder: List<String>, gaeste: List<String>, sucht: Boolean) {
        val beginn = Zeit.berlinTime(tag, start)
        aktion(Markierung.Stelle(courtId, beginn)) {
            quelle.bucheplatz(courtId, beginn, typ, mitglieder, gaeste, sucht)
        }
    }

    fun speichern(id: String, mitglieder: List<String>, gaeste: List<String>) =
        aktion(Markierung.Buchung(id)) { quelle.aendereMitspieler(id, mitglieder, gaeste) }

    fun stornieren(id: String, grund: String) = aktion { quelle.storniereBuchung(id, grund) }

    fun terminAbsagen(id: String, grund: String) = aktion { quelle.sageSerienterminAb(id, grund) }

    fun sperreAufheben(id: String) = aktion { quelle.hebeSperreAuf(id) }

    fun ausschreiben(id: String, gesucht: Boolean) = aktion(Markierung.Buchung(id)) { quelle.sucheMitspieler(id, gesucht) }

    fun beitreten(id: String) = aktion(Markierung.Buchung(id)) { quelle.spieleMit(id) }

    fun umsetzen(id: String, courtId: String, tag: String, minute: Int, grund: String) =
        aktion(Markierung.Buchung(id)) { quelle.setzeUm(id, courtId, tag, minute, grund) }

    /**
     * Sperren. Liegen Buchungen im Weg, kommt deren Zahl ueber `kollision`
     * zurueck und das Blatt fragt selbst nach ("1 Buchung verdraengen") - sonst null.
     */
    fun sperren(
        courtId: String,
        tag: String,
        von: Int,
        bis: Int,
        typ: String,
        grund: String,
        verdraengen: Boolean,
        kollision: (Int?) -> Unit,
    ) {
        if (laeuft) return
        val beginn = Zeit.berlinTime(tag, von)
        scope.launch {
            val r = mitLauf {
                quelle.sperre(courtId, beginn, Zeit.berlinTime(tag, bis), typ, grund, verdraengen)
            }
            kollision(kollisionOderErgebnis(r, Markierung.Stelle(courtId, beginn)))
        }
    }

    fun sperreAendern(
        id: String,
        platzIds: List<String>,
        tag: String,
        von: Int,
        bis: Int,
        typ: String,
        grund: String,
        verdraengen: Boolean,
        kollision: (Int?) -> Unit,
    ) {
        if (laeuft) return
        scope.launch {
            val r = mitLauf {
                quelle.aendereSperre(
                    id, platzIds, Zeit.berlinTime(tag, von), Zeit.berlinTime(tag, bis), typ, grund, verdraengen,
                )
            }
            kollision(kollisionOderErgebnis(r, Markierung.Buchung(id)))
        }
    }

    private suspend fun kollisionOderErgebnis(r: PlatzErgebnis, ziel: Markierung): Int? {
        val n = r.kollisionen
        if (n != null && !r.ok) {
            fensterFehler = null
            return n
        }
        ergebnis(r, ziel)
        return null
    }

    /** Belegung eines anderen Tages, fuer das Umsetzen dorthin. */
    suspend fun tagesplan(tag: String): List<TagesBelegung> = quelle.tagesplan(tag)
}
