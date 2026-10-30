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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.NebeneinanderOderUntereinander
import de.tcmuckensturm.app.daten.Initialen
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Mitglied
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.daten.info
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Platzplan
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
    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .navigationBarsPadding()
            .padding(horizontal = Abstand.rand)
            .padding(top = 8.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        when (fenster) {
            is Fenster.Buchen -> BuchenInhalt(m, fenster, kicker, schliessen)
            is Fenster.Bestehend -> VerwaltenInhalt(m, fenster.belegung, fenster.tag, kicker, schliessen)
        }
    }
}

// ---- Kopf ---------------------------------------------------------------------------------

/** Kicker, Zeit als Titel, rechts das X. */
@Composable
private fun PlatzBlattKopf(kicker: String, titel: String, schliessen: () -> Unit) {
    val f = TcmTheme.farben
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(kicker.uppercase(), style = TcmSchrift.kicker, color = f.muted)
            Text(
                titel,
                style = TcmSchrift.display(Schrift.gewichtFett, 30.sp).copy(fontFeatureSettings = "tnum"),
                color = f.ink,
                modifier = Modifier.semantics { heading() },
            )
        }
        Rundknopf("Schließen", aktion = schliessen) {
            Icon(Icons.Filled.Close, contentDescription = null, tint = f.ink, modifier = Modifier.size(18.dp))
        }
    }
}

// ---- Wer spielt mit? ------------------------------------------------------------------------

/** Der erste Chip: der Bucher (oder du). */
private data class Kopfchip(val kuerzel: String, val name: String, val gelb: Boolean)

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar. Gaeste kommen ueber einen eigenen Knopf: sie
 * kosten Geld, und das soll eine bewusste Handlung sein.
 *
 * @param umfang wie viele mitspielen, aus der Buchungsart: "1 weitere Person"
 * @param gefragt es fehlt noch jemand: "+ Mitglied" ist dann der naechste Schritt
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
    suchen: Boolean,
    gefragt: Boolean = false,
    /** Zaehlt hoch, wenn der gesperrte Buchen-Knopf zur Suche schickt; holt den Fokus auch bei offenem Feld. */
    fokusAnfrage: Int = 0,
    aendern: (mitglieder: List<String>, gaeste: List<String>) -> Unit,
    suchenWechsel: (Boolean) -> Unit,
) {
    val f = TcmTheme.farben
    var suche by remember { mutableStateOf("") }
    val fokus = remember { FocusRequester() }
    val voll = mitglieder.size + gaeste.size >= maxWeitere

    Column {
        Feldname("Wer spielt mit?", umfang.ifEmpty { null })
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

        if (voll) {
            Leise("Für diese Spielform sind alle Plätze besetzt.", Modifier.padding(top = 10.dp))
        } else {
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GestrichelterKnopf(
                    "Mitglied",
                    betont = gefragt,
                    modifier = Modifier.weight(1f).semantics { stateDescription = if (suchen) "aufgeklappt" else "zugeklappt" },
                ) { suchenWechsel(!suchen) }
                GestrichelterKnopf(
                    PlaetzeLogik.gastText(gastgebuehrCents),
                    betont = false,
                    modifier = Modifier.weight(1f).semantics {
                        contentDescription = if (gastgebuehrCents > 0) {
                            "Gast hinzufügen, ${Geld.formatCents(gastgebuehrCents)}"
                        } else {
                            "Gast hinzufügen"
                        }
                    },
                ) { aendern(mitglieder, gaeste + GAST) }
            }
        }

        if (suchen && !voll) {
            Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eingabe("Namen tippen …", "Mitspieler suchen", suche, { suche = it }, Modifier.focusRequester(fokus))
                LaunchedEffect(fokusAnfrage) { runCatching { fokus.requestFocus() } }
                if (suche.isNotBlank()) {
                    val treffer = PlaetzeLogik.treffer(suche, verzeichnis, mitglieder)
                    if (treffer.isEmpty()) {
                        Leise("Niemand gefunden.")
                    } else {
                        for (t in treffer) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(f.surf2)
                                    .clickable(role = Role.Button) {
                                        aendern(mitglieder + t.id, gaeste)
                                        suche = ""
                                        suchenWechsel(false)
                                    }
                                    .padding(horizontal = 14.dp),
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
        }

        if (gaeste.isNotEmpty() && gastgebuehrCents > 0) {
            Leise(PlaetzeLogik.gastHinweis(gastgebuehrCents), Modifier.padding(top = 10.dp))
        }
    }
}

/** "+ Mitglied" und "+ Gast": gestrichelt, betont blau, wenn noch jemand fehlt. */
@Composable
private fun GestrichelterKnopf(text: String, betont: Boolean, modifier: Modifier, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(14.dp)
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(form)
            .then(
                if (betont) {
                    Modifier.background(f.blue.copy(alpha = 0.07f)).border(1.5.dp, f.blue, form)
                } else {
                    Modifier.gestrichelt(f.line2, 14.dp)
                },
            )
            .clickable(role = Role.Button, onClick = aktion)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        val farbe = if (betont) f.blueInk else f.ink
        Icon(Icons.Filled.Add, contentDescription = null, tint = farbe, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(4.dp))
        Text(text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp), color = farbe, maxLines = 1)
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
    var suchen by remember { mutableStateOf(false) }
    var fokusAnfrage by remember { mutableIntStateOf(0) }

    val gewaehlt = m.arten.firstOrNull { it.code == art }
    val info = gewaehlt?.info
    val dauer = gewaehlt?.durationMinutes ?: 60
    val maxWeitere = maxOf((gewaehlt?.maxPlayers ?: 2) - 1, 0)
    val nochPlatz = mitglieder.size + gaeste.size < maxWeitere
    val hinweis = PlaetzeLogik.buchenHinweis(info, mitglieder.size, gaeste.size, sucht)
    val fehlen = info?.let { if (sucht && nochPlatz) 0 else Platzplan.missingPlayers(it, mitglieder.size, gaeste.size) } ?: 0
    val haelften = (b.stunde until b.stunde + m.anzeige step maxOf(m.raster, 1)).toList()
    val ich = m.ich

    PlatzBlattKopf(kicker, "${Zeit.minutesToTime(start)} – ${Zeit.minutesToTime(start + dauer)}", schliessen)

    val beginn: @Composable (Modifier) -> Unit = { mod ->
        Column(mod) {
            Feldname("Beginn")
            Segmente("Beginn", haelften.map { Segment(it, Zeit.minutesToTime(it), it !in b.startzeiten) }, start, { start = it })
        }
    }
    val spielform: @Composable (Modifier) -> Unit = { mod ->
        Column(mod) {
            Feldname("Spielform")
            Segmente("Spielform", m.arten.map { Segment(it.code, it.name ?: it.code) }, art, { neu ->
                art = neu
                val k = PlaetzeLogik.kuerze(mitglieder, gaeste, m.arten.firstOrNull { it.code == neu }?.maxPlayers ?: 2)
                mitglieder = k.mitglieder
                gaeste = k.gaeste
            })
        }
    }
    // Zwei Segmente nebeneinander, solange es je zwei Werte sind
    if (haelften.size <= 2 && m.arten.size <= 2) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            beginn(Modifier.weight(1f))
            spielform(Modifier.weight(1f))
        }
    } else {
        beginn(Modifier)
        spielform(Modifier)
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
        suchen = suchen,
        gefragt = fehlen > 0,
        fokusAnfrage = fokusAnfrage,
        aendern = { neueMitglieder, neueGaeste ->
            mitglieder = neueMitglieder
            gaeste = neueGaeste
        },
        suchenWechsel = { suchen = it },
    )

    if (nochPlatz) GesuchtKarte(sucht) { sucht = it }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FehlerText(m.fensterFehler)
        if (hinweis != null && !m.laeuft) Besetzungshinweis(hinweis)
        Hauptknopf(
            if (m.laeuft) "Wird gebucht …" else "${b.platzName} buchen",
            gesperrt = m.laeuft || hinweis != null,
            grund = hinweis,
            beiGesperrt = if (m.laeuft || maxWeitere == 0) {
                null
            } else {
                {
                    suchen = true
                    fokusAnfrage++
                }
            },
        ) {
            m.buchen(b.courtId, b.tag, start, art, mitglieder, gaeste, sucht)
        }
        Fussnote("Stornieren geht bis Spielbeginn")
    }

    if (m.darfPlaetze) SperrBereich(m, b.courtId, b.platzName, b.tag, b.stunde)
}

/**
 * Sperren steht abgesetzt unter dem Buchen: es ist die Ausnahme, nicht der
 * Regelfall. Gesperrt wird der ganze Anzeigeblock. Zweistufig: liegen
 * Buchungen im Weg, nennt der erste Versuch ihre Zahl, erst der zweite
 * verdraengt sie.
 */
@Composable
private fun SperrBereich(m: PlaetzeModell, courtId: String, platzName: String, tag: String, stunde: Int) {
    var grund by remember { mutableStateOf<String?>(null) }
    var art by remember { mutableStateOf("") }
    var kollisionen by remember { mutableStateOf<Int?>(null) }
    val bis = stunde + m.anzeige

    Abgesetzt {
        val g = grund
        if (g == null) {
            Nebenknopf("Stattdessen sperren", klein = true) {
                // Vorgabe bleibt die Platzpflege; sonst die erste Kategorie.
                art = m.blockungsarten.firstOrNull { it.code == "platzpflege" }?.code
                    ?: m.blockungsarten.firstOrNull()?.code ?: "platzpflege"
                grund = ""
            }
        } else {
            Column {
                Feldname("Kategorie")
                Chipwahl(m.blockungsarten.map { it.code to (it.name ?: it.code) }, { it == art }, "Kategorie") {
                    art = it
                    kollisionen = null
                }
            }
            Column {
                Feldname("Grund (freiwillig)")
                Eingabe("z. B. nach Regen", "Grund der Sperrung, freiwillig", g, { grund = it })
            }
            Leise("Gesperrt wird ${Zeit.minutesToTime(stunde)}–${Zeit.minutesToTime(bis)} Uhr auf $platzName.")
            val n = kollisionen
            Nebenknopf(n?.let(PlaetzeLogik::verdraengenText) ?: "Sperren", gefahr = n != null, gesperrt = m.laeuft) {
                m.sperren(courtId, tag, stunde, bis, art, g, verdraengen = n != null) { kollisionen = it }
            }
            Nebenknopf("Doch nicht", klein = true) {
                grund = null
                kollisionen = null
            }
        }
    }
}

/** Ein Bereich unter einer Linie - Sperren und Umsetzen sind die Ausnahme. */
@Composable
private fun Abgesetzt(inhalt: @Composable ColumnScope.() -> Unit) {
    val f = TcmTheme.farben
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.fillMaxWidth().heightIn(min = 1.dp, max = 1.dp).background(f.line))
        Spacer(Modifier.size(6.dp))
        inhalt()
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
    var suchen by remember { mutableStateOf(false) }
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

    PlatzBlattKopf(
        kicker,
        "${Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))} – ${Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))}",
        schliessen,
    )

    Column(Modifier.padding(top = 0.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(v.untertitel, style = TcmSchrift.text(Schrift.gewichtHalbfett, 16.sp), color = f.ink)
        if (v.nurStorno && !v.serientermin) Platzplan.blockingLabel(b.title, b.typeName).grund?.let { Leise(it) }
        if (m.darfPlaetze && b.isOwn != true && !v.nurStorno) Leise("Du bearbeitest eine fremde Buchung mit Platzrechten.")
        if (v.laeuftSchon) Leise("Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.")
        Verwalten.suchtText(b)?.let {
            Text(it, style = TcmSchrift.text(Schrift.gewichtFett, Schrift.klein), color = f.goldInk)
        }
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
            suchen = suchen,
            aendern = { neueMitglieder, neueGaeste ->
                mitglieder = neueMitglieder
                gaeste = neueGaeste
            },
            suchenWechsel = { suchen = it },
        )
    }

    if (!v.nurStorno && !v.darfVerwalten) {
        Column {
            Feldname("Wer spielt mit?")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(bucher.kuerzel, bucher.name, gelb = bucher.gelb)
                for (p in b.players.orEmpty().filterNotNull()) Chip(Initialen.ausName(p), p)
                repeat(maxOf(b.frei ?: 0, 0)) { Chip("", "frei", leer = true) }
            }
        }
    }

    if (!v.nurStorno && v.darfVerwalten && ((b.frei ?: 0) > 0 || b.partnerWanted == true)) {
        GesuchtKarte(b.partnerWanted == true, deaktiviert = m.laeuft) { an -> m.ausschreiben(b.bookingId, an) }
    }

    if (bearbeitenOffen && v.kannSperreAendern) {
        SperreBearbeiten(m, b, tag) { bearbeitenOffen = false }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Beim Umsetzen steht der Fehler dort, wo getippt wurde.
            FehlerText(if (umsetzOffen) null else m.fensterFehler)

            if (v.kannSperreAendern && !stornoOffen) {
                Hauptknopf("Sperrung bearbeiten", gesperrt = m.laeuft) { bearbeitenOffen = true }
            }
            if (v.kannMitspielen) {
                Hauptknopf(if (m.laeuft) "Wird eingetragen …" else "Mitspielen", gesperrt = m.laeuft) { m.beitreten(b.bookingId) }
            }
            if (!v.nurStorno && v.darfVerwalten && geaendert) {
                Hauptknopf(if (m.laeuft) "Wird gespeichert …" else "Mitspieler speichern", gesperrt = m.laeuft) {
                    m.speichern(b.bookingId, mitglieder, gaeste)
                }
            }
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
            // Im zweiten Schritt steht "Abbrechen" daneben: zurueck, ohne das Blatt zu schliessen (U76).
            if (v.darfVerwalten) {
                // Bei grosser Schrift untereinander, sonst quetschen sich die Texte (ViewThatFits in iOS).
                NebeneinanderOderUntereinander { breite ->
                    if (stornoOffen) {
                        Nebenknopf("Abbrechen", breite, gesperrt = m.laeuft) {
                            stornoOffen = false
                            grund = ""
                        }
                    }
                    Nebenknopf(
                        v.stornoText(bestaetigen = stornoOffen),
                        breite,
                        gefahr = true,
                        gesperrt = m.laeuft || (stornoOffen && v.grundNoetig && grund.isBlank()),
                    ) {
                        when {
                            !stornoOffen -> {
                                stornoOffen = true
                                umsetzOffen = false
                            }
                            v.serientermin -> m.terminAbsagen(b.bookingId, grund)
                            v.nurStorno -> m.sperreAufheben(b.bookingId)
                            else -> m.stornieren(b.bookingId, grund)
                        }
                    }
                }
            }
            if (b.isOwn == true && !v.nurStorno && !v.laeuftSchon) Fussnote("Stornieren geht bis Spielbeginn")
        }
    }

    // Abgesetzt wie das Sperren: Umsetzen ist die Ausnahme, wenn ein Platz ausfaellt.
    if (v.kannUmsetzen) {
        Abgesetzt {
            if (umsetzOffen) {
                UmsetzBereich(m, b, tag, jetzt) { umsetzOffen = false }
            } else {
                Nebenknopf("Umsetzen", klein = true) {
                    umsetzOffen = true
                    stornoOffen = false
                }
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
private fun SperreBearbeiten(m: PlaetzeModell, sperre: TagesBelegung, tag: String, zurueck: () -> Unit) {
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

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column {
            Feldname("Plätze")
            Chipwahl(m.plaetze.map { it.id to (it.name ?: "") }, { it in plaetze }, "Plätze", mehrfach = true) { id ->
                plaetze = if (id in plaetze) plaetze - id else plaetze + id
                kollisionen = null
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Feldname("Zeit")
            Zeitschritt("Von", von, schritt, min = 0, max = bis - schritt) {
                von = it
                kollisionen = null
            }
            Zeitschritt("Bis", bis, schritt, min = von + schritt, max = 24 * 60) {
                bis = it
                kollisionen = null
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
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FehlerText(m.fensterFehler)
            val n = kollisionen
            if (n != null) {
                Leise(PlaetzeLogik.imWegText(n), Modifier.fillMaxWidth())
                Nebenknopf(PlaetzeLogik.verdraengenText(n), gefahr = true, gesperrt = m.laeuft) { speichern(true) }
            } else {
                Hauptknopf(if (m.laeuft) "Wird gespeichert …" else "Änderungen speichern", gesperrt = m.laeuft || plaetze.isEmpty()) {
                    speichern(false)
                }
            }
            Nebenknopf("Doch nicht", klein = true, aktion = zurueck)
        }
    }
}

/** Eine Uhrzeit mit Minus und Plus, im Raster des Plans. */
@Composable
private fun Zeitschritt(name: String, minute: Int, schritt: Int, min: Int, max: Int, wert: (Int) -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .background(f.surf2, RoundedCornerShape(18.dp))
            .padding(6.dp)
            .padding(start = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(name, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp), color = f.ink2, modifier = Modifier.weight(1f))
        Rundknopf("$name $schritt Minuten früher", aus = minute - schritt < min, hintergrund = f.surf3, aktion = { wert(minute - schritt) }) {
            Text("−", style = TcmSchrift.text(Schrift.gewichtFett, 20.sp), color = f.ink)
        }
        Text(
            Zeit.minutesToTime(minute),
            style = TcmSchrift.display(Schrift.gewichtFett, 20.sp).copy(fontFeatureSettings = "tnum"),
            color = f.ink,
            modifier = Modifier.widthIn(min = 64.dp).semantics { contentDescription = "$name ${Zeit.minutesToTime(minute)} Uhr" },
        )
        Rundknopf("$name $schritt Minuten später", aus = minute + schritt > max, hintergrund = f.surf3, aktion = { wert(minute + schritt) }) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = f.ink, modifier = Modifier.size(18.dp))
        }
    }
}

// ---- Umsetzen -----------------------------------------------------------------------------

/**
 * Wohin mit der Buchung? Platz, Tag und Beginn. Was waehlbar ist, rechnet
 * umsetzZiele aus der Belegung des Zieltags; fuer einen anderen Tag wird
 * day_schedule nachgeladen. Eine laufende Buchung wechselt nur den Platz.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UmsetzBereich(m: PlaetzeModell, b: TagesBelegung, planTag: String, jetzt: Instant, zurueck: () -> Unit) {
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

    if (laeuftSchon) {
        Leise("Die Buchung läuft schon – sie kann nur noch den Platz wechseln.")
    } else {
        Column {
            Feldname("Tag")
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
                Segmente(
                    "Platz",
                    m.plaetze.map { p -> Segment(p.id, p.shortName ?: p.name ?: "", p !in mitZiel) },
                    platz?.id ?: "",
                    { platzWahl = it },
                )
            }
            Column {
                Feldname("Beginn")
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.semantics { contentDescription = "Beginn" },
                ) {
                    for (z in zeiten) {
                        val aktiv = z == minute
                        Box(
                            Modifier
                                .widthIn(min = 64.dp)
                                .heightIn(min = 48.dp)
                                .clip(CircleShape)
                                .background(if (aktiv) f.gold else f.surf2)
                                .clickable(role = Role.RadioButton) { minuteWahl = z }
                                .semantics { selected = aktiv }
                                .padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                Zeit.minutesToTime(z),
                                style = TcmSchrift.text(Schrift.gewichtFett, 15.sp).copy(fontFeatureSettings = "tnum"),
                                color = if (aktiv) f.onGold else f.ink,
                            )
                        }
                    }
                }
            }
        }
    }

    Column {
        Feldname(if (grundNoetig) "Grund" else "Grund (freiwillig)")
        Eingabe("z. B. Platz 3 steht unter Wasser", "Grund fürs Umsetzen", grund, { grund = it })
    }

    if (platz != null && minute != null) {
        Leise(
            "Neu: ${platz.name ?: ""} · ${PlaetzeLogik.tagText(tag)} · ${Zeit.minutesToTime(minute)}–" +
                "${Zeit.minutesToTime(minute + dauer)} Uhr. Bucher und Mitspieler werden benachrichtigt.",
        )
    }

    FehlerText(m.fensterFehler)
    Nebenknopf(if (m.laeuft) "Wird umgesetzt …" else "Hierhin umsetzen", gesperrt = m.laeuft || !bereit) {
        if (platz != null && minute != null) m.umsetzen(b.bookingId, platz.id, tag, minute, grund)
    }
    Nebenknopf("Doch nicht", klein = true, aktion = zurueck)
}
