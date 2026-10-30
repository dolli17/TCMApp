/*
 * Home - der Startbildschirm (apps/mobile/app/(tabs)/home.tsx)
 *
 * Wie HomeBildschirm.swift der iOS-App. Was heute zaehlt, auf einen Blick:
 * die eigenen naechsten Termine, drei Schnellaktionen, welche Plaetze gerade
 * frei sind, wer Mitspieler sucht, der laufende Monat und die letzten
 * Neuigkeiten. Nur Lesen - gebucht und eingetragen wird auf den
 * Bildschirmen, auf die die Knoepfe fuehren (bis es sie nativ gibt: der
 * passende Tab).
 *
 * Alle Abschnitte laden parallel und jeder fuer sich: schlaegt einer fehl,
 * steht dort der Fehler, und der Rest bleibt gefuellt. Der Inhalt liegt in
 * einem ViewModel und ueberlebt so Tabwechsel und den Weg zu den Neuigkeiten;
 * zurueck auf Home wird still nachgeladen, ohne Ladekreis.
 */

package de.tcmuckensturm.app.bildschirme.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircle
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Avatar
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.Handlung
import de.tcmuckensturm.app.bildschirme.Kapsel
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.KopfLink
import de.tcmuckensturm.app.bildschirme.Kopfzeile
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.bildschirme.MiniZeitleiste
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.leise
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.bildschirme.nachrichten.NachrichtZeile
import de.tcmuckensturm.app.bildschirme.nachrichten.Trennlinie
import de.tcmuckensturm.app.bildschirme.tippbar
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.OffenesSpiel
import de.tcmuckensturm.app.daten.Startdaten
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ---- Zustand ------------------------------------------------------------------

data class HomeZustand(
    val inhalt: HomeInhalt? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
)

class HomeModell(private val daten: Startdaten) : ViewModel() {
    private val _zustand = MutableStateFlow(HomeZustand())
    val zustand: StateFlow<HomeZustand> = _zustand.asStateFlow()

    init {
        laden(nachladen = false)
    }

    /** `nachladen`: von Hand (Herunterziehen, "Erneut versuchen") - mit Kreis. Sonst still. */
    fun laden(nachladen: Boolean) {
        if (nachladen) _zustand.value = _zustand.value.copy(aktualisiert = true)
        viewModelScope.launch {
            val neu = lade(daten)
            // TODO (Widget-Spur): Schnappschuss fuer das Widget ablegen, wie WidgetBruecke.ablegen.
            _zustand.value = HomeZustand(inhalt = neu, laedt = false, aktualisiert = false)
        }
    }

    companion object {
        suspend fun lade(d: Startdaten, jetzt: Instant = Instant.now()): HomeInhalt = coroutineScope {
            val heute = Zeit.berlinDay(jetzt)
            val name = async { Abschnitt.von { d.meinName() } }
            val meine = async { Abschnitt.von { d.meineBuchungen() } }
            val plaetze = async { Abschnitt.von { d.plaetze() } }
            val plan = async { Abschnitt.von { d.tagesplan(heute) } }
            val einstellungen = async { Abschnitt.von { d.buchungseinstellungen() } }
            val arten = async { Abschnitt.von { d.buchungsarten() } }
            val offen = async { Abschnitt.von { d.offeneSpiele() } }
            val getraenke = async { Abschnitt.von { d.eigeneGetraenke() } }
            val dienst = async { Abschnitt.von { d.arbeitsdienst() } }
            // Drei Benachrichtigungen reichen: ungelesen zuerst, dann die neuesten.
            val neues = async { Abschnitt.von { d.benachrichtigungen(limit = 3) } }

            val p = plaetze.await()
            val t = plan.await()
            val e = einstellungen.await()
            val a = arten.await()
            // "Jetzt frei" braucht vier Quellen; fehlt eine, fehlt der Abschnitt.
            val pw = p.wert
            val tw = t.wert
            val aw = a.wert
            val frei: Abschnitt<FreiDaten> = if (pw != null && tw != null && e is Abschnitt.Wert && aw != null) {
                Abschnitt.Wert(FreiDaten(heute, pw, tw, e.wert, aw.firstOrNull()?.durationMinutes ?: 60))
            } else {
                Abschnitt.Fehler(p.fehler ?: t.fehler ?: e.fehler ?: a.fehler ?: "Konnte nicht geladen werden.")
            }

            HomeInhalt(
                name = name.await().wert,
                termine = meine.await(),
                frei = frei,
                offen = offen.await(),
                getraenke = getraenke.await(),
                dienst = dienst.await(),
                neues = neues.await(),
            )
        }
    }
}

// ---- Bildschirm ---------------------------------------------------------------

@Composable
fun HomeBildschirm(zuNachrichten: () -> Unit) {
    // Vorschau und Bildschirmfotos (etwa die Tabs) haben keine Sitzung: nur der Kopf, ohne Netz.
    if (LocalInspectionMode.current) {
        val ziele = HomeZiele({}, {}, {}, zuNachrichten)
        HomeAnsicht(HomeZustand(), ziele, nachladen = {}, glocke = { GlockeKnopf(0) {} })
        return
    }
    val client = LocalSitzung.current.client
    val zuTab = LocalZuTab.current
    val modell = viewModel { HomeModell(Startdaten(client)) }
    val zustand by modell.zustand.collectAsStateWithLifecycle()

    // Zurueck auf Home (Tab oder Neuigkeiten): still nachladen, ohne Ladekreis.
    LaunchedEffect(Unit) { if (zustand.inhalt != null) modell.laden(nachladen = false) }

    HomeAnsicht(
        zustand = zustand,
        ziele = HomeZiele(
            zuTab = zuTab,
            // TODO (Verein-Spur): Getraenke und Veranstaltung direkt, sobald der Verein-Graph Ziele dafuer hat.
            zuGetraenken = { zuTab(HauptTab.VEREIN) },
            zuVeranstaltung = { zuTab(HauptTab.VEREIN) },
            zuNachrichten = zuNachrichten,
        ),
        nachladen = { modell.laden(nachladen = true) },
        glocke = { Glocke(zuVeranstaltung = { zuTab(HauptTab.VEREIN) }) },
    )
}

/** Wohin die Knoepfe auf Home fuehren. */
data class HomeZiele(
    val zuTab: (HauptTab) -> Unit,
    val zuGetraenken: () -> Unit,
    val zuVeranstaltung: (String) -> Unit,
    val zuNachrichten: () -> Unit,
)

/** Ohne Sitzung und Netz - fuer die Bildschirmfotos. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeAnsicht(
    zustand: HomeZustand,
    ziele: HomeZiele,
    nachladen: () -> Unit,
    jetzt: Instant = Instant.now(),
    glocke: @Composable () -> Unit,
) {
    val f = TcmTheme.farben
    val d = zustand.inhalt
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
                .padding(bottom = Abstand.abschnitt * 2),
            verticalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            GrosserKopf(titel = HomeLogik.titel(d?.name?.vorname), kicker = HomeLogik.kicker(jetzt)) {
                glocke()
                Avatar(HomeLogik.initialen(d?.name)) { ziele.zuTab(HauptTab.KONTO) }
            }
            when {
                d == null && zustand.laedt -> Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = f.muted)
                }
                d != null -> {
                    val erneut = Erneut(zustand.aktualisiert, nachladen)
                    AlsNaechstes(d.termine, erneut, ziele, jetzt)
                    Schnellaktionen(ziele)
                    JetztFrei(d.frei, erneut, ziele, jetzt)
                    OffeneSpiele(d.offen, erneut, ziele, jetzt)
                    // "Demnaechst im Verein" folgt mit den Veranstaltungen (Verein-Spur).
                    DeinStandKacheln(HomeLogik.deinStand(d.getraenke, d.dienst, jetzt), ziele)
                    Neuigkeiten(d.neues, erneut, ziele, jetzt)
                }
                else -> Text("Die Startseite konnte nicht geladen werden.", style = leise, color = f.muted)
            }
        }
    }
}

/** Was ein Abschnitt braucht, um nach einem Fehler neu zu laden. */
private data class Erneut(val laeuft: Boolean, val aktion: () -> Unit)

/** Waagerecht wischbar, bis an den Bildschirmrand - der Inhalt hat 20 Rand. */
@Composable
private fun <T> Wischreihe(
    eintraege: List<T>,
    abstand: Int = 12,
    schluessel: (T) -> Any,
    inhalt: @Composable (Int, T) -> Unit,
) {
    LazyRow(
        Modifier
            .fillMaxWidth()
            .layoutOhneRand(),
        contentPadding = PaddingValues(horizontal = Abstand.rand, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(abstand.dp),
    ) {
        itemsIndexed(eintraege, key = { _, e -> schluessel(e) }) { i, e -> inhalt(i, e) }
    }
}

/** Zieht eine Reihe ueber den Seitenrand der Spalte hinaus (wie padding(-rand) in SwiftUI). */
private fun Modifier.layoutOhneRand(): Modifier = layout { messbar, grenzen ->
    val rand = Abstand.rand.roundToPx()
    val breite = grenzen.maxWidth + 2 * rand
    val platziert = messbar.measure(grenzen.copy(minWidth = breite, maxWidth = breite))
    layout(grenzen.maxWidth, platziert.height) { platziert.place(-rand, 0) }
}

// ---- Als Naechstes ------------------------------------------------------------

@Composable
private fun AlsNaechstes(termine: Abschnitt<List<MeineBuchung>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val kommende = Startseite.upcomingBookings(termine.wert.orEmpty(), jetzt)
    val zuPlaetzen = { ziele.zuTab(HauptTab.PLAETZE) }
    Kopfzeile("Als Nächstes", if (kommende.isEmpty()) null else KopfLink("Alle", "Alle Termine", zuPlaetzen))
    termine.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (termine.wert != null && kommende.isEmpty()) {
        // Sekundaer: die gelbe Kachel "Platz buchen" steht direkt darunter (U43).
        Leerzustand(
            titel = "Noch nichts geplant",
            text = "Such dir einen Platz – heute ist noch einiges frei.",
            handlung = Handlung("Platz buchen", zuPlaetzen),
        )
    }
    if (kommende.isNotEmpty()) {
        Wischreihe(kommende, schluessel = { it.bookingId }) { i, t ->
            TerminKarte(t, erste = i == 0, jetzt = jetzt, aktion = zuPlaetzen)
        }
    }
}

@Composable
private fun TerminKarte(t: MeineBuchung, erste: Boolean, jetzt: Instant, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val tinte = if (erste) f.onBrand else f.ink
    val form = RoundedCornerShape(Radius.karteGross)
    val bildschirm = LocalConfiguration.current.screenWidthDp.dp
    val breite = minOf(318.dp, bildschirm - Abstand.rand * 2 - 32.dp)
    Box(
        Modifier
            .width(breite)
            .heightIn(min = 216.dp)
            .clip(form)
            .background(if (erste) f.brand else f.surf)
            .then(if (erste) Modifier else Modifier.border(1.dp, f.line, form))
            .tippbar(HomeLogik.terminLabel(t, jetzt), aktion = aktion),
    ) {
        if (erste) {
            // Platzlinien in Perspektive, dezent, und der Ball
            Canvas(Modifier.matchParentSize()) {
                val b = size.width
                val h = size.height
                val linie = f.onBrand.copy(alpha = 0.13f)
                val dicke = 2.dp.toPx()
                drawLine(linie, Offset(b * 0.47f, h), Offset(b * 0.66f, 0f), dicke)
                drawLine(linie, Offset(b, 60.dp.toPx()), Offset(b * 0.6f, h), dicke)
                drawLine(linie, Offset(b * 0.57f, 100.dp.toPx()), Offset(b, 100.dp.toPx()), dicke)
                drawLine(linie, Offset(b * 0.63f, 40.dp.toPx()), Offset(b, 40.dp.toPx()), dicke)
                drawCircle(f.gold, 13.dp.toPx(), Offset(b - 33.dp.toPx(), 33.dp.toPx()))
            }
        }
        Column(
            Modifier
                .padding(20.dp)
                .heightIn(min = 216.dp - 40.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.padding(bottom = 16.dp)) {
                Kicker(
                    Startseite.bookingKicker(t.startsAt, t.endsAt, jetzt),
                    Modifier.padding(end = if (erste) 40.dp else 0.dp),
                    farbe = if (erste) f.onBrand.copy(alpha = 0.85f) else f.muted,
                )
                Text(
                    HomeLogik.zeitSpanne(t),
                    style = TcmSchrift.display(Schrift.gewichtFett, Schrift.hero),
                    color = tinte,
                    maxLines = 1,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    "${t.courtName ?: ""} · ${t.typeName ?: ""}",
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, 16.sp),
                    color = tinte.copy(alpha = if (erste) 0.92f else 1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    HomeLogik.mitText(t),
                    style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp),
                    color = if (erste) f.onBrand.copy(alpha = 0.9f) else f.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    Modifier
                        .heightIn(min = 40.dp)
                        .clip(Kapsel)
                        .background(if (erste) f.onBrand.copy(alpha = 0.18f) else f.surf2)
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Details", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = tinte)
                }
            }
        }
    }
}

// ---- Schnellaktionen ----------------------------------------------------------

private data class Kachel(val text: String, val symbol: ImageVector, val aktion: () -> Unit, val gelb: Boolean = false)

@Composable
private fun Schnellaktionen(ziele: HomeZiele) {
    val f = TcmTheme.farben
    val kacheln = listOf(
        Kachel("Platz buchen", Icons.Outlined.DateRange, { ziele.zuTab(HauptTab.PLAETZE) }, gelb = true),
        Kachel("Getränk eintragen", Icons.Outlined.ShoppingCart, ziele.zuGetraenken),
        Kachel("Mitspielen", Icons.Outlined.AddCircle, { ziele.zuTab(HauptTab.PLAETZE) }),
    )
    // Bei grosser Schrift untereinander, Symbol neben dem Text (U5).
    val gestapelt = LocalDensity.current.fontScale >= 1.3f

    @Composable
    fun KachelInhalt(k: Kachel, modifier: Modifier) {
        val tinte = if (k.gelb) f.onGold else f.ink
        val form = RoundedCornerShape(Radius.karte)
        val symbol = @Composable { Icon(k.symbol, contentDescription = null, tint = tinte, modifier = Modifier.size(22.dp)) }
        val text = @Composable { Text(k.text, style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = tinte) }
        val basis = modifier
            .clip(form)
            .background(if (k.gelb) f.gold else f.surf)
            .then(if (k.gelb) Modifier else Modifier.border(1.dp, f.line, form))
            .tippbar(k.text, aktion = k.aktion)
            .padding(14.dp)
        if (gestapelt) {
            Row(
                basis.heightIn(min = 56.dp - 28.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                symbol()
                text()
            }
        } else {
            Column(basis.heightIn(min = 96.dp - 28.dp), verticalArrangement = Arrangement.SpaceBetween) {
                symbol()
                Spacer(Modifier.height(8.dp))
                text()
            }
        }
    }

    if (gestapelt) {
        Column(Modifier.padding(top = Abstand.s), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (k in kacheln) KachelInhalt(k, Modifier.fillMaxWidth())
        }
    } else {
        Row(
            Modifier
                .padding(top = Abstand.s)
                .height(IntrinsicSize.Max),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            for (k in kacheln) KachelInhalt(k, Modifier.weight(1f).fillMaxHeight())
        }
    }
}

// ---- Jetzt frei ---------------------------------------------------------------

@Composable
private fun JetztFrei(frei: Abschnitt<FreiDaten>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    val karten = frei.wert?.let { HomeLogik.jetztFreiKarten(it, jetzt) }.orEmpty()
    val zuPlaetzen = { ziele.zuTab(HauptTab.PLAETZE) }
    Kopfzeile("Jetzt frei", KopfLink("Alle Plätze", aktion = zuPlaetzen))
    frei.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (frei.wert != null && karten.isEmpty()) {
        Leerzustand("Gerade ist kein Platz frei.", handlung = Handlung("Belegung ansehen", zuPlaetzen))
    }
    if (karten.isNotEmpty()) {
        Wischreihe(karten, abstand = 10, schluessel = { it.id }) { _, k ->
            Column(
                Modifier
                    .width(150.dp)
                    .karte(radius = Radius.karte, padding = 0.dp)
                    .tippbar("${k.name}, frei bis ${k.bis}, buchen", aktion = zuPlaetzen)
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        k.name,
                        style = TcmSchrift.display(Schrift.gewichtFett, 20.sp),
                        color = f.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Box(
                        Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(f.green),
                    )
                }
                Text("frei bis ${k.bis}", style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp), color = f.greenInk)
                MiniZeitleiste(k.segmente, k.jetzt)
            }
        }
    }
}

// ---- Offene Spiele ------------------------------------------------------------

@Composable
private fun OffeneSpiele(offen: Abschnitt<List<OffenesSpiel>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    val liste = HomeLogik.offeneSpiele(offen.wert.orEmpty())
    val zuPlaetzen = { ziele.zuTab(HauptTab.PLAETZE) }
    Kopfzeile("Offene Spiele", KopfLink("Alle", "Alle offenen Spiele", zuPlaetzen))
    offen.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (offen.wert != null && liste.isEmpty()) {
        Leerzustand("Gerade sucht niemand Mitspieler.")
    }
    for (o in liste) {
        val uhr = Zeit.minutesToTime(Zeit.minutesOf(o.startsAt))
        Row(
            Modifier
                .fillMaxWidth()
                .karte(radius = Radius.karte, padding = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val marke = RoundedCornerShape(16.dp)
            Box(
                Modifier
                    .size(width = 56.dp, height = 60.dp)
                    .clip(marke)
                    .background(f.goldSoft),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.matchParentSize()) {
                    val dicke = 1.5.dp.toPx()
                    drawRoundRect(
                        f.goldLine,
                        topLeft = Offset(dicke / 2, dicke / 2),
                        size = Size(size.width - dicke, size.height - dicke),
                        cornerRadius = CornerRadius(16.dp.toPx()),
                        style = Stroke(dicke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        Startseite.dayTag(o.startsAt, jetzt),
                        style = TcmSchrift.display(Schrift.gewichtFett, 12.sp, 0.8.sp),
                        color = f.ink2,
                    )
                    Text(uhr, style = TcmSchrift.display(Schrift.gewichtFett, 19.sp), color = f.ink)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    HomeLogik.offenesSpielTitel(o),
                    style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal),
                    color = f.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(HomeLogik.offenesSpielZeile(o), style = leise, color = f.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (o.binDabei == true) {
                Text("Dabei", style = TcmSchrift.text(Schrift.gewichtFett, Schrift.klein), color = f.muted)
            } else {
                Button(
                    onClick = zuPlaetzen,
                    shape = Kapsel,
                    colors = ButtonDefaults.buttonColors(containerColor = f.gold, contentColor = f.onGold),
                    contentPadding = PaddingValues(horizontal = 14.dp),
                    modifier = Modifier.semantics { contentDescription = "Mitspielen: ${o.typeName ?: ""} um $uhr" },
                ) {
                    Text("Mitspielen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp))
                }
            }
        }
    }
}

// ---- Dein Stand ---------------------------------------------------------------

@Composable
private fun DeinStandKacheln(stand: DeinStand, ziele: HomeZiele) {
    val f = TcmTheme.farben
    val gross = TcmSchrift.display(Schrift.gewichtFett, 28.sp)
    Kopfzeile("Dein Stand")
    Row(
        Modifier.height(IntrinsicSize.Max),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StandKachel(stand.getraenkeTitel, stand.getraenkeLabel, ziele.zuGetraenken, Modifier.weight(1f)) {
            val fehler = stand.getraenkeFehler
            if (fehler != null) {
                Text(fehler, style = leise, color = f.redInk)
            } else {
                Text(stand.getraenkeWert ?: "", style = gross, color = f.ink)
                Text("läuft noch", style = leise, color = f.muted)
            }
        }
        StandKachel(stand.dienstTitel, stand.dienstLabel, { ziele.zuTab(HauptTab.KONTO) }, Modifier.weight(1f)) {
            val fehler = stand.dienstFehler
            val wert = stand.dienstWert
            when {
                fehler != null -> Text(fehler, style = leise, color = f.redInk)
                wert != null -> {
                    Text(wert, style = gross, color = f.ink)
                    Box(
                        Modifier
                            .padding(top = 6.dp)
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(Kapsel)
                            .background(f.surf2),
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(stand.dienstAnteil.toFloat())
                                .fillMaxHeight()
                                .clip(Kapsel)
                                .background(f.green),
                        )
                    }
                }
                else -> Text("Kein Soll für dieses Jahr.", style = leise, color = f.muted, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun StandKachel(
    titel: String,
    label: String,
    aktion: () -> Unit,
    modifier: Modifier,
    inhalt: @Composable () -> Unit,
) {
    Column(
        modifier
            .fillMaxHeight()
            .karte(radius = Radius.karte, padding = 0.dp)
            .tippbar(label, aktion = aktion)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(titel, style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp), color = TcmTheme.farben.muted)
        inhalt()
    }
}

// ---- Neuigkeiten --------------------------------------------------------------

@Composable
private fun Neuigkeiten(neues: Abschnitt<List<Benachrichtigung>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    // Ungelesenes und die letzte Woche; "Alle" fuehrt auch dann zur ganzen
    // Liste, wenn nur noch Aelteres da ist.
    val liste = Startseite.startseitenNeuigkeiten(neues.wert.orEmpty(), jetzt)
    Kopfzeile(
        "Neuigkeiten",
        if (HomeLogik.zeigeAlleNeuigkeiten(neues)) KopfLink("Alle", "Alle Neuigkeiten", ziele.zuNachrichten) else null,
    )
    neues.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (neues.wert != null && liste.isEmpty()) {
        Leerzustand("Keine Neuigkeiten.")
    }
    if (liste.isNotEmpty()) {
        Column(
            Modifier
                .fillMaxWidth()
                .karte(padding = 0.dp),
        ) {
            liste.forEachIndexed { i, n ->
                if (i > 0) Trennlinie()
                NachrichtZeile(n, neu = n.readAt == null, jetzt = jetzt, hervorheben = false, zeilen = 3, zuVeranstaltung = ziele.zuVeranstaltung)
            }
        }
    }
}
