/*
 * Neuigkeiten (app/nachrichten.tsx)
 *
 * Wie NachrichtenBildschirm.swift der iOS-App. Zwei Dinge sind anders als in
 * einer gewoehnlichen Liste: Gelesen markiert wird erst beim Oeffnen dieses
 * Bildschirms, und der ungelesene Zustand bleibt beim ersten Anzeigen
 * sichtbar - erst anzeigen, dann abhaken. Beim Herunterziehen unterbleibt
 * das Abhaken ganz. "Alle als gelesen" nimmt die Hervorhebung weg.
 */

package de.tcmuckensturm.app.bildschirme.nachrichten

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Startdaten
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

/** Was der Bildschirm gerade zeigt. */
data class NachrichtenZustand(
    val nachrichten: List<Benachrichtigung>? = null,
    val fehler: String? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
    val alleGesehen: Boolean = false,
)

@Composable
fun NachrichtenBildschirm(zurueck: () -> Unit, zuVeranstaltung: (String) -> Unit) {
    val daten = Startdaten(LocalSitzung.current.client)
    val scope = rememberCoroutineScope()
    var zustand by remember { mutableStateOf(NachrichtenZustand()) }
    var schonAbgehakt by rememberSaveable { mutableStateOf(false) }

    suspend fun laden(nachladen: Boolean) {
        if (nachladen) zustand = zustand.copy(aktualisiert = true)
        zustand = try {
            val liste = daten.benachrichtigungen()
            if (!schonAbgehakt && liste.any { it.readAt == null }) {
                schonAbgehakt = true
                // Ohne Warten: die Liste soll sofort stehen, das Abhaken darf nachlaufen.
                scope.launch {
                    try {
                        daten.markiereGelesen()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Beim naechsten Oeffnen wieder
                    }
                }
            }
            zustand.copy(nachrichten = liste, fehler = null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            zustand.copy(fehler = Meldung.aus(e).text)
        }.copy(laedt = false, aktualisiert = false)
    }

    LaunchedEffect(Unit) { laden(nachladen = false) }

    NachrichtenInhalt(
        zustand = zustand,
        zurueck = zurueck,
        nachladen = { scope.launch { laden(nachladen = true) } },
        alleGelesen = { zustand = zustand.copy(alleGesehen = true) },
        zuVeranstaltung = zuVeranstaltung,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NachrichtenInhalt(
    zustand: NachrichtenZustand,
    zurueck: () -> Unit,
    nachladen: () -> Unit,
    alleGelesen: () -> Unit,
    zuVeranstaltung: (String) -> Unit,
    jetzt: Instant = Instant.now(),
) {
    val f = TcmTheme.farben
    PullToRefreshBox(
        isRefreshing = zustand.aktualisiert,
        onRefresh = nachladen,
        modifier = Modifier
            .fillMaxSize()
            .background(f.bg),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(horizontal = Abstand.rand)
                .padding(bottom = Abstand.abschnitt),
            verticalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            IconButton(onClick = zurueck, modifier = Modifier.padding(top = 4.dp)) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Zurück", tint = f.ink)
            }
            Text(
                "Neuigkeiten",
                style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.seitentitel, Schrift.laufweiteTitel),
                color = f.ink,
                modifier = Modifier
                    .padding(bottom = Abstand.s)
                    .semantics { heading() },
            )
            if (zustand.laedt) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = f.muted)
                }
            } else {
                zustand.fehler?.let { Fehlerzeile(it, zustand.aktualisiert, nachladen) }
                if (HomeLogik.zeigeAlleGelesen(zustand.nachrichten, zustand.alleGesehen)) {
                    Row(Modifier.fillMaxWidth()) {
                        Spacer(Modifier.weight(1f))
                        AlleGelesenKnopf(alleGelesen)
                    }
                }
                zustand.nachrichten?.let {
                    NachrichtenListe(it, zustand.alleGesehen, jetzt, zuVeranstaltung)
                }
            }
        }
    }
}
