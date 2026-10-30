/*
 * Zustand des Tabs Verwaltung (VerwaltungModell in VerwaltungBildschirm.swift)
 *
 * Laedt Plaetze, Serien, Arten und den Zustand von jetzt auf einmal, merkt
 * sich Segment und offenes Blatt. Klappt eine Aktion im Blatt, schliesst es,
 * die Meldung steht unter dem gelben Knopf und die Seite laedt neu. Ein
 * ViewModel je Tab-Eintrag: Beim Wechsel zwischen den Tabs bleibt alles stehen.
 */

package de.tcmuckensturm.app.bildschirme.verwaltung

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.PlatzErgebnis
import de.tcmuckensturm.app.daten.Serie
import de.tcmuckensturm.app.daten.VerwaltungsQuelle
import de.tcmuckensturm.app.daten.VerwaltungsStand
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

enum class VerwaltungAnsicht(val label: String) {
    PLAETZE("Plätze"),
    SERIEN("Serien"),
}

sealed interface VerwaltungBlatt {
    data object Sperren : VerwaltungBlatt

    data object SerieAnlegen : VerwaltungBlatt

    data class SerieAendern(val serie: Serie) : VerwaltungBlatt
}

/**
 * @param uhr die Zeit fuer den Zustand "jetzt" und den Tag von heute.
 * @param bereich wo das Nachladen laeuft; ohne Angabe der viewModelScope.
 */
class VerwaltungModell(
    val quelle: VerwaltungsQuelle,
    private val uhr: () -> Instant = Instant::now,
    private val bereich: CoroutineScope? = null,
) : ViewModel() {
    private val scope: CoroutineScope get() = bereich ?: viewModelScope

    var ansicht by mutableStateOf(VerwaltungAnsicht.PLAETZE)
        private set
    var stand by mutableStateOf<VerwaltungsStand?>(null)
        private set
    var laedt by mutableStateOf(true)
        private set

    /** Ziehen zum Aktualisieren oder "Erneut versuchen" laeuft. */
    var aktualisiert by mutableStateOf(false)
        private set
    var fehler by mutableStateOf<String?>(null)
        private set
    var blatt by mutableStateOf<VerwaltungBlatt?>(null)

    /** Ergebnis der letzten Aktion, steht unter dem gelben Knopf. */
    var meldung by mutableStateOf<PlatzErgebnis?>(null)
        private set

    /** null, solange ich() nicht geantwortet hat - dann fehlen Avatar und Web-Hinweis. */
    var ich by mutableStateOf<Ich?>(null)
        private set

    val jetzt: Instant get() = uhr()

    /** Ein anderes Segment nimmt die alte Meldung mit. */
    fun waehle(neu: VerwaltungAnsicht) {
        if (neu != ansicht) meldung = null
        ansicht = neu
    }

    suspend fun laden(nachladen: Boolean = false) {
        if (nachladen) aktualisiert = true
        try {
            stand = quelle.laden(uhr())
            fehler = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fehler = Meldung.aus(e).text
        }
        laedt = false
        aktualisiert = false
    }

    suspend fun ladeIch() {
        ich = try {
            quelle.ich()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    fun vonHand() {
        scope.launch { laden(nachladen = true) }
    }

    /** Still, etwa beim Zurueckkehren aus dem Hintergrund. */
    fun still() {
        scope.launch { laden() }
    }

    /**
     * Nach einer Aktion im Blatt: Meldung zeigen, Blatt zu, neu laden. Das
     * Laden laeuft im ViewModel, denn mit dem Blatt endet auch dessen Scope.
     */
    fun erledigt(e: PlatzErgebnis) {
        blatt = null
        meldung = e
        still()
    }
}
