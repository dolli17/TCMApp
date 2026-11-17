/*
 * Das Buchungsblatt (apps/mobile/src/components/BuchungsFenster.tsx)
 *
 * Wie Buchungsblatt.swift der iOS-App, als Bottom Sheet: dasselbe Blatt fuer
 * Buchen, Bearbeiten, Mitspielen, Stornieren und - abgesetzt unten - fuer
 * Sperren und Umsetzen mit Platzrechten. Nur Darstellung: ob gebucht werden
 * darf, entscheidet create_booking; die Startzeiten, die hier waehlbar sind,
 * kommen aus canStartAt, die Knoepfe aus bookingActions. Texte wortgleich mit
 * der Expo-App.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.DeinMarker
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.bildschirme.Kapsel
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.MarkeKlein
import de.tcmuckensturm.app.bildschirme.NebeneinanderOderUntereinander
import de.tcmuckensturm.app.bildschirme.Zweitknopf
import de.tcmuckensturm.app.daten.Initialen
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Mitglied
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.daten.info
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.Suchfilter
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

/**
 * Gaeste haben keinen Namen - es geht um die Gebuehr und den belegten Platz.
 * Die Datenbank verlangt einen nicht leeren guest_name, also traegt jeder
 * Gastplatz genau dieses Wort.
 */
private const val GAST = "Gast"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Buchungsblatt(m: PlaetzeModell, fenster: Fenster) {
    val f = TcmTheme.farben
    val zustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val schliessen: () -> Unit = {
        scope.launch { zustand.hide() }.invokeOnCompletion { m.schliesseFenster() }
    }
    ModalBottomSheet(
        onDismissRequest = m::schliesseFenster,
        sheetState = zustand,
        containerColor = f.surf,
        contentColor = f.ink,
        shape = RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt),
    ) {
        key(fenster) { BuchungsblattInhalt(m, fenster, schliessen) }
    }
}

/** Der Inhalt des Blatts, ohne das Blatt selbst - so zeichnen ihn auch die Bildschirmfotos. */
@Composable
fun BuchungsblattInhalt(m: PlaetzeModell, fenster: Fenster, schliessen: () -> Unit) {
    val kicker = "${fenster.platzName} · ${PlaetzeLogik.tagText(fenster.tag)}"
    Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding()) {
        when (fenster) {
            is Fenster.Buchen -> BuchenInhalt(m, fenster, kicker, schliessen)
            is Fenster.Bestehend -> VerwaltenInhalt(m, fenster.belegung, fenster.tag, kicker, schliessen)
        }
    }
}

private val BlattRand = 24.dp

/**
 * Der Aufbau jedes Blatts (docs/design/stitch, "blatt-*"): oben rollt der
 * Inhalt, unten steht - durch eine Linie abgesetzt - der Fuss mit der einen
 * Hauptaktion und der Fussnote.
 */
@Composable
private fun ColumnScope.Geruest(fuss: (@Composable ColumnScope.() -> Unit)? = null, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .weight(1f, fill = false)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = BlattRand)
            .padding(top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
        content = inhalt,
    )
    if (fuss != null) {
        Trenner()
        Column(
            Modifier.padding(horizontal = BlattRand).padding(top = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = fuss,
        )
    }
}

@Composable
private fun Trenner() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(TcmTheme.farben.line))
}

// ---- Kopf ---------------------------------------------------------------------------------

/**
 * Gross der Titel - die Uhrzeit, bei Umsetzen und Sperrung ein Wort -, daneben
 * die Marke ("Dein Spiel" gelb, "sucht 1" hellblau), darunter Platz und Tag,
 * rechts der runde Schliessen-Knopf.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlatzBlattKopf(
    kicker: String,
    titel: String,
    schliessen: () -> Unit,
    marke: (@Composable () -> Unit)? = null,
) {
    val f = TcmTheme.farben
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    titel,
                    style = TcmSchrift.display(Schrift.gewichtFett, 34.sp, (-0.8).sp).copy(fontFeatureSettings = "tnum"),
                    color = f.ink,
                    modifier = Modifier.semantics { heading() },
                )
                marke?.invoke()
            }
            Text(kicker, style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp), color = f.muted)
        }
        Rundknopf("Schließen", groesse = 44.dp, aktion = schliessen) {
            Icon(Icons.Filled.Close, contentDescription = null, tint = f.ink2, modifier = Modifier.size(18.dp))
        }
    }
}

/** Ein Hinweis vor dem Bestaetigen: was im Weg liegt. Rot, weil gleich etwas verdraengt wird. */
@Composable
fun Warnkasten(text: String) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(20.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .background(f.red.copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.07f), form)
            .border(1.dp, f.red.copy(alpha = 0.35f), form)
            .padding(horizontal = 16.dp, vertical = 14.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.Info, contentDescription = null, tint = f.redInk, modifier = Modifier.size(20.dp))
        Text(text, style = TcmSchrift.text(Schrift.gewichtMittel, 14.5.sp), color = f.redInk)
    }
}

// ---- Wer spielt mit? ------------------------------------------------------------------------

/** Der erste Chip: der Bucher (oder du). */
private data class Kopfchip(val kuerzel: String, val name: String, val gelb: Boolean)

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar. Das Suchfeld steht immer da; Gaeste kommen ueber
 * einen eigenen Verweis: sie kosten Geld, und das soll eine bewusste
 * Handlung sein.
 *
 * @param umfang wie viele mitspielen, aus der Buchungsart: "1 weitere Person"
 * @param zeilen beim bestehenden Spiel je Person eine Zeile, beim Buchen Chips
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Mitspieler(
    kopf: Kopfchip,
    verzeichnis: List<Mitglied>,
    mitglieder: List<String>,
    gaeste: List<String>,
    maxWeitere: Int,
    umfang: String,
    gastgebuehrCents: Int,
    zeilen: Boolean,
    /** Zaehlt hoch, wenn der gesperrte Buchen-Knopf zur Suche schickt. */
    fokusAnfrage: Int = 0,
    aendern: (mitglieder: List<String>, gaeste: List<String>) -> Unit,
) {
    val f = TcmTheme.farben
    var suche by remember { mutableStateOf("") }
    val fokus = remember { FocusRequester() }
    val voll = mitglieder.size + gaeste.size >= maxWeitere

    Column {
        Feldname("Wer spielt mit?", umfang.ifEmpty { null })
        if (zeilen) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Spielerzeile(kopf.kuerzel, kopf.name, du = kopf.gelb)
                for (id in mitglieder) {
                    val mg = verzeichnis.firstOrNull { it.id == id } ?: continue
                    Spielerzeile(
                        Initialen.von(mg.firstName, mg.lastName), mg.name,
                        weg = { aendern(mitglieder - id, gaeste) }, wegLabel = "${mg.name} entfernen",
                    )
                }
                gaeste.forEachIndexed { i, g ->
                    Spielerzeile(
                        "G", g, gast = true,
                        weg = { aendern(mitglieder, gaeste.filterIndexed { j, _ -> j != i }) }, wegLabel = "Gast ${i + 1} entfernen",
                    )
                }
            }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(kopf.kuerzel, kopf.name, gelb = kopf.gelb)
                for (id in mitglieder) {
                    val mg = verzeichnis.firstOrNull { it.id == id } ?: continue
                    Chip(
                        Initialen.von(mg.firstName, mg.lastName), mg.name,
                        weg = { aendern(mitglieder - id, gaeste) }, wegLabel = "${mg.name} entfernen",
                    )
                }
                gaeste.forEachIndexed { i, g ->
                    Chip(
                        "G", g, istGast = true,
                        weg = { aendern(mitglieder, gaeste.filterIndexed { j, _ -> j != i }) }, wegLabel = "Gast ${i + 1} entfernen",
                    )
                }
            }
        }

        if (voll) {
            Leise("Für diese Spielform sind alle Plätze besetzt.", Modifier.padding(top = 10.dp))
        } else {
            Eingabe(
                "Namen tippen …", "Mitspieler suchen", suche, { suche = it },
                Modifier.padding(top = 10.dp).focusRequester(fokus),
                symbol = Icons.Filled.Search,
            )
            LaunchedEffect(fokusAnfrage) { if (fokusAnfrage > 0) runCatching { fokus.requestFocus() } }
            if (suche.isNotBlank()) {
                val treffer = PlaetzeLogik.treffer(suche, verzeichnis, mitglieder)
                Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (treffer.isEmpty()) {
                        Leise("Niemand gefunden.")
                    } else {
                        for (t in treffer) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(Radius.feld))
                                    .background(f.surf2)
                                    .clickable(role = Role.Button) {
                                        aendern(mitglieder + t.id, gaeste)
                                        suche = ""
                                    }
                                    .padding(horizontal = 20.dp),
                                contentAlignment = Alignment.CenterStart,
                            ) {
                                Text(
                                    "${t.lastName ?: ""}, ${t.firstName ?: ""}",
                                    style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp),
                                    color = f.ink,
                                )
                            }
                        }
                    }
                }
            }
            // Der Gast als Verweis unter dem Suchfeld.
            Row(
                Modifier
                    .padding(top = 4.dp)
                    .heightIn(min = 44.dp)
                    .clip(Kapsel)
                    .clickable(role = Role.Button) { aendern(mitglieder, gaeste + GAST) }
                    .semantics {
                        contentDescription = if (gastgebuehrCents > 0) {
                            "Gast hinzufügen, ${Geld.formatCents(gastgebuehrCents)}"
                        } else {
                            "Gast hinzufügen"
                        }
                    }
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, tint = f.blueInk, modifier = Modifier.size(18.dp))
                Text(PlaetzeLogik.gastText(gastgebuehrCents), style = TcmSchrift.display(Schrift.gewichtHalbfett, 15.sp), color = f.blueInk)
            }
        }

        if (gaeste.isNotEmpty() && gastgebuehrCents > 0) {
            Leise(PlaetzeLogik.gastHinweis(gastgebuehrCents), Modifier.padding(top = 6.dp))
        }
    }
}

/** Eine Person als Zeile: Initialen im Kreis (du gelb), Name, rechts das X zum Entfernen. */
@Composable
private fun Spielerzeile(
    kuerzel: String,
    name: String,
    du: Boolean = false,
    gast: Boolean = false,
    weg: (() -> Unit)? = null,
    wegLabel: String? = null,
) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(20.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .background(f.surf2, form)
            .border(1.dp, f.line, form)
            .padding(start = 12.dp, end = if (weg == null) 16.dp else 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(40.dp).background(if (du) f.gold else if (gast) f.surf3 else f.blueSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                kuerzel.ifEmpty { "?" },
                style = TcmSchrift.display(Schrift.gewichtFett, 13.sp),
                color = if (du) f.onGold else if (gast) f.ink2 else f.blueInk,
            )
        }
        Text(
            name,
            style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp),
            color = f.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (weg != null) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = weg)
                    .semantics { contentDescription = wegLabel ?: "Entfernen" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = f.muted, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** Ein freier Platz im offenen Spiel: gestrichelt, "frei". */
@Composable
private fun FreiZeile() {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .gestrichelt(f.line2, 20.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).gestrichelt(f.line2, 20.dp), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Person, contentDescription = null, tint = f.muted, modifier = Modifier.size(18.dp))
        }
        Text("frei", style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp).copy(fontStyle = FontStyle.Italic), color = f.muted)
    }
}

// ---- Buchen -------------------------------------------------------------------------------

@Composable
private fun ColumnScope.BuchenInhalt(m: PlaetzeModell, b: Fenster.Buchen, kicker: String, schliessen: () -> Unit) {
    var start by remember { mutableIntStateOf(if (b.start in b.startzeiten) b.start else (b.startzeiten.firstOrNull() ?: b.stunde)) }
    var art by remember { mutableStateOf(m.arten.firstOrNull()?.code ?: "einzel") }
    var mitglieder by remember { mutableStateOf(listOf<String>()) }
    var gaeste by remember { mutableStateOf(listOf<String>()) }
    var sucht by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(Suchfilter.OFFEN) }
    var fokusAnfrage by remember { mutableIntStateOf(0) }
    var sperrOffen by remember { mutableStateOf(false) }

    if (sperrOffen) {
        SperrAnsicht(m, b.courtId, b.platzName, b.tag, b.stunde, kicker, schliessen) { sperrOffen = false }
        return
    }

    val gewaehlt = m.arten.firstOrNull { it.code == art }
    val info = gewaehlt?.info
    val dauer = gewaehlt?.durationMinutes ?: 60
    val maxWeitere = maxOf((gewaehlt?.maxPlayers ?: 2) - 1, 0)
    val nochPlatz = mitglieder.size + gaeste.size < maxWeitere
    val hinweis = PlaetzeLogik.buchenHinweis(info, mitglieder.size, gaeste.size, sucht)
    val haelften = (b.stunde until b.stunde + m.anzeige step maxOf(m.raster, 1)).toList()
    val ich = m.ich

    Geruest(
        fuss = {
            FehlerText(m.fensterFehler)
            if (hinweis != null && !m.laeuft) Besetzungshinweis(hinweis)
            // Die eine Hauptaktion des Blatts.
            Hauptknopf(
                if (m.laeuft) "Wird gebucht …" else "${b.platzName} buchen",
                gesperrt = m.laeuft || hinweis != null,
                grund = hinweis,
                beiGesperrt = if (m.laeuft || maxWeitere == 0) null else { { fokusAnfrage++ } },
            ) {
                m.buchen(b.courtId, b.tag, start, art, mitglieder, gaeste, sucht, if (sucht && nochPlatz) filter else Suchfilter.OFFEN)
            }
            Fussnote("Stornieren geht bis Spielbeginn")
        },
    ) {
        PlatzBlattKopf(kicker, "${Zeit.minutesToTime(start)} – ${Zeit.minutesToTime(start + dauer)}", schliessen)

        Column {
            Feldname("Beginn")
            Segmente("Beginn", haelften.map { Segment(it, Zeit.minutesToTime(it), it !in b.startzeiten) }, start, { start = it })
        }
        Column {
            Feldname("Spielform")
            Segmente("Spielform", m.arten.map { Segment(it.code, it.name ?: it.code) }, art, { neu ->
                art = neu
                val k = PlaetzeLogik.kuerze(mitglieder, gaeste, m.arten.firstOrNull { it.code == neu }?.maxPlayers ?: 2)
                mitglieder = k.mitglieder
                gaeste = k.gaeste
            })
        }

        // Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt ohnehin mit.
        Mitspieler(
            kopf = Kopfchip(Initialen.von(ich?.firstName, ich?.lastName), "Du", gelb = true),
            verzeichnis = m.verzeichnis.filter { it.id != m.meineId },
            mitglieder = mitglieder,
            gaeste = gaeste,
            maxWeitere = maxWeitere,
            umfang = info?.let(Platzplan::otherPlayersLabel) ?: "",
            gastgebuehrCents = m.gastgebuehr,
            zeilen = false,
            fokusAnfrage = fokusAnfrage,
            aendern = { neueMitglieder, neueGaeste ->
                mitglieder = neueMitglieder
                gaeste = neueGaeste
            },
        )

        if (nochPlatz) {
            Trenner()
            GesuchtKarte(sucht) { sucht = it }
            if (sucht) SuchfilterKarte(filter, deaktiviert = m.laeuft) { filter = it }
        }

        // Sperren ist die Ausnahme, nicht der Regelfall: leise am Ende.
        if (m.darfPlaetze) Nebenknopf("Stattdessen sperren", klein = true) { sperrOffen = true }
    }
}

/**
 * Den Block sperren statt buchen - eine eigene Ansicht des Blatts
 * (Entwurf "blatt-plaetze-sperren"). Gesperrt wird der ganze Anzeigeblock.
 * Zweistufig: liegen Buchungen im Weg, nennt der erste Versuch ihre Zahl,
 * erst der zweite verdraengt sie.
 */
@Composable
private fun ColumnScope.SperrAnsicht(
    m: PlaetzeModell,
    courtId: String,
    platzName: String,
    tag: String,
    stunde: Int,
    kicker: String,
    schliessen: () -> Unit,
    zurueck: () -> Unit,
) {
    // Vorgabe bleibt die Platzpflege; sonst die erste Kategorie.
    var art by remember {
        mutableStateOf(
            m.blockungsarten.firstOrNull { it.code == "platzpflege" }?.code ?: m.blockungsarten.firstOrNull()?.code ?: "platzpflege",
        )
    }
    var grund by remember { mutableStateOf("") }
    var kollisionen by remember { mutableStateOf<Int?>(null) }
    val bis = stunde + m.anzeige
    val n = kollisionen
    val sperren = { m.sperren(courtId, tag, stunde, bis, art, grund, verdraengen = n != null) { kollisionen = it } }

    Geruest(
        fuss = {
            FehlerText(m.fensterFehler)
            NebeneinanderOderUntereinander { breite ->
                // Verdraengen ist die rote Bestaetigung neben dem neutralen "Doch nicht".
                if (n != null) {
                    Hauptknopf(PlaetzeLogik.verdraengenText(n), breite, rot = true, gesperrt = m.laeuft, aktion = sperren)
                } else {
                    Hauptknopf("Sperren", breite, gesperrt = m.laeuft, aktion = sperren)
                }
                Nebenknopf("Doch nicht", breite, aktion = zurueck)
            }
        },
    ) {
        PlatzBlattKopf(kicker, "${Zeit.minutesToTime(stunde)} – ${Zeit.minutesToTime(bis)}", schliessen)
        Column {
            Feldname("Kategorie")
            Chipwahl(m.blockungsarten.map { it.code to (it.name ?: it.code) }, { it == art }, "Kategorie") {
                art = it
                kollisionen = null
            }
        }
        Column {
            Feldname("Grund (freiwillig)")
            Eingabe("z. B. nach Regen", "Grund der Sperrung, freiwillig", grund, { grund = it })
        }
        Leise("Gesperrt wird ${Zeit.minutesToTime(stunde)}–${Zeit.minutesToTime(bis)} Uhr auf $platzName.")
        if (n != null) Warnkasten(PlaetzeLogik.imWegText(n))
    }
}

// ---- Bearbeiten, Mitspielen, Stornieren ----------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.VerwaltenInhalt(m: PlaetzeModell, b: TagesBelegung, tag: String, kicker: String, schliessen: () -> Unit) {
    val f = TcmTheme.farben
    val vorher = remember(b) { b.playerMemberIds.orEmpty().filterNotNull() }
    val vorherGaeste = remember(b) { b.guestNames.orEmpty().filterNotNull() }
    var mitglieder by remember { mutableStateOf(vorher) }
    var gaeste by remember { mutableStateOf(vorherGaeste) }
    var stornoOffen by remember { mutableStateOf(false) }
    var umsetzOffen by remember { mutableStateOf(false) }
    var bearbeitenOffen by remember { mutableStateOf(false) }
    var grund by remember { mutableStateOf("") }
    // Einmal beim Oeffnen: die Uhr soll nicht unter dem Finger Knoepfe wegnehmen.
    val jetzt = remember { m.uhr() }

    val v = Verwalten(b, m.darfPlaetze, jetzt)
    val art = m.arten.firstOrNull { it.code == b.typeCode }
    val maxWeitere = maxOf((art?.maxPlayers ?: 4) - 1, 0)
    val geaendert = mitglieder.sorted() != vorher.sorted() || gaeste.sorted() != vorherGaeste.sorted()
    val bucher = Kopfchip(
        Initialen.ausName(b.ownerName),
        if (b.isOwn == true) "Du" else (b.ownerName ?: "Bucher"),
        gelb = b.isOwn == true,
    )

    val zeit = "${Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))} – ${Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))}"

    // Umsetzen und Sperrung bearbeiten sind eigene Ansichten des Blatts.
    if (umsetzOffen && v.kannUmsetzen) {
        UmsetzAnsicht(m, b, tag, jetzt, "$kicker · $zeit", schliessen) { umsetzOffen = false }
        return
    }
    if (bearbeitenOffen && v.kannSperreAendern) {
        SperreBearbeiten(m, b, tag, "$kicker · $zeit", schliessen) { bearbeitenOffen = false }
        return
    }

    val speichernOffen = !v.nurStorno && v.darfVerwalten && geaendert
    val fussnote = b.isOwn == true && !v.nurStorno && !v.laeuftSchon
    val hatFuss = m.fensterFehler != null || v.kannSperreAendern || v.kannMitspielen || speichernOffen || v.darfVerwalten

    Geruest(
        fuss = if (!hatFuss) {
            null
        } else {
            {
                FehlerText(m.fensterFehler)
                if (v.kannSperreAendern && !stornoOffen) {
                    Hauptknopf("Sperrung bearbeiten", gesperrt = m.laeuft) { bearbeitenOffen = true }
                }
                if (v.kannMitspielen) {
                    Hauptknopf(if (m.laeuft) "Wird eingetragen …" else "Mitspielen", gesperrt = m.laeuft) { m.beitreten(b.bookingId) }
                }
                if (speichernOffen && !stornoOffen) {
                    Hauptknopf(if (m.laeuft) "Wird gespeichert …" else "Mitspieler speichern", gesperrt = m.laeuft) {
                        m.speichern(b.bookingId, mitglieder, gaeste)
                    }
                }
                if (v.darfVerwalten) {
                    if (!stornoOffen) {
                        // Erster Schritt: roter Text, noch keine rote Flaeche.
                        Gefahrverweis(v.stornoText(bestaetigen = false), gesperrt = m.laeuft) { stornoOffen = true }
                    } else {
                        // Zweiter Schritt: rot gefuellt als Bestaetigung, daneben der neutrale Weg zurueck (U76).
                        NebeneinanderOderUntereinander { breite ->
                            Hauptknopf(
                                v.stornoText(bestaetigen = true),
                                breite,
                                rot = true,
                                gesperrt = m.laeuft || (v.grundNoetig && grund.isBlank()),
                            ) {
                                when {
                                    v.serientermin -> m.terminAbsagen(b.bookingId, grund)
                                    v.nurStorno -> m.sperreAufheben(b.bookingId)
                                    else -> m.stornieren(b.bookingId, grund)
                                }
                            }
                            Nebenknopf("Abbrechen", breite, gesperrt = m.laeuft) {
                                stornoOffen = false
                                grund = ""
                            }
                        }
                    }
                }
                if (fussnote) Fussnote("Stornieren geht bis Spielbeginn")
            }
        },
    ) {
        PlatzBlattKopf(kicker, zeit, schliessen) {
            // Gelb heisst "deins".
            if (b.isOwn == true && !v.nurStorno) DeinMarker("Dein Spiel")
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Infozeile(v.untertitel)
            Verwalten.suchtText(b)?.let { MarkeKlein(it) }
            if (v.nurStorno && !v.serientermin) Platzplan.blockingLabel(b.title, b.typeName).grund?.let { Leise(it) }
            if (m.darfPlaetze && b.isOwn != true && !v.nurStorno) Leise("Du bearbeitest eine fremde Buchung mit Platzrechten.")
            if (v.laeuftSchon) Leise("Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.")
        }

        if (!v.nurStorno && v.darfVerwalten) {
            Mitspieler(
                kopf = bucher,
                verzeichnis = m.verzeichnis.filter { it.id != b.ownerMemberId },
                mitglieder = mitglieder,
                gaeste = gaeste,
                maxWeitere = maxWeitere,
                umfang = art?.let { Platzplan.otherPlayersLabel(it.info) } ?: "",
                gastgebuehrCents = m.gastgebuehr,
                zeilen = true,
                aendern = { neueMitglieder, neueGaeste ->
                    mitglieder = neueMitglieder
                    gaeste = neueGaeste
                },
            )
        }

        if (!v.nurStorno && !v.darfVerwalten) {
            Column {
                Feldname("Wer spielt mit?")
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Spielerzeile(bucher.kuerzel, bucher.name, du = bucher.gelb)
                    for (p in b.players.orEmpty().filterNotNull()) Spielerzeile(Initialen.ausName(p), p)
                    repeat(maxOf(b.frei ?: 0, 0)) { FreiZeile() }
                }
                // Wer nur mitspielen kann, sieht, an wen sich die Suche richtet.
                if (b.partnerWanted == true) {
                    PlaetzeLogik.nurFuerText(b.suchfilter)?.let { nur ->
                        Row(
                            Modifier.padding(top = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(Icons.Outlined.Info, contentDescription = null, tint = f.muted, modifier = Modifier.size(16.dp))
                            Leise(nur)
                        }
                    }
                }
            }
        }

        if (!v.nurStorno && v.darfVerwalten && ((b.frei ?: 0) > 0 || b.partnerWanted == true)) {
            Trenner()
            Ausschreiben(m, b)
        }

        // Umsetzen ist die Ausnahme, wenn ein Platz ausfaellt: eine Zeile, die in die eigene Ansicht fuehrt.
        if (v.kannUmsetzen && !stornoOffen) Verweiszeile("Umsetzen") { umsetzOffen = true }

        if (v.darfVerwalten && stornoOffen && v.grundFeld) {
            Column {
                Feldname(if (v.grundNoetig) "Grund" else "Grund (freiwillig)")
                Eingabe(
                    if (v.serientermin) "z. B. Ferien" else "Steht in der Nachricht an die Betroffenen",
                    "Grund",
                    grund,
                    { grund = it },
                )
            }
        }
    }
}

/** Was fuer ein Spiel das ist ("Doppel · gebucht von …"), als ruhige Zeile unter dem Kopf. */
@Composable
private fun Infozeile(text: String) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(20.dp)
    Text(
        text,
        style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp),
        color = f.ink,
        modifier = Modifier
            .fillMaxWidth()
            .background(f.surf2, form)
            .border(1.dp, f.line, form)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    )
}

/** Eine Zeile, die weiterfuehrt: Symbol im hellblauen Kreis, Titel, Pfeil. */
@Composable
private fun Verweiszeile(titel: String, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.karte)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .clip(form)
            .background(f.surf2)
            .border(1.dp, f.line, form)
            .clickable(role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).background(f.blueSoft, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.DateRange, contentDescription = null, tint = f.blueInk, modifier = Modifier.size(20.dp))
        }
        Text(titel, style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp), color = f.ink, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = f.muted, modifier = Modifier.size(22.dp))
    }
}

/** Der erste Schritt zum Stornieren: roter Text mit Symbol, keine Flaeche. */
@Composable
private fun Gefahrverweis(text: String, gesperrt: Boolean, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .alpha(if (gesperrt) 0.5f else 1f)
            .clip(Kapsel)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = aktion),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        Icon(Icons.Outlined.Close, contentDescription = null, tint = f.redInk, modifier = Modifier.size(18.dp).border(1.5.dp, f.redInk, CircleShape).padding(3.dp))
        Text(text, style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp), color = f.redInk)
    }
}

/**
 * "Mitspieler gesucht" einer bestehenden Buchung mit "Nur für …".
 * Abschalten geht sofort. Beim Einschalten klappt erst der Filter auf, und
 * "Suche starten" schreibt aus - das Blatt schliesst nach jeder gelungenen
 * Aktion, der Filter waere sonst nicht mehr einstellbar. Bei laufender Suche
 * steht der gespeicherte Filter da; geaendert wird er mit "Suche ändern".
 */
@Composable
private fun Ausschreiben(m: PlaetzeModell, b: TagesBelegung) {
    val gesucht = b.partnerWanted == true
    val gespeichert = remember(b) { b.suchfilter }
    var an by remember(b) { mutableStateOf(gesucht) }
    var filter by remember(b) { mutableStateOf(gespeichert) }

    GesuchtKarte(an, deaktiviert = m.laeuft) { neu ->
        if (!neu && gesucht) m.ausschreiben(b.bookingId, false) else an = neu
    }
    if (an) {
        SuchfilterKarte(filter, deaktiviert = m.laeuft) { filter = it }
        if (!gesucht) {
            Zweitknopf(if (m.laeuft) "Wird ausgeschrieben …" else "Suche starten", gesperrt = m.laeuft) {
                m.ausschreiben(b.bookingId, true, filter)
            }
        } else if (filter != gespeichert) {
            Zweitknopf(if (m.laeuft) "Wird gespeichert …" else "Suche ändern", gesperrt = m.laeuft) {
                m.ausschreiben(b.bookingId, true, filter, nurFilter = true)
            }
        }
    }
}

// ---- Sperrung bearbeiten ----------------------------------------------------------------

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung - wie beim Sperren
 * zweistufig. Der Tag bleibt der des Plans.
 */
@Composable
private fun ColumnScope.SperreBearbeiten(
    m: PlaetzeModell,
    sperre: TagesBelegung,
    tag: String,
    kicker: String,
    schliessen: () -> Unit,
    zurueck: () -> Unit,
) {
    val zeit = remember(sperre) { Platzplan.sperrZeit(sperre) }
    var plaetze by remember { mutableStateOf(listOf(sperre.courtId)) }
    var von by remember { mutableIntStateOf(zeit.von) }
    var bis by remember { mutableIntStateOf(zeit.bis) }
    // Eine abgeschaltete Kategorie bleibt waehlbar, solange die Sperrung sie traegt.
    var art by remember { mutableStateOf(sperre.typeCode ?: m.blockungsarten.firstOrNull()?.code ?: "platzpflege") }
    var grund by remember { mutableStateOf(Platzplan.nichtLeer(sperre.title) ?: "") }
    var kollisionen by remember { mutableStateOf<Int?>(null) }

    val schritt = maxOf(m.raster, 1)
    val arten = buildList {
        val code = sperre.typeCode
        if (code != null && m.blockungsarten.none { it.code == code }) add(code to (sperre.typeName ?: code))
        addAll(m.blockungsarten.map { it.code to (it.name ?: it.code) })
    }
    val speichern = { verdraengen: Boolean ->
        m.sperreAendern(sperre.bookingId, plaetze, tag, von, bis, art, grund, verdraengen) { kollisionen = it }
    }
    val n = kollisionen

    Geruest(
        fuss = {
            FehlerText(m.fensterFehler)
            NebeneinanderOderUntereinander { breite ->
                if (n != null) {
                    Hauptknopf(PlaetzeLogik.verdraengenText(n), breite, rot = true, gesperrt = m.laeuft) { speichern(true) }
                } else {
                    Hauptknopf(
                        if (m.laeuft) "Wird gespeichert …" else "Änderungen speichern",
                        breite,
                        gesperrt = m.laeuft || plaetze.isEmpty(),
                    ) { speichern(false) }
                }
                Nebenknopf("Doch nicht", breite, aktion = zurueck)
            }
        },
    ) {
        PlatzBlattKopf(kicker, "Sperrung bearbeiten", schliessen)
        Column {
            Feldname("Plätze")
            Pillengitter(
                "Plätze",
                m.plaetze.map { Segment(it.id, it.shortName ?: it.name ?: "") },
                spalten = 4,
                gewaehlt = { it in plaetze },
                mehrfach = true,
            ) { id ->
                plaetze = if (id in plaetze) plaetze - id else plaetze + id
                kollisionen = null
            }
        }
        Column {
            Feldname("Zeit")
            NebeneinanderOderUntereinander(abstand = 12.dp) { breite ->
                Zeitschritt("Von", von, schritt, min = 0, max = bis - schritt, modifier = breite) {
                    von = it
                    kollisionen = null
                }
                Zeitschritt("Bis", bis, schritt, min = von + schritt, max = 24 * 60, modifier = breite) {
                    bis = it
                    kollisionen = null
                }
            }
        }
        Column {
            Feldname("Kategorie")
            Chipwahl(arten, { it == art }, "Kategorie") {
                art = it
                kollisionen = null
            }
        }
        Column {
            Feldname("Grund (freiwillig)")
            Eingabe("z. B. nach Regen", "Grund der Sperrung, freiwillig", grund, { grund = it })
        }
        if (n != null) Warnkasten(PlaetzeLogik.imWegText(n))
    }
}

/** Eine Uhrzeit mit Minus und Plus, im Raster des Plans. */
@Composable
private fun Zeitschritt(name: String, minute: Int, schritt: Int, min: Int, max: Int, modifier: Modifier = Modifier, wert: (Int) -> Unit) {
    Schrittfeld(
        name = name,
        wert = Zeit.minutesToTime(minute),
        wertLabel = "$name ${Zeit.minutesToTime(minute)} Uhr",
        wenigerLabel = "$name $schritt Minuten früher",
        mehrLabel = "$name $schritt Minuten später",
        wenigerAus = minute - schritt < min,
        mehrAus = minute + schritt > max,
        weniger = { wert(minute - schritt) },
        mehr = { wert(minute + schritt) },
        modifier = modifier,
    )
}

// ---- Umsetzen -----------------------------------------------------------------------------

/**
 * Wohin mit der Buchung? Eine eigene Ansicht des Blatts (Entwurf "blatt-umsetzen"): Tag, Platz und Beginn. Was waehlbar ist, rechnet
 * umsetzZiele aus der Belegung des Zieltags; fuer einen anderen Tag wird
 * day_schedule nachgeladen. Eine laufende Buchung wechselt nur den Platz.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.UmsetzAnsicht(
    m: PlaetzeModell,
    b: TagesBelegung,
    planTag: String,
    jetzt: Instant,
    kicker: String,
    schliessen: () -> Unit,
    zurueck: () -> Unit,
) {
    val f = TcmTheme.farben
    var tag by remember { mutableStateOf(planTag) }
    var andererTag by remember { mutableStateOf<Pair<String, List<TagesBelegung>>?>(null) }
    var ladeFehler by remember { mutableStateOf<String?>(null) }
    var platzWahl by remember { mutableStateOf<String?>(null) }
    var minuteWahl by remember { mutableStateOf<Int?>(null) }
    var grund by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    /** Nur die letzte Anfrage zaehlt, wenn schnell durch die Tage getippt wird. */
    fun waehle(neu: String) {
        tag = neu
        ladeFehler = null
        if (neu == planTag) return
        scope.launch {
            try {
                val belegung = m.tagesplan(neu)
                if (tag == neu) andererTag = neu to belegung
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (tag == neu) ladeFehler = Meldung.aus(e).text
            }
        }
    }

    val laeuftSchon = (Zeit.datum(b.startsAt) ?: Instant.MIN) <= jetzt
    val belegung = when {
        tag == planTag -> m.belegung
        andererTag?.first == tag -> andererTag?.second
        else -> null
    }
    val ziele = belegung?.let {
        Platzplan.umsetzZiele(b, tag, m.plaetze.map { p -> p.id }, m.oeffnung, m.schluss, m.raster, it, jetzt)
    }.orEmpty()
    // Die Wahl bleibt, solange sie noch ein Ziel ist; vorgewaehlt wird ein anderer Platz zur selben Zeit.
    val mitZiel = m.plaetze.filter { p -> ziele.any { it.courtId == p.id } }
    val platz = mitZiel.firstOrNull { it.id == platzWahl } ?: mitZiel.firstOrNull { it.id != b.courtId } ?: mitZiel.firstOrNull()
    val zeiten = ziele.filter { it.courtId == platz?.id }.map { it.minute }
    val eigeneMinute = Zeit.minutesOf(b.startsAt)
    val minute = minuteWahl?.takeIf { it in zeiten } ?: (if (eigeneMinute in zeiten) eigeneMinute else zeiten.firstOrNull())
    val dauer = Zeit.minutesOf(b.endsAt) - eigeneMinute
    val grundNoetig = b.isOwn != true
    val bereit = platz != null && minute != null && !(grundNoetig && grund.isBlank())
    // Der Tag der Buchung steht immer zur Wahl.
    val tage = (listOf(planTag) + m.tage).toSet().filter { it >= Zeit.berlinDay(jetzt) }.sorted()

    Geruest(
        fuss = {
            FehlerText(m.fensterFehler)
            NebeneinanderOderUntereinander { breite ->
                Hauptknopf(if (m.laeuft) "Wird umgesetzt …" else "Hierhin umsetzen", breite, gesperrt = m.laeuft || !bereit) {
                    if (platz != null && minute != null) m.umsetzen(b.bookingId, platz.id, tag, minute, grund)
                }
                Nebenknopf("Doch nicht", breite, aktion = zurueck)
            }
        },
    ) {
        PlatzBlattKopf(kicker, "Umsetzen", schliessen)

        if (laeuftSchon) {
            Leise("Die Buchung läuft schon – sie kann nur noch den Platz wechseln.")
        } else {
            Column {
                Feldname("Tag")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tage) { t -> TagKachel(t, aktiv = t == tag) { waehle(t) } }
                }
            }
        }

        when {
            ladeFehler != null -> Text(ladeFehler!!, style = TcmSchrift.text(Schrift.gewichtMittel, 14.sp), color = f.redInk)
            belegung == null -> Leise("Belegung wird geladen …")
            ziele.isEmpty() -> Leise("An diesem Tag ist kein Platz frei, auf den die Buchung passt.")
            else -> {
                Column {
                    Feldname("Platz")
                    Pillengitter(
                        "Platz",
                        m.plaetze.map { p -> Segment(p.id, p.shortName ?: p.name ?: "", p !in mitZiel) },
                        spalten = 4,
                        gewaehlt = { it == platz?.id },
                    ) { platzWahl = it }
                }
                Column {
                    Feldname("Beginn")
                    Pillengitter(
                        "Beginn",
                        zeiten.map { Segment(it, Zeit.minutesToTime(it)) },
                        spalten = 3,
                        gewaehlt = { it == minute },
                    ) { minuteWahl = it }
                }
            }
        }

        Column {
            Feldname(if (grundNoetig) "Grund" else "Grund (freiwillig)")
            Eingabe("z. B. Platz 3 steht unter Wasser", "Grund fürs Umsetzen", grund, { grund = it })
        }

        // Was nach dem Umsetzen gilt, als Karte ueber dem Fuss.
        if (platz != null && minute != null) {
            val form = RoundedCornerShape(Radius.karte)
            Row(
                Modifier.fillMaxWidth().background(f.surf2, form).border(1.dp, f.line, form).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(Modifier.size(44.dp).background(f.blueSoft, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Refresh, contentDescription = null, tint = f.blueInk, modifier = Modifier.size(20.dp))
                }
                Text(
                    "Neu: ${platz.name ?: ""} · ${PlaetzeLogik.tagText(tag)} · ${Zeit.minutesToTime(minute)}–" +
                        "${Zeit.minutesToTime(minute + dauer)} Uhr. Bucher und Mitspieler werden benachrichtigt.",
                    style = TcmSchrift.text(Schrift.gewichtMittel, 14.5.sp),
                    color = f.ink,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
