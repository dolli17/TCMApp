/*
 * Verwaltung: Plaetze & Serien (apps/mobile/app/(tabs)/verwaltung/,
 * Bildschirme/Verwaltung/VerwaltungBildschirm.swift)
 *
 * Verwaltet wird am PC (Web unter /admin). Am Handy bleibt, was kurzfristig
 * an den Plaetzen passiert: Plaetze sperren und Serien pflegen. Zwei
 * Segmente; der gelbe Knopf passt zum Segment (Plaetze sperren / Serie
 * anlegen). Die Plaetze stehen nur zum Lesen da, mit dem, was gerade auf
 * ihnen liegt - eine Sperrung fuehrt in den Tab Plaetze, wo sie bearbeitet
 * und aufgehoben wird. Unten verweist eine Karte ins Web: Admins auf
 * /admin, den Platzwart auf /admin/plaetze, geoeffnet als Custom Tab.
 *
 * Den Tab gibt es nur mit Platzrechten (rememberVerwaltungSichtbar,
 * HauptTabs). Das ist wie im Web nur die Oberflaeche: die RPCs pruefen selbst.
 */

package de.tcmuckensturm.app.bildschirme.verwaltung

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Avatar
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.konto.KontoGruppe
import de.tcmuckensturm.app.bildschirme.konto.KontoHinweis
import de.tcmuckensturm.app.bildschirme.konto.KontoLinie
import de.tcmuckensturm.app.bildschirme.konto.KontoSegmente
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import de.tcmuckensturm.app.bildschirme.plaetze.Hauptknopf
import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.app.bildschirme.verein.LocalZuVerein
import de.tcmuckensturm.app.bildschirme.verein.VereinZiel
import de.tcmuckensturm.app.daten.Serie
import de.tcmuckensturm.app.daten.VerwalteterPlatz
import de.tcmuckensturm.app.daten.Verwaltungsdaten
import de.tcmuckensturm.app.daten.VerwaltungsStand
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift

@Composable
fun VerwaltungBildschirm() {
    val sitzung = LocalSitzung.current
    val context = LocalContext.current
    val zuVerein = LocalZuVerein.current
    val m = viewModel { VerwaltungModell(Verwaltungsdaten(sitzung.client)) }
    val farbe = TcmTheme.farben.bg
    val dunkel = TcmTheme.dunkel

    LaunchedEffect(Unit) { m.ladeIch() }
    LaunchedEffect(Unit) { m.laden() }
    ImVordergrund { m.still() }

    VerwaltungInhalt(
        m = m,
        webLink = { sitzung.umgebung.webLink(it) },
        oeffnen = { oeffneImBrowser(context, it, farbe, dunkel) },
        glocke = { Glocke(zuVeranstaltung = { zuVerein(VereinZiel.Veranstaltung(it)) }) },
    )

    m.blatt?.let { VerwaltungBlattFenster(m, it) }
}

/**
 * Die Seite ohne Sitzung - so zeichnen sie auch die Screenshot-Tests.
 * `webLink` macht aus dem Pfad die Adresse (ohne Webadresse null), `oeffnen` zeigt sie.
 */
@Composable
fun VerwaltungInhalt(
    m: VerwaltungModell,
    webLink: (String) -> String?,
    oeffnen: (String) -> Unit,
    glocke: @Composable () -> Unit = {},
) {
    val f = TcmTheme.farben
    val zuTab = LocalZuTab.current
    val s = m.stand
    Box(Modifier.fillMaxSize().background(f.bg)) {
        PullToRefreshBox(isRefreshing = m.aktualisiert, onRefresh = m::vonHand, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                // Was nach oben rollt, laeuft nicht unter die Statusleiste; das Segment klebt darunter.
                Modifier.fillMaxSize().statusBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(Abstand.m),
            ) {
                item(key = "kopf") {
                    Rand {
                        GrosserKopf("Verwaltung") {
                            glocke()
                            val ich = m.ich
                            if (ich?.memberId != null) {
                                Avatar(PlaetzeLogik.initialen(ich.firstName, ich.lastName)) { zuTab(HauptTab.KONTO) }
                            }
                        }
                    }
                }
                m.fehler?.let { text ->
                    item(key = "fehler") { Rand { Fehlerzeile(text, laeuft = m.aktualisiert, erneut = m::vonHand) } }
                }
                if (m.laedt && s == null) {
                    item(key = "laedt") {
                        Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = f.muted)
                        }
                    }
                } else if (s != null) {
                    stickyHeader(key = "segmente") {
                        // Klebt beim Rollen oben wie in Plaetze und Verein (U74).
                        Box(Modifier.fillMaxWidth().background(f.bg).padding(horizontal = Abstand.rand, vertical = Abstand.s)) {
                            KontoSegmente(
                                optionen = VerwaltungAnsicht.entries.map { it to it.label },
                                gewaehlt = m.ansicht,
                                modifier = Modifier.semantics { contentDescription = "Plätze und Serien" },
                                wahl = m::waehle,
                            )
                        }
                    }
                    item(key = "inhalt") {
                        Rand(unten = Abstand.abschnitt * 2) {
                            Inhalt(m, s, webLink, oeffnen, zuPlaetzen = { zuTab(HauptTab.PLAETZE) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Rand(unten: Dp = 0.dp, inhalt: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(start = Abstand.rand, end = Abstand.rand, bottom = unten)) { inhalt() }
}

@Composable
private fun Inhalt(
    m: VerwaltungModell,
    s: VerwaltungsStand,
    webLink: (String) -> String?,
    oeffnen: (String) -> Unit,
    zuPlaetzen: () -> Unit,
) {
    val serien = m.ansicht == VerwaltungAnsicht.SERIEN
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.m)) {
        Hauptknopf(if (serien) "+ Serie anlegen" else "+ Plätze sperren") {
            m.blatt = if (serien) VerwaltungBlatt.SerieAnlegen else VerwaltungBlatt.Sperren
        }
        m.meldung?.let { KontoHinweis(it.meldung, ok = it.ok) }
        if (serien) {
            VerwaltungGruppenkopf("Laufend", neben = "${s.serien.size} Serien")
            SerienListe(s.serien) { m.blatt = VerwaltungBlatt.SerieAendern(it) }
        } else {
            VerwaltungGruppenkopf("Jetzt")
            PlatzListe(s.plaetze, s.zustand, zuPlaetzen)
        }
        // Erst wenn ich() geantwortet hat, steht fest, wohin der Weg ins Web fuehrt.
        m.ich?.let { ich ->
            val admin = ich.admin == true
            WebHinweis(admin, webLink(VerwaltungLogik.webPfad(admin)), oeffnen)
        }
    }
}

// ---- Listen -----------------------------------------------------------------------------

/** Gruppenkopf ueber einer Liste, rechts optional eine Zahl (Gruppenkopf in Liste.tsx). */
@Composable
fun VerwaltungGruppenkopf(titel: String, neben: String? = null) {
    val f = TcmTheme.farben
    Row(Modifier.fillMaxWidth().padding(top = Abstand.s), verticalAlignment = Alignment.Bottom) {
        Text(
            titel,
            style = TcmSchrift.text(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
            color = f.ink,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        if (neben != null) {
            Spacer(Modifier.width(Abstand.s))
            Text(neben, style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein), color = f.muted)
        }
    }
}

/** Die Plaetze mit dem, was jetzt auf ihnen liegt; nur eine Sperrung ist tippbar. */
@Composable
private fun PlatzListe(plaetze: List<VerwalteterPlatz>, zustand: Map<String, PlatzJetzt>, zuPlaetzen: () -> Unit) {
    KontoGruppe {
        plaetze.forEachIndexed { i, p ->
            if (i > 0) KontoLinie()
            val jetzt = if (p.aktiv) zustand[p.id] else null
            val (hinweis, ton) = VerwaltungLogik.platzHinweis(p.aktiv, jetzt)
            val tippbar = VerwaltungLogik.fuehrtZuPlaetzen(jetzt)
            VerwaltungZeile(
                symbol = p.shortName ?: "",
                titel = p.name ?: "",
                kontext = p.subline,
                hinweis = hinweis,
                ton = ton,
                // Bearbeitet und aufgehoben wird eine Sperrung im Platzplan.
                aktion = if (tippbar) zuPlaetzen else null,
                aktionLabel = "Platzplan öffnen",
            )
        }
    }
}

/** Die angelegten Serien; ein Tippen oeffnet das Blatt zum Aendern. */
@Composable
private fun SerienListe(serien: List<Serie>, oeffnen: (Serie) -> Unit) {
    KontoGruppe {
        if (serien.isEmpty()) {
            Box(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp), contentAlignment = Alignment.CenterStart) {
                Text(
                    "Noch keine Serien angelegt.",
                    style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
                    color = TcmTheme.farben.muted,
                )
            }
        }
        serien.forEachIndexed { i, s ->
            if (i > 0) KontoLinie()
            VerwaltungZeile(
                symbol = VerwaltungLogik.kurzeWochentage[((s.weekday ?: 0) % 7 + 7) % 7],
                symbolGold = true,
                titel = s.title ?: "",
                zeit = VerwaltungLogik.serienZeit(s.weekday, s.startTime, s.endTime),
                kontext = VerwaltungLogik.serienKontext(s.typeName, s.courtName, s.validTo),
                hinweis = "${s.kuenftige ?: 0} offen",
                ton = HinweisTon.LEISE,
                aktion = { oeffnen(s) },
                aktionLabel = "Serie bearbeiten",
            )
        }
    }
}

/**
 * Eine Zeile der Verwaltung (Listenzeile in Liste.tsx): Kachel, Titel,
 * Kontext, Hinweis rechts. Mit `aktion` tippbar und mit Pfeil; ohne liest
 * TalkBack sie als ein Element.
 */
@Composable
fun VerwaltungZeile(
    symbol: String,
    titel: String,
    symbolGold: Boolean = false,
    zeit: String? = null,
    kontext: String? = null,
    hinweis: String? = null,
    ton: HinweisTon = HinweisTon.LEISE,
    aktion: (() -> Unit)? = null,
    aktionLabel: String? = null,
) {
    val f = TcmTheme.farben
    val farbe = when (ton) {
        HinweisTon.LEISE -> f.muted
        HinweisTon.ROT -> f.redInk
        HinweisTon.GOLD -> f.goldInk
        HinweisTon.GRUEN -> f.greenInk
    }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .then(
                if (aktion != null) {
                    Modifier.clickable(role = Role.Button, onClickLabel = aktionLabel, onClick = aktion)
                } else {
                    Modifier.semantics(mergeDescendants = true) {}
                },
            )
            .padding(start = 16.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Das Kuerzel steht auch im Titel; TalkBack liest es nicht doppelt.
        Box(
            Modifier.size(40.dp).background(f.surf2, RoundedCornerShape(12.dp)).clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            Text(
                symbol,
                style = TcmSchrift.display(Schrift.gewichtExtrafett, if (symbolGold) 14.sp else 15.sp),
                color = if (symbolGold) f.goldInk else f.ink,
                maxLines = 1,
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                titel,
                style = TcmSchrift.text(Schrift.gewichtFett, 16.sp),
                color = f.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (zeit != null) {
                Text(
                    zeit,
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp).copy(fontFeatureSettings = "tnum"),
                    color = f.ink2,
                )
            }
            if (!kontext.isNullOrEmpty()) {
                Text(kontext, style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp), color = f.muted)
            }
        }
        if (hinweis != null) {
            Text(
                hinweis,
                style = TcmSchrift.text(if (ton == HinweisTon.LEISE) Schrift.gewichtHalbfett else Schrift.gewichtFett, 13.sp),
                color = farbe,
                textAlign = TextAlign.End,
                // Begrenzt, damit der Titel Platz behaelt; bei grosser Schrift bricht er um (200 %).
                modifier = Modifier.widthIn(max = 160.dp),
            )
        }
        if (aktion != null) {
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = f.muted,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ---- Web --------------------------------------------------------------------------------

/**
 * Mitglieder, Kasse, Getraenke und die Plaetze selbst gibt es nur im Web.
 * Ohne Webadresse (lokal) steht nur der Satz da.
 */
@Composable
private fun WebHinweis(admin: Boolean, link: String?, oeffnen: (String) -> Unit) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = Abstand.s)
            .karte(padding = 0.dp)
            .then(
                if (link != null) {
                    Modifier.clickable(role = Role.Button, onClickLabel = "Verwaltung im Browser öffnen") { oeffnen(link) }
                } else {
                    Modifier.semantics(mergeDescendants = true) {}
                },
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(VerwaltungLogik.webTitel(admin), style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = f.ink)
        Text(
            VerwaltungLogik.webText(admin),
            style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp).copy(lineHeight = 20.sp),
            color = f.ink2,
        )
        if (link != null) {
            Text(
                "Im Browser öffnen ›",
                style = TcmSchrift.text(Schrift.gewichtFett, 14.5.sp),
                color = f.blueInk,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/**
 * Oeffnet die Adresse als Custom Tab in den Farben der App; ohne Browser,
 * der Custom Tabs kann, als gewoehnlicher Link.
 */
fun oeffneImBrowser(context: Context, url: String, leiste: Color, dunkel: Boolean) {
    val uri = url.toUri()
    val farben = CustomTabColorSchemeParams.Builder().setToolbarColor(leiste.toArgb()).build()
    val tab = CustomTabsIntent.Builder()
        .setColorScheme(if (dunkel) CustomTabsIntent.COLOR_SCHEME_DARK else CustomTabsIntent.COLOR_SCHEME_LIGHT)
        .setDefaultColorSchemeParams(farben)
        .setShowTitle(true)
        .build()
    try {
        tab.launchUrl(context, uri)
    } catch (_: ActivityNotFoundException) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            // Kein Browser auf dem Geraet: dann bleibt es beim Satz auf der Karte.
        }
    }
}

/** Nach dem Zurueckkehren aus dem Hintergrund (ON_STOP, dann ON_START) - auch aus dem Custom Tab. */
@Composable
private fun ImVordergrund(aktion: () -> Unit) {
    val besitzer = LocalLifecycleOwner.current
    DisposableEffect(besitzer) {
        var warWeg = false
        val beobachter = LifecycleEventObserver { _, ereignis ->
            when (ereignis) {
                Lifecycle.Event.ON_STOP -> warWeg = true
                Lifecycle.Event.ON_START -> if (warWeg) {
                    warWeg = false
                    aktion()
                }
                else -> Unit
            }
        }
        besitzer.lifecycle.addObserver(beobachter)
        onDispose { besitzer.lifecycle.removeObserver(beobachter) }
    }
}
