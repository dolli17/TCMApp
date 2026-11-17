/*
 * Home - die Startseite (docs/design/stitch, Entwurf "start")
 *
 * Wie apps/web/src/app/page.tsx: bewusst ausgeduennt und einspaltig. Der
 * naechste eigene Termin, zwei Aktionen, freie Plaetze, offene Spiele und ein
 * Streifen zur naechsten Veranstaltung. Der laufende Monat und der
 * Arbeitsdienst stehen im Konto, Neuigkeiten hinter der Glocke. Nur Lesen -
 * gebucht und eingetragen wird auf den Bildschirmen, auf die die Knoepfe
 * fuehren (Plaetze; Getraenke und Veranstaltungen ueber LocalZuVerein).
 *
 * Farben: kraeftiges Blau nur "Platz buchen", Gelb nur am eigenen Termin und
 * an "Du bist dabei".
 *
 * Alle Abschnitte laden parallel und jeder fuer sich: schlaegt einer fehl,
 * steht dort der Fehler, und der Rest bleibt gefuellt. Der Inhalt liegt in
 * einem ViewModel und ueberlebt so Tabwechsel; zurueck auf Home wird still
 * nachgeladen, ohne Ladekreis.
 */

package de.tcmuckensturm.app.bildschirme.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircle
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.ShoppingCart
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.DeinMarker
import de.tcmuckensturm.app.bildschirme.Erneut
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.Handlung
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.Knopf
import de.tcmuckensturm.app.bildschirme.Knopfgroesse
import de.tcmuckensturm.app.bildschirme.Knopfstufe
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.bildschirme.MarkeKlein
import de.tcmuckensturm.app.bildschirme.grosseSchrift
import de.tcmuckensturm.app.bildschirme.Zweitknopf
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.leise
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.bildschirme.tippbar
import de.tcmuckensturm.app.bildschirme.verein.LocalZuVerein
import de.tcmuckensturm.app.bildschirme.verein.VereinZiel
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
import de.tcmuckensturm.app.widgets.WidgetBruecke
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Veranstaltungen
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

class HomeModell(
    private val daten: Startdaten,
    /** Fuer die Widgets (WidgetBruecke), wie WidgetBruecke.ablegen in iOS. */
    private val ablegen: suspend (HomeInhalt) -> Unit = {},
) : ViewModel() {
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
            launch { ablegen(neu) }
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
            val events = async { Abschnitt.von { d.veranstaltungen() } }

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
                events = events.await(),
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
    val zuVerein = LocalZuVerein.current
    val context = LocalContext.current.applicationContext
    val modell = viewModel { HomeModell(Startdaten(client)) { WidgetBruecke.ablegen(context, it) } }
    val zustand by modell.zustand.collectAsStateWithLifecycle()

    // Zurueck auf Home (Tab oder Neuigkeiten): still nachladen, ohne Ladekreis.
    LaunchedEffect(Unit) { if (zustand.inhalt != null) modell.laden(nachladen = false) }

    HomeAnsicht(
        zustand = zustand,
        ziele = HomeZiele(
            zuTab = zuTab,
            zuGetraenken = { zuVerein(VereinZiel.Getraenke) },
            zuVeranstaltung = { zuVerein(VereinZiel.Veranstaltung(it)) },
            zuNachrichten = zuNachrichten,
        ),
        nachladen = { modell.laden(nachladen = true) },
        glocke = { Glocke() },
    )
}

/** Wohin die Knoepfe auf Home fuehren. */
data class HomeZiele(
    val zuTab: (HauptTab) -> Unit,
    val zuGetraenken: () -> Unit,
    val zuVeranstaltung: (String) -> Unit,
    /** Der Bildschirm "Neuigkeiten" liegt weiter im Graphen (Push); Home selbst verweist nicht mehr darauf. */
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
        ) {
            GrosserKopf(HomeLogik.titel(d?.name?.vorname), name = d?.name, glocke = glocke)
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
                    Column(verticalArrangement = Arrangement.spacedBy(Abstand.m)) {
                        AlsNaechstes(d.termine, erneut, ziele, jetzt)
                        Aktionen(ziele)
                    }
                    Abschnittskopf("Jetzt frei", HomeLogik.freiZaehler(d.frei, jetzt))
                    JetztFrei(d.frei, erneut, ziele, jetzt)
                    Abschnittskopf("Offene Spiele", "Mitspieler gesucht")
                    OffeneSpiele(d.offen, erneut, ziele, jetzt)
                    NaechsteVeranstaltung(d.events, erneut, ziele, jetzt)
                }
                else -> Text("Die Startseite konnte nicht geladen werden.", style = leise, color = f.muted)
            }
        }
    }
}

/** Titel links, rechts ein Kicker als Zaehler oder Einordnung ("3 Plätze", "Mitspieler gesucht"). */
@Composable
private fun Abschnittskopf(titel: String, rechts: String?) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Abstand.abschnitt, bottom = Abstand.m),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Text(
            titel,
            style = TcmSchrift.display(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
            color = f.ink,
            modifier = Modifier
                .weight(1f)
                .semantics { heading() },
        )
        if (rechts != null) Kicker(rechts)
    }
}

// ---- Als Naechstes ------------------------------------------------------------

/** Eine Karte: der naechste eigene Termin mit gelbem Marker - oder "Noch nichts geplant". */
@Composable
private fun AlsNaechstes(termine: Abschnitt<List<MeineBuchung>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    termine.fehler?.let {
        Fehlerzeile(it, erneut.laeuft, erneut.aktion)
        return
    }
    val kommende = Startseite.upcomingBookings(termine.wert.orEmpty(), jetzt)
    val erster = kommende.firstOrNull()
    val basis = Modifier
        .fillMaxWidth()
        .karte(radius = Radius.karteGross, padding = 0.dp)
    if (erster == null) {
        Column(basis.padding(horizontal = 22.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Kicker("Heute")
            Text(
                "Noch nichts geplant",
                style = TcmSchrift.display(Schrift.gewichtFett, 22.sp),
                color = f.ink,
                modifier = Modifier.padding(top = 6.dp),
            )
            Text("Such dir einen Platz – heute ist noch einiges frei.", style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp), color = f.ink2)
        }
        return
    }
    val kicker = Startseite.bookingKicker(erster.startsAt, erster.endsAt, jetzt).split(" · ", limit = 2)
    val weitere = kommende.size - 1
    Column(
        basis
            .tippbar(HomeLogik.terminLabel(erster, jetzt)) { ziele.zuTab(HauptTab.PLAETZE) }
            .padding(horizontal = 22.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Kicker(kicker[0], Modifier.weight(1f))
            // Gelb heisst "deins": der eigene Termin.
            kicker.getOrNull(1)?.let { DeinMarker(it) }
        }
        Text(
            buildAnnotatedString {
                append(Zeit.minutesToTime(Zeit.minutesOf(erster.startsAt)))
                withStyle(SpanStyle(fontSize = 18.sp, fontWeight = Schrift.gewichtMittel, color = f.muted, letterSpacing = 0.sp)) {
                    append(" Uhr")
                }
            },
            style = TcmSchrift.display(Schrift.gewichtFett, Schrift.hero, (-1.5).sp).copy(fontFeatureSettings = "tnum"),
            color = f.ink,
            maxLines = 1,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            "${erster.courtName ?: ""} · ${HomeLogik.mitText(erster)}",
            style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp),
            color = f.ink2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (weitere > 0) {
            Text(
                HomeLogik.weitereTermine(weitere),
                style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp),
                color = f.blueInk,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

// ---- Die zwei Aktionen ----------------------------------------------------------

/** "Platz buchen" ist die eine Hauptaktion der Startseite, "Getränk eintragen" die Zweitaktion. */
@Composable
private fun Aktionen(ziele: HomeZiele) {
    val buchen: @Composable (Modifier) -> Unit = { m ->
        Knopf(
            "Platz buchen", m, Knopfstufe.HAUPT, Knopfgroesse.GROSS,
            breit = false, symbol = Icons.Outlined.AddCircle, eng = true,
        ) { ziele.zuTab(HauptTab.PLAETZE) }
    }
    val getraenk: @Composable (Modifier) -> Unit = { m ->
        Knopf(
            "Getränk eintragen", m, Knopfstufe.ZWEIT, Knopfgroesse.GROSS,
            breit = false, symbol = Icons.Outlined.ShoppingCart, eng = true, aktion = ziele.zuGetraenken,
        )
    }
    // Bei grosser Schrift untereinander (U5); sonst bekommt der laengere Text etwas mehr Breite.
    if (grosseSchrift()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            buchen(Modifier.fillMaxWidth())
            getraenk(Modifier.fillMaxWidth())
        }
    } else {
        Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            buchen(Modifier.weight(0.9f).fillMaxHeight())
            getraenk(Modifier.weight(1.1f).fillMaxHeight())
        }
    }
}

// ---- Jetzt frei ---------------------------------------------------------------

/** Eine Listenkarte: je freiem Platz eine Zeile mit blauem Punkt und "frei bis". */
@Composable
private fun JetztFrei(frei: Abschnitt<FreiDaten>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    val karten = frei.wert?.let { HomeLogik.jetztFreiKarten(it, jetzt) }.orEmpty()
    val zuPlaetzen = { ziele.zuTab(HauptTab.PLAETZE) }
    frei.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (frei.wert != null && karten.isEmpty()) {
        Leerzustand("Gerade ist kein Platz frei.", handlung = Handlung("Belegung ansehen", zuPlaetzen))
    }
    if (karten.isNotEmpty()) {
        Column(
            Modifier
                .fillMaxWidth()
                .karte(padding = 0.dp),
        ) {
            karten.forEachIndexed { i, k ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .tippbar("${k.name}, frei bis ${k.bis}, buchen", aktion = zuPlaetzen)
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Box(
                        Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(f.blue),
                    )
                    Text(
                        k.name,
                        style = TcmSchrift.display(Schrift.gewichtHalbfett, 17.sp),
                        color = f.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "frei bis ${k.bis}",
                        style = TcmSchrift.text(Schrift.gewichtNormal, 14.5.sp).copy(fontFeatureSettings = "tnum"),
                        color = f.muted,
                    )
                }
            }
        }
    }
}

// ---- Offene Spiele ------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OffeneSpiele(offen: Abschnitt<List<OffenesSpiel>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    val liste = HomeLogik.offeneSpiele(offen.wert.orEmpty())
    val zuPlaetzen = { ziele.zuTab(HauptTab.PLAETZE) }
    offen.fehler?.let { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
    if (offen.wert != null && liste.isEmpty()) {
        Leerzustand("Gerade sucht niemand Mitspieler.")
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (o in liste) {
            val uhr = Zeit.minutesToTime(Zeit.minutesOf(o.startsAt))
            Row(
                Modifier
                    .fillMaxWidth()
                    .karte(padding = 0.dp)
                    .padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        itemVerticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            HomeLogik.offenesSpielWann(o, jetzt),
                            style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp).copy(fontFeatureSettings = "tnum"),
                            color = f.ink,
                        )
                        // Hellblau: Spielform und wie viele noch fehlen.
                        MarkeKlein(HomeLogik.offenesSpielTitel(o))
                    }
                    Text(
                        HomeLogik.offenesSpielZeile(o),
                        style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp),
                        color = f.ink2,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    HomeLogik.offenesSpielFilter(o)?.let {
                        Text(
                            it,
                            style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein),
                            color = f.blueInk,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.semantics { contentDescription = "Nur für $it" },
                        )
                    }
                }
                if (o.binDabei == true) {
                    DeinMarker("Du bist dabei")
                } else {
                    Zweitknopf(
                        "Mitspielen",
                        klein = true,
                        beschreibung = "Mitspielen: ${o.typeName ?: ""} um $uhr",
                        aktion = zuPlaetzen,
                    )
                }
            }
        }
    }
}

// ---- Demnaechst im Verein: ein Streifen, der Rest steht unter Verein ----------------

@Composable
private fun NaechsteVeranstaltung(events: Abschnitt<List<MitgliedEvent>>, erneut: Erneut, ziele: HomeZiele, jetzt: Instant) {
    val f = TcmTheme.farben
    events.fehler?.let {
        Box(Modifier.padding(top = Abstand.abschnitt)) { Fehlerzeile(it, erneut.laeuft, erneut.aktion) }
        return
    }
    val e = Veranstaltungen.eventDemnaechst(events.wert.orEmpty(), jetzt, 1).firstOrNull() ?: return
    val tag = Zeit.datum(e.startsAt)?.let(Zeit::heuteLang) ?: ""
    val form = RoundedCornerShape(26.dp)
    Row(
        Modifier
            .padding(top = Abstand.abschnitt)
            .fillMaxWidth()
            .clip(form)
            .background(f.blueSoft)
            .border(1.dp, f.blue.copy(alpha = 0.22f), form)
            .tippbar("Demnächst im Verein: $tag, ${e.title ?: ""}") { ziele.zuVeranstaltung(e.id) }
            .heightIn(min = 52.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.DateRange, contentDescription = null, tint = f.blueInk, modifier = Modifier.size(20.dp))
        Text(
            buildAnnotatedString {
                append("$tag · ")
                withStyle(SpanStyle(fontWeight = Schrift.gewichtFett)) { append(e.title ?: "") }
            },
            style = TcmSchrift.text(Schrift.gewichtNormal, 14.5.sp),
            color = f.ink,
            modifier = Modifier.weight(1f),
        )
    }
}
