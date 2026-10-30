/*
 * Veranstaltungen (apps/mobile/app/(tabs)/verein/(reiter)/veranstaltungen.tsx)
 *
 * Wie Bildschirme/Verein/VeranstaltungenAnsicht.swift der iOS-App:
 * Kommendes nach Monat, darunter ein Schalter fuer Vergangenes. Gruppierung
 * und Texte kommen aus dem Kern (eventMonatsGruppen, eventKartenZeile) -
 * dieselben wie im Web. Eine Karte fuehrt ins Detail; zurueck von dort wird
 * still nachgeladen, etwa nach dem Anmelden.
 *
 * EventKarte ist dieselbe Karte wie auf Home ("Demnächst im Verein", mit
 * aufforderung) und darf von dort benutzt werden.
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Vereinsdaten
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.EventTon
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Veranstaltungen
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

data class VeranstaltungenStand(
    val events: List<MitgliedEvent>? = null,
    val fehler: String? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
)

class VeranstaltungenModell(private val daten: Vereinsdaten, private val zustand: VereinZustand) : ViewModel() {
    var stand by mutableStateOf(VeranstaltungenStand())
        private set

    init {
        laden(Ladeart.ERSTES)
    }

    fun laden(art: Ladeart) {
        viewModelScope.launch {
            if (art == Ladeart.NACHLADEN) stand = stand.copy(aktualisiert = true)
            launch { ladeIch(daten, zustand) }
            stand = try {
                stand.copy(events = daten.veranstaltungen(), fehler = null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                stand.copy(fehler = Meldung.aus(e).text)
            }
            stand = stand.copy(laedt = false, aktualisiert = false)
        }
    }
}

/** Der Name fuer den Avatar; schlaegt es fehl, bleibt der alte. */
internal suspend fun ladeIch(daten: Vereinsdaten, zustand: VereinZustand) {
    try {
        daten.ich()?.let { zustand.ich = it }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
    }
}

@Composable
fun VeranstaltungenAnsicht(kopf: @Composable () -> Unit, oeffne: (String) -> Unit) {
    val client = LocalSitzung.current.client
    val zustand = LocalVereinZustand.current
    val modell = viewModel { VeranstaltungenModell(Vereinsdaten(client), zustand) }
    // Zurueck aus dem Detail oder auf den Tab: still nachladen.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (modell.stand.events != null) modell.laden(Ladeart.STILL)
    }
    var vergangen by rememberSaveable { mutableStateOf(false) }
    VeranstaltungenSeite(
        stand = modell.stand,
        jetzt = Instant.now(),
        vergangen = vergangen,
        kopf = kopf,
        nachladen = { modell.laden(Ladeart.NACHLADEN) },
        umschalten = { vergangen = !vergangen },
        oeffne = oeffne,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VeranstaltungenSeite(
    stand: VeranstaltungenStand,
    jetzt: Instant,
    vergangen: Boolean,
    kopf: @Composable () -> Unit,
    nachladen: () -> Unit,
    umschalten: () -> Unit,
    oeffne: (String) -> Unit,
) {
    val f = TcmTheme.farben
    val gruppen = Veranstaltungen.eventMonatsGruppen(stand.events.orEmpty(), jetzt, vergangen)
    PullToRefreshBox(
        isRefreshing = stand.aktualisiert,
        onRefresh = nachladen,
        modifier = Modifier.fillMaxSize().background(f.bg),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(horizontal = Abstand.rand)
                .padding(bottom = Abstand.abschnitt * 2),
            verticalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            kopf()
            stand.fehler?.let { Fehlerzeile(it, stand.aktualisiert, nachladen) }
            if (stand.laedt && stand.events == null) {
                Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = f.muted)
                }
            } else if (stand.events != null) {
                if (vergangen) Abschnitt("Vergangene Veranstaltungen")
                if (gruppen.isEmpty()) {
                    Leerzustand(if (vergangen) "Noch keine vergangenen Veranstaltungen." else "Gerade ist nichts geplant.")
                }
                for (g in gruppen) {
                    Column(Modifier.padding(bottom = Abstand.s), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            g.titel.uppercase(),
                            style = TcmSchrift.text(Schrift.gewichtFett, 13.sp, 0.8.sp),
                            color = f.muted,
                            modifier = Modifier.semantics { heading() },
                        )
                        for (e in g.events) EventKarte(e, jetzt) { oeffne(e.id) }
                    }
                }
                Textknopf(
                    if (vergangen) "Kommende Veranstaltungen" else "Vergangene Veranstaltungen",
                    Modifier.align(Alignment.CenterHorizontally),
                    umschalten,
                )
            }
        }
    }
}

/** Eine Veranstaltung als Karte: Datumskachel, Marken, Titel, Zeit und Ort, die fette Zeile. */
@Composable
fun EventKarte(e: MitgliedEvent, jetzt: Instant, aufforderung: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val k = Veranstaltungen.eventDatumKachel(e.startsAt)
    val vorbei = Veranstaltungen.eventVorbei(e, jetzt) || e.status == "cancelled"
    val marke = Veranstaltungen.eventMeineMarke(e, jetzt, aufforderung)
    val art = e.kind ?: ""
    val beschreibung = VereinLogik.kartenBeschreibung(e, jetzt, aufforderung)
    Surface(
        onClick = aktion,
        shape = RoundedCornerShape(Radius.karte),
        color = Color.Transparent,
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = beschreibung },
    ) {
        Row(Modifier.fillMaxWidth().karte(innen = 14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(
                Modifier
                    .size(width = 52.dp, height = 56.dp)
                    .background(if (vorbei) f.surf2 else f.brand, RoundedCornerShape(14.dp)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                val farbe = if (vorbei) f.ink2 else f.onBrand
                Text(k.tag, style = TcmSchrift.display(Schrift.gewichtFett, 21.sp), color = farbe)
                Text(k.monat.uppercase(), style = TcmSchrift.display(Schrift.gewichtFett, Schrift.kicker, 0.6.sp), color = farbe)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MarkeKlein(Veranstaltungen.kindLabel[art] ?: art, Veranstaltungen.kindTon[art] ?: EventTon.GRAU)
                    marke?.let { MarkeKlein(it.text, it.ton) }
                }
                Text(e.title ?: "", style = TcmSchrift.text(Schrift.gewichtFett, 17.sp), color = if (vorbei) f.ink2 else f.ink)
                Text(Veranstaltungen.eventKartenZeit(e), style = TcmSchrift.text(Schrift.gewichtNormal, 13.5.sp), color = f.muted)
                Text(Veranstaltungen.eventKartenZeile(e, jetzt), style = TcmSchrift.text(Schrift.gewichtFett, 13.5.sp), color = f.ink)
            }
        }
    }
}
