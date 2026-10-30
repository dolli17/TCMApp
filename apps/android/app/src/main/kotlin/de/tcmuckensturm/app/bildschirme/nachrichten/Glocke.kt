/*
 * Die Benachrichtigungsglocke (Glocke.tsx)
 *
 * Wie Glocke.swift der iOS-App: rund, 44 dp, im grossen Kopf neben dem
 * Avatar. Der Zaehler wird bei jedem Erscheinen neu geholt, sonst bliebe die
 * rote Marke stehen, nachdem die Nachrichten gelesen wurden. Ein Fehler beim
 * Zaehlen zaehlt als 0.
 *
 * Ein Tippen oeffnet die Nachrichten als Bottom Sheet und markiert sie
 * gelesen; die Hervorhebung bleibt, bis "Alle als gelesen" sie wegnimmt.
 */

package de.tcmuckensturm.app.bildschirme.nachrichten

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.GedeckelteSchrift
import de.tcmuckensturm.app.bildschirme.Kapsel
import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.app.bildschirme.verein.LocalZuVerein
import de.tcmuckensturm.app.bildschirme.verein.VereinZiel
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

/** Was das Blatt hinter der Glocke zeigt. */
data class GlockenBlatt(
    val liste: List<Benachrichtigung>? = null,
    val fehler: String? = null,
    val alleGesehen: Boolean = false,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Glocke() {
    // Auf jedem Tab gleich: eine Nachricht zu einer Veranstaltung oeffnet deren Detail im Verein.
    val zuVerein = LocalZuVerein.current
    val zuVeranstaltung: (String) -> Unit = { zuVerein(VereinZiel.Veranstaltung(it)) }
    val daten = Startdaten(LocalSitzung.current.client)
    val scope = rememberCoroutineScope()
    var ungelesen by remember { mutableIntStateOf(0) }
    var offen by remember { mutableStateOf(false) }
    var blatt by remember { mutableStateOf(GlockenBlatt()) }

    // Bei jedem Erscheinen (auch zurueck auf Home) neu zaehlen.
    LaunchedEffect(Unit) { ungelesen = daten.ungelesen() }

    GlockeKnopf(ungelesen) {
        offen = true
        blatt = GlockenBlatt()
        scope.launch {
            try {
                val neu = daten.benachrichtigungen()
                blatt = blatt.copy(liste = neu)
                if (neu.any { it.readAt == null }) {
                    // Die Liste steht sofort, das Abhaken laeuft nach.
                    try {
                        daten.markiereGelesen()
                        ungelesen = 0
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // bleibt ungelesen; der naechste Blick zaehlt neu
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                blatt = blatt.copy(fehler = Meldung.aus(e).text)
            }
        }
    }

    if (offen) {
        val zustand = rememberModalBottomSheetState()
        val schliessen: () -> Unit = {
            scope.launch {
                zustand.hide()
                offen = false
                ungelesen = daten.ungelesen()
            }
        }
        ModalBottomSheet(
            onDismissRequest = {
                offen = false
                scope.launch { ungelesen = daten.ungelesen() }
            },
            sheetState = zustand,
            containerColor = TcmTheme.farben.bg,
        ) {
            GlockenBlattInhalt(
                blatt = blatt,
                alleGelesen = { blatt = blatt.copy(alleGesehen = true) },
                schliessen = schliessen,
                zuVeranstaltung = { id ->
                    schliessen()
                    zuVeranstaltung(id)
                },
            )
        }
    }
}

/** Der runde Knopf mit der roten Zahl. */
@Composable
fun GlockeKnopf(ungelesen: Int, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Box(
        Modifier
            .size(44.dp)
            // Runder Druck- und Fokuszustand, ohne die überstehende Zahl abzuschneiden.
            .clickable(interactionSource = null, indication = ripple(bounded = false, radius = 22.dp), role = Role.Button, onClick = aktion)
            .clearAndSetSemantics {
                contentDescription = HomeLogik.glockenLabel(ungelesen)
                role = Role.Button
            },
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(f.surf2)
                .border(1.dp, f.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.Notifications, contentDescription = null, tint = f.ink, modifier = Modifier.size(22.dp))
        }
        if (ungelesen > 0) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 3.dp, y = (-3).dp)
                    .defaultMinSize(minWidth = 18.dp, minHeight = 18.dp)
                    .clip(Kapsel)
                    .background(f.red)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                GedeckelteSchrift {
                    Text(
                        HomeLogik.glockenZahl(ungelesen),
                        style = TcmSchrift.text(Schrift.gewichtFett, 11.sp),
                        color = f.onBrand,
                    )
                }
            }
        }
    }
}

/** Der Inhalt des Blatts: Titel, Schliessen, "Alle als gelesen", Liste. */
@Composable
fun GlockenBlattInhalt(
    blatt: GlockenBlatt,
    alleGelesen: () -> Unit,
    schliessen: () -> Unit,
    zuVeranstaltung: (String) -> Unit,
    jetzt: Instant = Instant.now(),
) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Abstand.rand)
            .padding(bottom = Abstand.rand),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Benachrichtigungen",
                style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.titel),
                color = f.ink,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            IconButton(onClick = schliessen) {
                Icon(Icons.Outlined.Close, contentDescription = "Schließen", tint = f.ink)
            }
        }
        if (HomeLogik.zeigeAlleGelesen(blatt.liste, blatt.alleGesehen)) {
            AlleGelesenKnopf(alleGelesen)
        }
        when {
            blatt.fehler != null ->
                Text(blatt.fehler, style = TcmSchrift.text(Schrift.gewichtHalbfett, 16.sp), color = f.redInk)
            blatt.liste != null ->
                NachrichtenListe(blatt.liste, blatt.alleGesehen, jetzt, zuVeranstaltung)
            else -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = f.muted)
            }
        }
    }
}
