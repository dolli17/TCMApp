/*
 * Getraenke (apps/mobile/app/(tabs)/verein/(reiter)/getraenke.tsx), ein Reiter von "Verein"
 *
 * Wie Bildschirme/Verein/GetraenkeAnsicht.swift der iOS-App: oben der
 * laufende Monat, darunter die Karte als Kacheln mit Zaehler. Man sammelt,
 * was man genommen hat, und traegt es ueber die Leiste unten auf einmal ein.
 * Gebucht wird dabei je Artikel (record_drink_purchase), es gibt keinen
 * Sammelauftrag. Schlaegt einer fehl, sagt die Meldung welcher, und er bleibt
 * zum erneuten Versuch gewaehlt. Waehrend des Sendens ist die Karte gesperrt.
 *
 * "Zuletzt" zeigt die eigenen Entnahmen des Monats; zuruecknehmen geht nur im
 * Stornofenster (drink_void_window_minutes). Ein Takt alle 30 Sekunden blendet
 * den Knopf rechtzeitig aus - sonst tippt jemand nach zwanzig Minuten auf
 * etwas, das die Datenbank abweist.
 *
 * GetraenkeModell laedt und schreibt, GetraenkeSeite zeichnet nur - so
 * entstehen die Bildschirmfotos ohne Netz.
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.Kopfzeile
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.grosseSchrift
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Getraenk
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Vereinsdaten
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.EintragErgebnis
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Getraenke
import de.tcmuckensturm.kern.Getraenkekorb
import de.tcmuckensturm.kern.Startseite
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class GetraenkeInhalt(
    val karte: List<Getraenk>,
    val buchungen: List<EigenesGetraenk>,
    val stornoFenster: Int,
)

/** Was unter "Zuletzt" kurz hervorgehoben ist (U16). */
sealed interface Hervorhebung {
    fun trifft(id: String): Boolean

    /** alles, was es vor dem Eintragen nicht gab */
    data class Neu(val vorher: Set<String>) : Hervorhebung {
        override fun trifft(id: String) = id !in vorher
    }

    /** die eine zurueckgenommene Zeile */
    data class Eine(val id: String) : Hervorhebung {
        override fun trifft(id: String) = id == this.id
    }
}

data class GetraenkeStand(
    val inhalt: GetraenkeInhalt? = null,
    val fehler: String? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
    val laeuft: Boolean = false,
    val meldung: Meldungstext? = null,
    val markiert: Hervorhebung? = null,
)

/** Wie geladen wird: das erste Mal mit Ladekreis, per Ziehen mit Anzeige, sonst still. */
enum class Ladeart { ERSTES, NACHLADEN, STILL }

class GetraenkeModell(private val daten: Vereinsdaten, private val zustand: VereinZustand) : ViewModel() {
    var stand by mutableStateOf(GetraenkeStand())
        private set

    private var meldungAus: Job? = null
    private var markeAus: Job? = null

    init {
        laden(Ladeart.ERSTES)
    }

    fun laden(art: Ladeart) {
        viewModelScope.launch { ladenUndWarten(art) }
    }

    private suspend fun ladenUndWarten(art: Ladeart) {
        if (art == Ladeart.NACHLADEN) stand = stand.copy(aktualisiert = true)
        try {
            val neu = coroutineScope {
                val karte = async { daten.getraenkekarte() }
                val buchungen = async { daten.eigeneGetraenke() }
                val fenster = async { daten.stornoFenster() }
                launch { ladeName(daten, zustand) }
                GetraenkeInhalt(karte.await(), buchungen.await(), fenster.await())
            }
            zustand.karte = neu.karte
            stand = stand.copy(inhalt = neu, fehler = null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Still nachgeladen bleibt der alte Stand stehen; der Fehler steht oben.
            stand = stand.copy(fehler = Meldung.aus(e).text)
        }
        stand = stand.copy(laedt = false, aktualisiert = false)
    }

    fun aendern(id: String, um: Int) {
        // Waehrend des Sendens gesperrt: das Ergebnis setzt den Korb neu.
        if (stand.laeuft) return
        stand = stand.copy(meldung = null)
        zustand.korb = Getraenke.changeBasket(zustand.korb, id, um)
    }

    fun eintragen() {
        if (stand.laeuft) return
        val vorher = stand.inhalt?.buchungen.orEmpty().map { it.id }.toSet()
        val gewaehlt = Getraenke.basketSummary(zustand.karte, zustand.korb).lines
        stand = stand.copy(laeuft = true)
        viewModelScope.launch {
            val ergebnisse = mutableListOf<EintragErgebnis>()
            // Nacheinander, nicht parallel: die Meldung folgt der Reihenfolge der
            // Karte, und die Datenbank sieht keine gleichzeitigen Buchungen.
            for (a in gewaehlt) {
                val menge = zustand.korb[a.id] ?: 0
                val r = daten.bucheGetraenk(a.id, menge)
                ergebnisse += EintragErgebnis(a.id, a.name ?: "", menge, r.ok, if (r.ok) null else r.meldung)
            }
            val bericht = Getraenke.drinkBatchReport(ergebnisse)
            stand = stand.copy(laeuft = false)
            zeige(Meldungstext(bericht.ok, bericht.text))
            if (ergebnisse.any { it.ok }) markiere(Hervorhebung.Neu(vorher))
            // Was geklappt hat, verlaesst den Korb; was nicht, bleibt zum erneuten Versuch.
            zustand.korb = Getraenke.basketAfterBatch(ergebnisse)
            ladenUndWarten(Ladeart.STILL)
        }
    }

    fun zuruecknehmen(id: String) {
        if (stand.laeuft) return
        stand = stand.copy(laeuft = true)
        viewModelScope.launch {
            val r = daten.storniereGetraenk(id)
            stand = stand.copy(laeuft = false)
            zeige(Meldungstext(r.ok, r.meldung))
            if (r.ok) {
                markiere(Hervorhebung.Eine(id))
                ladenUndWarten(Ladeart.STILL)
            }
        }
    }

    /** Erfolg verschwindet nach ein paar Sekunden, ein Fehler bleibt, bis man ihn schliesst. */
    private fun zeige(m: Meldungstext) {
        meldungAus?.cancel()
        stand = stand.copy(meldung = m)
        if (m.ok) {
            meldungAus = viewModelScope.launch {
                delay(8_000)
                if (stand.meldung == m) stand = stand.copy(meldung = null)
            }
        }
    }

    fun meldungSchliessen() {
        meldungAus?.cancel()
        stand = stand.copy(meldung = null)
    }

    private fun markiere(h: Hervorhebung) {
        markeAus?.cancel()
        stand = stand.copy(markiert = h)
        markeAus = viewModelScope.launch {
            delay(5_000)
            stand = stand.copy(markiert = null)
        }
    }
}

/** Was die Seite bei einer Handlung aufruft. */
class GetraenkeAktionen(
    val nachladen: () -> Unit = {},
    val aendern: (String, Int) -> Unit = { _, _ -> },
    val eintragen: () -> Unit = {},
    val zuruecknehmen: (String) -> Unit = {},
    val meldungSchliessen: () -> Unit = {},
)

@Composable
fun GetraenkeAnsicht(kopf: @Composable () -> Unit) {
    val client = LocalSitzung.current.client
    val zustand = LocalVereinZustand.current
    val modell = viewModel { GetraenkeModell(Vereinsdaten(client), zustand) }
    // Zurueck auf den Reiter oder Tab: still nachladen, ohne Ladekreis.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (modell.stand.inhalt != null) modell.laden(Ladeart.STILL)
    }
    // Taktgeber fuer das Stornofenster
    var jetzt by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(modell.stand.inhalt) {
        jetzt = Instant.now()
        while (true) {
            delay(30_000)
            jetzt = Instant.now()
        }
    }
    GetraenkeSeite(
        stand = modell.stand,
        korb = zustand.korb,
        jetzt = jetzt,
        kopf = kopf,
        aktionen = GetraenkeAktionen(
            nachladen = { modell.laden(Ladeart.NACHLADEN) },
            aendern = modell::aendern,
            eintragen = modell::eintragen,
            zuruecknehmen = modell::zuruecknehmen,
            meldungSchliessen = modell::meldungSchliessen,
        ),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GetraenkeSeite(
    stand: GetraenkeStand,
    korb: Getraenkekorb,
    jetzt: Instant,
    kopf: @Composable () -> Unit,
    aktionen: GetraenkeAktionen,
) {
    val f = TcmTheme.farben
    val haptik = LocalHapticFeedback.current
    val inhalt = stand.inhalt
    val summe = Getraenke.basketSummary(inhalt?.karte.orEmpty(), korb)

    LaunchedEffect(stand.meldung) {
        val m = stand.meldung ?: return@LaunchedEffect
        haptik.performHapticFeedback(if (m.ok) HapticFeedbackType.Confirm else HapticFeedbackType.Reject)
    }

    Box(Modifier.fillMaxSize().background(f.bg)) {
        PullToRefreshBox(isRefreshing = stand.aktualisiert, onRefresh = aktionen.nachladen) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .statusBarsPadding()
                    .padding(horizontal = Abstand.rand)
                    // Platz fuer Leiste und Meldung unten
                    .padding(bottom = Abstand.abschnitt * 2 + if (summe.count > 0) 84.dp else 0.dp),
                verticalArrangement = Arrangement.spacedBy(Abstand.m),
            ) {
                kopf()
                stand.fehler?.let { Fehlerzeile(it, stand.aktualisiert, aktionen.nachladen) }
                if (stand.laedt && inhalt == null) {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = f.muted)
                    }
                } else if (inhalt != null) {
                    Monatskarte(inhalt.buchungen, jetzt)

                    Kopfzeile("Was nimmst du?")
                    Leise("Mit + sammelst du. Gebucht ist erst, was du unten einträgst.")
                    Karte(inhalt.karte, korb, stand.laeuft) { id, um ->
                        if (um > 0) haptik.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        aktionen.aendern(id, um)
                    }

                    Kopfzeile("Zuletzt")
                    Leise(VereinLogik.stornoHinweis(inhalt.stornoFenster))
                    if (inhalt.buchungen.isEmpty()) {
                        Leerzustand("Noch nichts entnommen.")
                    } else {
                        Zuletzt(inhalt.buchungen, inhalt.stornoFenster, jetzt, stand.laeuft, stand.markiert, aktionen.zuruecknehmen)
                    }
                }
            }
        }

        Column(
            Modifier.align(Alignment.BottomCenter).padding(horizontal = Abstand.m).padding(bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AnimatedVisibility(stand.meldung != null, enter = fadeIn(), exit = fadeOut()) {
                stand.meldung?.let { Meldungsleiste(it, aktionen.meldungSchliessen) }
            }
            AnimatedVisibility(
                summe.count > 0,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                Korbleiste(summe.count, summe.totalCents, stand.laeuft, aktionen.eintragen)
            }
        }
    }
}

// ---- Der laufende Monat ----------------------------------------------------------

@Composable
private fun Monatskarte(buchungen: List<EigenesGetraenk>, jetzt: Instant) {
    val f = TcmTheme.farben
    val summe = Geld.formatCents(Startseite.sumOpenDrinks(buchungen))
    val aktive = buchungen.count { it.voidedAt == null }
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.karteGross))
            .background(f.brand),
    ) {
        Platzlinien(Modifier.matchParentSize())
        Column(Modifier.padding(20.dp)) {
            Kicker(VereinLogik.monatKicker(jetzt), farbe = f.onBrand.copy(alpha = 0.85f))
            Text(
                summe,
                style = TcmSchrift.display(Schrift.gewichtFett, 44.sp),
                color = f.onBrand,
                modifier = Modifier.padding(top = 8.dp).semantics { contentDescription = "Summe diesen Monat: $summe" },
            )
            Text(
                VereinLogik.entnahmenText(aktive),
                style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp),
                color = f.onBrand.copy(alpha = 0.9f),
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

// ---- Die Karte -------------------------------------------------------------------

@Composable
private fun Karte(karte: List<Getraenk>, korb: Getraenkekorb, laeuft: Boolean, aendern: (String, Int) -> Unit) {
    // Bei grosser Schrift eine Kachel je Zeile.
    val spalten = if (grosseSchrift(1.5f)) 1 else 2
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (zeile in karte.chunked(spalten)) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (a in zeile) Kachel(a, korb[a.id] ?: 0, laeuft, aendern, Modifier.weight(1f))
                if (zeile.size < spalten) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Kachel(a: Getraenk, menge: Int, laeuft: Boolean, aendern: (String, Int) -> Unit, modifier: Modifier) {
    val f = TcmTheme.farben
    val name = a.name ?: ""
    val form = RoundedCornerShape(Radius.karte)
    Column(
        modifier
            .fillMaxSize()
            .heightIn(min = 124.dp)
            .clip(form)
            .background(f.surf)
            .border(if (menge > 0) 2.dp else 1.dp, if (menge > 0) f.goldLine else f.line, form)
            .padding(14.dp),
    ) {
        Text(name, style = TcmSchrift.text(Schrift.gewichtFett, 17.sp), color = f.ink)
        Text(VereinLogik.artikelZeile(a), style = TcmSchrift.text(Schrift.gewichtNormal, 13.5.sp), color = f.muted)
        Spacer(Modifier.weight(1f).heightIn(min = 10.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (menge > 0) {
                Zaehlknopf(plus = false, beschriftung = "$name: eins weniger", aus = laeuft) { aendern(a.id, -1) }
                Zaehlerstand(menge, "$menge gewählt, noch nicht eingetragen")
            }
            // Gelb erst, wenn schon etwas gesammelt ist (U43).
            Zaehlknopf(
                plus = true,
                beschriftung = "$name: eins mehr",
                gelb = menge > 0,
                aus = laeuft || menge >= Getraenke.MAX_MENGE,
            ) { aendern(a.id, 1) }
        }
    }
}

// ---- Zuletzt ---------------------------------------------------------------------

@Composable
private fun Zuletzt(
    buchungen: List<EigenesGetraenk>,
    fenster: Int,
    jetzt: Instant,
    laeuft: Boolean,
    markiert: Hervorhebung?,
    zuruecknehmen: (String) -> Unit,
) {
    val f = TcmTheme.farben
    Column(Modifier.fillMaxWidth().karte(padding = 0.dp)) {
        buchungen.forEachIndexed { i, b ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
            Entnahme(b, fenster, jetzt, laeuft, markiert?.trifft(b.id) == true, zuruecknehmen)
        }
    }
}

@Composable
private fun Entnahme(
    b: EigenesGetraenk,
    fenster: Int,
    jetzt: Instant,
    laeuft: Boolean,
    markiert: Boolean,
    zuruecknehmen: (String) -> Unit,
) {
    val f = TcmTheme.farben
    val zurueck = b.voidedAt != null
    val stornierbar = Getraenke.canVoidSelf(b.createdAt, b.voidedAt, fenster, jetzt)
    val grund by animateColorAsState(if (markiert) f.goldSoft else Color.Transparent, label = "markiert")
    val strich = if (zurueck) TextDecoration.LineThrough else null
    Row(
        Modifier
            .fillMaxWidth()
            .background(grund)
            .alpha(if (zurueck) 0.55f else 1f)
            .padding(vertical = 14.dp, horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                VereinLogik.entnahmeTitel(b),
                style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp).copy(textDecoration = strich),
                color = f.ink,
            )
            Text(VereinLogik.entnahmeZeile(b), style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein), color = f.muted)
        }
        if (stornierbar) {
            TextButton(
                onClick = { zuruecknehmen(b.id) },
                enabled = !laeuft,
                modifier = Modifier.heightIn(min = 44.dp).semantics { contentDescription = "${b.itemName ?: ""} zurücknehmen" },
            ) {
                Text("Zurücknehmen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = f.redInk.copy(alpha = if (laeuft) 0.5f else 1f))
            }
        }
        Text(
            Geld.formatCents(b.totalCents ?: 0),
            style = TcmSchrift.display(Schrift.gewichtFett, 17.sp).copy(textDecoration = strich),
            color = f.ink,
        )
    }
}

// ---- Eintragen-Leiste ------------------------------------------------------------

/** Unten ueber dem Inhalt: was im Korb liegt und "Eintragen". */
@Composable
private fun Korbleiste(stueck: Int, betrag: Int, laeuft: Boolean, eintragen: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(24.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .shadow(10.dp, form)
            .clip(form)
            .background(f.ink)
            .padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(VereinLogik.korbZeile(stueck, betrag), style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = f.bg)
            Text("Noch nicht eingetragen", style = TcmSchrift.text(Schrift.gewichtFett, 13.sp), color = f.bg)
        }
        Surface(
            onClick = eintragen,
            enabled = !laeuft,
            shape = RoundedCornerShape(18.dp),
            color = f.gold,
            modifier = Modifier.heightIn(min = 52.dp).alpha(if (laeuft) 0.6f else 1f),
        ) {
            Box(Modifier.padding(horizontal = 24.dp, vertical = 15.dp), contentAlignment = Alignment.Center) {
                Text(
                    if (laeuft) "Wird eingetragen …" else "Eintragen",
                    style = TcmSchrift.text(Schrift.gewichtExtrafett, 16.sp, 0.em),
                    color = f.onGold,
                )
            }
        }
    }
}
