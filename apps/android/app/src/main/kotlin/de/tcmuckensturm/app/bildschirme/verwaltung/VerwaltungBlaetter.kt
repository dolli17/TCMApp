/*
 * Die Blaetter der Verwaltung (apps/mobile/src/components/verwaltung/plaetze,
 * Bildschirme/Verwaltung/VerwaltungBlaetter.swift)
 *
 * Plaetze sperren, Serie anlegen und eine Serie aendern oder beenden. Alle
 * drei zweistufig wie im Web: erst zaehlen bzw. die Vorschau, dann fragen,
 * dann verdraengen. Wer danach etwas aendert, muss neu pruefen - sonst
 * gaelte eine alte Zahl. Scheitert eine Aktion, bleibt das Blatt offen und
 * der Grund der Datenbank steht ueber dem Knopf; klappt sie, schliesst es
 * und die Meldung steht auf der Seite.
 *
 * Uhrzeit und Datum werden getippt wie in iOS und Expo (HH:MM, TT.MM.JJJJ),
 * mit einer Tastatur, die Punkt und Doppelpunkt hat.
 */

package de.tcmuckensturm.app.bildschirme.verwaltung

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.konto.BlattKopf
import de.tcmuckensturm.app.bildschirme.konto.KontoFeld
import de.tcmuckensturm.app.bildschirme.konto.KontoGruppe
import de.tcmuckensturm.app.bildschirme.konto.KontoHinweis
import de.tcmuckensturm.app.bildschirme.konto.KontoVerweis
import de.tcmuckensturm.app.bildschirme.konto.LeiserKnopf
import de.tcmuckensturm.app.bildschirme.plaetze.Chipwahl
import de.tcmuckensturm.app.bildschirme.plaetze.Feldname
import de.tcmuckensturm.app.bildschirme.plaetze.Hauptknopf
import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.app.daten.PlatzErgebnis
import de.tcmuckensturm.app.daten.Serie
import de.tcmuckensturm.app.daten.SerienTermin
import de.tcmuckensturm.app.daten.VerwaltungsStand
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Zeit
import kotlinx.coroutines.launch

/** Das Blatt als Bottom Sheet, ganz aufgezogen; die Zurueck-Geste schliesst es. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerwaltungBlattFenster(m: VerwaltungModell, blatt: VerwaltungBlatt) {
    val f = TcmTheme.farben
    val zustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    // Erst zuschieben, dann entfernen - sonst springt das Blatt weg.
    val schliessen: () -> Unit = { scope.launch { zustand.hide() }.invokeOnCompletion { m.blatt = null } }
    ModalBottomSheet(
        onDismissRequest = { m.blatt = null },
        sheetState = zustand,
        containerColor = f.bg,
        shape = RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt),
        dragHandle = { BottomSheetDefaults.DragHandle(color = f.line2) },
    ) {
        VerwaltungBlattInhalt(m, blatt, schliessen)
    }
}

/** Der Inhalt eines Blatts, ohne das Sheet drumherum (auch fuer die Screenshot-Tests). */
@Composable
fun VerwaltungBlattInhalt(m: VerwaltungModell, blatt: VerwaltungBlatt, zu: () -> Unit) {
    val s = m.stand ?: return
    when (blatt) {
        VerwaltungBlatt.Sperren -> SperrenBlatt(m, s, zu)
        VerwaltungBlatt.SerieAnlegen -> SerieAnlegenBlatt(m, s, zu)
        is VerwaltungBlatt.SerieAendern -> SerieBlatt(m, blatt.serie, zu)
    }
}

// ---- Bausteine --------------------------------------------------------------------------

/** Rahmen eines Blatts: Kopf, Unterzeile, Inhalt zum Rollen; die Tastatur schiebt mit. */
@Composable
private fun BlattRahmen(titel: String, unterzeile: String? = null, zu: () -> Unit, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(TcmTheme.farben.bg)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(start = Abstand.rand, end = Abstand.rand, bottom = 32.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        BlattKopf(titel, zu)
        if (unterzeile != null) {
            Text(unterzeile, style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp), color = TcmTheme.farben.ink2)
        }
        inhalt()
    }
}

/** Uhrzeit oder Datum: Text mit Punkt und Doppelpunkt, ohne Grossschreibung. */
@Composable
private fun ZeitFeld(label: String, wert: String, aendern: (String) -> Unit, modifier: Modifier = Modifier) {
    KontoFeld(label, wert, aendern, modifier, tastatur = KeyboardType.Text, gross = KeyboardCapitalization.None)
}

/** Chips mit Beschriftung darueber (Chipwahl in Formular.tsx). */
@Composable
private fun Chips(label: String, optionen: List<Pair<String, String>>, gewaehlt: (String) -> Boolean, wahl: (String) -> Unit) {
    Column {
        Feldname(label)
        Chipwahl(optionen, gewaehlt, wahl)
    }
}

/** Die Folgen vor dem Bestaetigen: was im Weg liegt (Folgen in Formular.tsx). */
@Composable
private fun Folgen(text: String, zeilen: List<String> = emptyList()) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .background(f.goldSoft, form)
            .border(1.dp, f.goldLine, form)
            .padding(14.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = f.ink)
        for (z in zeilen) {
            Text(z, style = TcmSchrift.text(Schrift.gewichtNormal, 13.5.sp).copy(fontFeatureSettings = "tnum"), color = f.ink)
        }
    }
}

/** Rot als Flaeche mit weisser Schrift: Verdraengen und Beenden. */
@Composable
private fun GefahrKnopf(text: String, modifier: Modifier = Modifier, gesperrt: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .alpha(if (gesperrt) 0.6f else 1f)
            .clip(RoundedCornerShape(16.dp))
            .background(f.red)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = aktion)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtExtrafett, 16.sp), color = f.onBrand, textAlign = TextAlign.Center)
    }
}

/** Der Tag von heute in Berlin, deutsch geschrieben. */
private fun heute(m: VerwaltungModell): String = VerwaltungLogik.isoZuDeutsch(Zeit.berlinDay(m.jetzt))

// ---- Plaetze sperren --------------------------------------------------------------------

private const val ALLE = "__alle"

@Composable
private fun SperrenBlatt(m: VerwaltungModell, stand: VerwaltungsStand, zu: () -> Unit) {
    val scope = rememberCoroutineScope()
    val plaetze = stand.aktivePlaetze
    var gewaehlt by remember { mutableStateOf(listOf<String>()) }
    // Vorgabe aus den Einstellungen, nicht fest eingetippt.
    var tag by rememberSaveable { mutableStateOf(heute(m)) }
    var von by rememberSaveable { mutableStateOf(stand.oeffnung) }
    var bis by rememberSaveable { mutableStateOf(stand.schluss) }
    var art by rememberSaveable { mutableStateOf(stand.blockungsarten.firstOrNull()?.code ?: "platzpflege") }
    var grund by rememberSaveable { mutableStateOf("") }
    var kollisionen by remember { mutableStateOf<Int?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    var laeuft by remember { mutableStateOf(false) }
    val alleGewaehlt = plaetze.isNotEmpty() && gewaehlt.size == plaetze.size

    // Jede Aenderung macht eine alte Kollisionszahl ungueltig.
    fun geaendert(setze: () -> Unit) {
        setze()
        kollisionen = null
    }

    fun absenden(verdraengen: Boolean) {
        if (laeuft) return
        laeuft = true
        scope.launch {
            val e = m.quelle.sperre(gewaehlt, tag, von, bis, art, grund, verdraengen)
            laeuft = false
            if (e.ok) {
                m.erledigt(e)
            } else {
                kollisionen = e.kollisionen
                fehler = if (e.kollisionen == null) e.meldung else null
            }
        }
    }

    BlattRahmen(
        titel = "Plätze sperren",
        unterzeile = "Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt.",
        zu = zu,
    ) {
        Chips(
            label = "Plätze",
            optionen = plaetze.map { it.id to VerwaltungLogik.platzChip(it.shortName) } + (ALLE to if (alleGewaehlt) "Keinen" else "Alle"),
            gewaehlt = { if (it == ALLE) alleGewaehlt else it in gewaehlt },
        ) { id ->
            geaendert {
                gewaehlt = when {
                    id == ALLE -> if (alleGewaehlt) emptyList() else plaetze.map { it.id }
                    id in gewaehlt -> gewaehlt - id
                    else -> gewaehlt + id
                }
            }
        }
        ZeitFeld("Tag (TT.MM.JJJJ)", tag, { geaendert { tag = it } })
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ZeitFeld("Von (HH:MM)", von, { geaendert { von = it } }, Modifier.weight(1f))
            ZeitFeld("Bis (HH:MM)", bis, { geaendert { bis = it } }, Modifier.weight(1f))
        }
        Chips("Kategorie", stand.blockungsarten.map { it.code to (it.name ?: it.code) }, { it == art }) {
            geaendert { art = it }
        }
        KontoFeld("Grund (freiwillig)", grund, { grund = it })

        fehler?.let { KontoHinweis(it) }
        val k = kollisionen
        if (k != null) {
            Folgen(PlaetzeLogik.imWegText(k))
            GefahrKnopf(PlaetzeLogik.verdraengenText(k), gesperrt = laeuft) { absenden(verdraengen = true) }
            LeiserKnopf("Doch nicht") { kollisionen = null }
        } else {
            Hauptknopf(
                if (laeuft) "Wird gesperrt…" else "Sperren",
                // Der Grund ist freiwillig; was die Sperrung ist, sagt die Art.
                gesperrt = laeuft || gewaehlt.isEmpty() || tag.isBlank(),
            ) { absenden(verdraengen = false) }
        }
    }
}

// ---- Serie anlegen ----------------------------------------------------------------------

@Composable
private fun SerieAnlegenBlatt(m: VerwaltungModell, stand: VerwaltungsStand, zu: () -> Unit) {
    val scope = rememberCoroutineScope()
    var form by remember {
        val heute = heute(m)
        mutableStateOf(
            SerienEingabe(
                courtId = stand.aktivePlaetze.firstOrNull()?.id ?: "",
                bookingTypeCode = stand.blockungsarten.firstOrNull()?.code ?: "training",
                weekday = 2,
                startTime = "18:30",
                endTime = "20:00",
                validFrom = heute,
                validTo = heute,
                title = "",
            ),
        )
    }
    var vorschau by remember { mutableStateOf<List<SerienTermin>?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    var laeuft by remember { mutableStateOf(false) }
    val kollisionen = vorschau.orEmpty().filter { it.conflictBookingId != null }

    // Jede Aenderung macht die Vorschau ungueltig.
    fun setze(neu: SerienEingabe) {
        form = neu
        vorschau = null
    }

    fun pruefen() {
        if (laeuft) return
        laeuft = true
        scope.launch {
            m.quelle.vorschau(form)
                .onSuccess {
                    vorschau = it
                    fehler = null
                }
                .onFailure { fehler = it.message }
            laeuft = false
        }
    }

    fun anlegen(verdraengen: Boolean) {
        if (laeuft) return
        laeuft = true
        scope.launch {
            val e = m.quelle.legeSerieAn(form, verdraengen)
            laeuft = false
            if (e.ok) m.erledigt(e) else fehler = e.meldung
        }
    }

    BlattRahmen(titel = "Serie anlegen", zu = zu) {
        KontoFeld("Titel", form.title, { setze(form.copy(title = it)) })
        Chips("Art", stand.blockungsarten.map { it.code to (it.name ?: it.code) }, { it == form.bookingTypeCode }) {
            setze(form.copy(bookingTypeCode = it))
        }
        Chips(
            "Wochentag",
            VerwaltungLogik.wochentagWahl.map { (wert, label) -> wert.toString() to label },
            { it == form.weekday.toString() },
        ) { setze(form.copy(weekday = it.toInt())) }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ZeitFeld("Von (HH:MM)", form.startTime, { setze(form.copy(startTime = it)) }, Modifier.weight(1f))
            ZeitFeld("Bis (HH:MM)", form.endTime, { setze(form.copy(endTime = it)) }, Modifier.weight(1f))
        }
        Chips("Platz", stand.aktivePlaetze.map { it.id to VerwaltungLogik.platzOhneWort(it.name) }, { it == form.courtId }) {
            setze(form.copy(courtId = it))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ZeitFeld("Ab (TT.MM.JJJJ)", form.validFrom, { setze(form.copy(validFrom = it)) }, Modifier.weight(1f))
            ZeitFeld("Bis (TT.MM.JJJJ)", form.validTo, { setze(form.copy(validTo = it)) }, Modifier.weight(1f))
        }

        fehler?.let { KontoHinweis(it) }
        val v = vorschau
        if (v != null) {
            Folgen(
                VerwaltungLogik.vorschauText(v.size, kollisionen.size),
                kollisionen.map { VerwaltungLogik.kollisionsZeile(it.startsAt, it.conflictMemberName, it.conflictKind) },
            )
            Hauptknopf(
                if (laeuft) "Wird angelegt…" else VerwaltungLogik.anlegenText(v.size, kollisionen.size),
                gesperrt = laeuft,
            ) { anlegen(verdraengen = kollisionen.isNotEmpty()) }
        } else {
            Hauptknopf(
                if (laeuft) "Wird geprüft…" else "Vorschau",
                gesperrt = laeuft || form.title.isBlank(),
            ) { pruefen() }
        }
    }
}

// ---- Serie aendern oder beenden ---------------------------------------------------------

/**
 * Platz und Wochentag lassen sich nicht aendern: wer die aendert, meint
 * eine andere Serie und legt sie besser neu an.
 */
@Composable
private fun SerieBlatt(m: VerwaltungModell, serie: Serie, zu: () -> Unit) {
    val scope = rememberCoroutineScope()
    var von by rememberSaveable(serie.id) { mutableStateOf((serie.startTime ?: "").take(5)) }
    var bis by rememberSaveable(serie.id) { mutableStateOf((serie.endTime ?: "").take(5)) }
    var titel by rememberSaveable(serie.id) { mutableStateOf(serie.title ?: "") }
    var ende by rememberSaveable(serie.id) { mutableStateOf(VerwaltungLogik.isoZuDeutsch(serie.validTo)) }
    var kollisionen by remember { mutableStateOf<Int?>(null) }
    var beendenFrage by remember { mutableStateOf(false) }
    var fehler by remember { mutableStateOf<String?>(null) }
    var laeuft by remember { mutableStateOf(false) }

    fun ausfuehren(aufruf: suspend () -> PlatzErgebnis, mitKollisionen: Boolean) {
        if (laeuft) return
        laeuft = true
        scope.launch {
            val e = aufruf()
            laeuft = false
            when {
                e.ok -> m.erledigt(e)
                mitKollisionen -> {
                    kollisionen = e.kollisionen
                    fehler = if (e.kollisionen == null) e.meldung else null
                }
                else -> fehler = e.meldung
            }
        }
    }

    fun speichern(verdraengen: Boolean) =
        ausfuehren({ m.quelle.aendereSerie(serie.id, von, bis, titel, ende, verdraengen) }, mitKollisionen = true)

    BlattRahmen(
        titel = serie.title ?: "Serie",
        unterzeile = VerwaltungLogik.serienUnterzeile(serie.courtName, serie.weekday, serie.typeName),
        zu = zu,
    ) {
        Text(
            "Vergangene Termine bleiben stehen. Geändert wird ab heute: die künftigen werden abgesagt und in der neuen Lage neu angelegt.",
            style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
            color = TcmTheme.farben.muted,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ZeitFeld("Von (HH:MM)", von, { von = it }, Modifier.weight(1f))
            ZeitFeld("Bis (HH:MM)", bis, { bis = it }, Modifier.weight(1f))
        }
        ZeitFeld("Läuft bis (TT.MM.JJJJ)", ende, { ende = it })
        KontoFeld("Titel", titel, { titel = it })

        fehler?.let { KontoHinweis(it) }
        val k = kollisionen
        if (k != null) {
            Folgen(PlaetzeLogik.imWegText(k))
            GefahrKnopf(PlaetzeLogik.verdraengenText(k), gesperrt = laeuft) { speichern(verdraengen = true) }
        } else {
            Hauptknopf(
                if (laeuft) "Wird gespeichert…" else "Änderung speichern",
                gesperrt = laeuft || titel.isBlank(),
            ) { speichern(verdraengen = false) }
        }
        LeiserKnopf("Abbrechen", aktion = zu)

        // Zerstoerendes am Ende, mit Rueckfrage im Blatt (Regel 4).
        KontoGruppe(Modifier.padding(top = Abstand.s)) {
            if (beendenFrage) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GefahrKnopf("${serie.kuenftige ?: 0} Termine absagen", Modifier.weight(1f), gesperrt = laeuft) {
                        ausfuehren({ m.quelle.beendeSerie(serie.id) }, mitKollisionen = false)
                    }
                    Box(Modifier.weight(1f)) { LeiserKnopf("Doch nicht") { beendenFrage = false } }
                }
            } else {
                KontoVerweis("Serie beenden", rot = true) { beendenFrage = true }
            }
        }
    }
}
