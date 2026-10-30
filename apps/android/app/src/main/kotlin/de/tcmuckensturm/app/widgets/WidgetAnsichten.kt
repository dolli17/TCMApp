/*
 * Die Ansichten der Widgets (Glance)
 *
 * Wie TCMWidgets/Gemeinsam/WidgetAnsichten.swift der iOS-App. Farben aus den
 * Vereins-Tokens (Hell/Dunkel), hell und dunkel folgen dem System wie in
 * iOS. Material You (dynamische Farben) nimmt das Widget bewusst nicht - die
 * Flaechen sind Vereinsblau und Weiss; vom System kommen nur die Ecken
 * (system_app_widget_background_radius).
 *
 * Schrift: RemoteViews koennen keine eigenen Schriften laden, Barlow geht im
 * Widget also nicht. Statt Barlow Semi Condensed fuer Zahlen und Kicker
 * nimmt es die schmale Systemschrift (sans-serif-condensed), sonst die
 * normale (sans-serif).
 *
 * Die Ansichten nehmen Zustand, Uhrzeit und Groesse als Werte - so zeichnen
 * die Bildschirmfoto-Tests sie ohne Widget-Host (WidgetBildschirmfotoTest).
 */

package de.tcmuckensturm.app.widgets

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import de.tcmuckensturm.app.ui.tokens.Dunkel
import de.tcmuckensturm.app.ui.tokens.Hell
import de.tcmuckensturm.app.ui.tokens.Palette
import de.tcmuckensturm.kern.Veranstaltungen
import java.time.Instant

// ---- Farben und Schrift ---------------------------------------------------------

/** Die Vereinsfarben fuer Glance: je Token hell und dunkel. */
object WidgetFarbe {
    private fun token(deckkraft: Float = 1f, wahl: (Palette) -> Color): ColorProvider = ColorProvider(
        day = wahl(Hell).let { it.copy(alpha = it.alpha * deckkraft) },
        night = wahl(Dunkel).let { it.copy(alpha = it.alpha * deckkraft) },
    )

    val brand = token { it.brand }
    val onBrand = token { it.onBrand }
    val onBrandLeise = token(0.85f) { it.onBrand }
    val onBrandFast = token(0.92f) { it.onBrand }
    val onBrandLinie = token(0.18f) { it.onBrand }
    val gold = token { it.gold }
    val onGold = token { it.onGold }
    val goldInk = token { it.goldInk }
    val goldSoft = token { it.goldSoft }
    val surf = token { it.surf }
    val surf2 = token { it.surf2 }
    val ink = token { it.ink }
    val ink2 = token { it.ink2 }
    val muted = token { it.muted }
    val greenInk = token { it.greenInk }
    val greenLeise = token(0.15f) { it.green }

    fun leiste(art: LeistenArt): ColorProvider = when (art) {
        LeistenArt.LEER -> surf2
        LeistenArt.FREI -> leisteFrei
        LeistenArt.BELEGT -> leisteBelegt
        LeistenArt.EIGEN -> gold
        LeistenArt.SUCHT -> leisteSucht
        LeistenArt.GESPERRT -> leisteGesperrt
    }

    private val leisteFrei = token(0.55f) { it.green }
    private val leisteBelegt = token { it.blue }
    private val leisteSucht = token(0.6f) { it.goldLine }
    private val leisteGesperrt = token(0.55f) { it.rahmen }
}

/** Statt Barlow (siehe oben): schmal fuer Zahlen und Kicker, sonst die Systemschrift. */
private val schmal = FontFamily("sans-serif-condensed")

private fun anzeige(groesse: TextUnit, farbe: ColorProvider, gewicht: FontWeight = FontWeight.Bold) =
    TextStyle(color = farbe, fontSize = groesse, fontWeight = gewicht, fontFamily = schmal)

private fun text(groesse: TextUnit, farbe: ColorProvider, gewicht: FontWeight = FontWeight.Normal, ausrichtung: TextAlign? = null) =
    TextStyle(color = farbe, fontSize = groesse, fontWeight = gewicht, fontFamily = FontFamily.SansSerif, textAlign = ausrichtung)

/** Kicker wie in der App (Bausteine.Kicker), etwas kleiner fuer Widgets. */
@Composable
private fun Kicker(inhalt: String, farbe: ColorProvider, zeilen: Int = 1, modifier: GlanceModifier = GlanceModifier) {
    Text(inhalt.uppercase(), modifier = modifier, style = anzeige(12.sp, farbe), maxLines = zeilen)
}

/** Flaeche des Widgets: Hintergrund, Ecken vom System (ab Android 12), Abstand und Tippen. */
private fun GlanceModifier.flaeche(farbe: ColorProvider, aktion: Action?): GlanceModifier {
    var m = fillMaxSize().appWidgetBackground().background(farbe)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) m = m.cornerRadius(android.R.dimen.system_app_widget_background_radius)
    if (aktion != null) m = m.clickable(aktion)
    return m.padding(14.dp)
}

@Composable
private fun Punkt(farbe: ColorProvider, groesse: Int = 14) {
    var m = GlanceModifier.size(groesse.dp).background(farbe)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) m = m.cornerRadius((groesse / 2).dp)
    Box(modifier = m) {}
}

private fun GlanceModifier.rund(radius: Int): GlanceModifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) cornerRadius(radius.dp) else this

// ---- Hinweise -------------------------------------------------------------------

/** Ohne Sitzung oder ohne Daten - dieselbe Karte fuer alle Widgets. */
@Composable
fun WidgetHinweis(titel: String, zustand: WidgetZustand, aktion: Action?) {
    val abgemeldet = zustand is WidgetZustand.Abgemeldet
    Column(modifier = GlanceModifier.flaeche(WidgetFarbe.surf, aktion)) {
        Kicker(titel, WidgetFarbe.muted)
        Spacer(GlanceModifier.defaultWeight())
        Text(
            if (abgemeldet) "In der App anmelden" else "Noch keine Daten",
            style = text(16.sp, WidgetFarbe.ink, FontWeight.Bold),
            maxLines = 2,
        )
        Text(
            if (abgemeldet) {
                "Dann stehen hier deine Spiele, die Plätze und was im Verein ansteht."
            } else {
                "Öffne die App einmal, dann füllt sich das Widget."
            },
            style = text(13.sp, WidgetFarbe.ink2),
            maxLines = 3,
        )
    }
}

// ---- Meine naechsten Spiele -----------------------------------------------------

@Composable
fun SpieleWidgetAnsicht(zustand: WidgetZustand, jetzt: Instant, familie: WidgetFamilie, aktion: Action?) {
    if (zustand !is WidgetZustand.Daten) return WidgetHinweis("Meine Spiele", zustand, aktion)
    val s = zustand.schnappschuss
    val mittel = familie != WidgetFamilie.KLEIN
    val zeilen = WidgetInhalt.spiele(s.termine.orEmpty(), jetzt, hoechstens = if (mittel) 3 else 1)
    val geladen = s.termine != null

    Column(modifier = GlanceModifier.flaeche(WidgetFarbe.brand, aktion)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Kicker(
                if (mittel) "Meine nächsten Spiele" else zeilen.firstOrNull()?.kicker ?: "Meine Spiele",
                WidgetFarbe.onBrandLeise,
                zeilen = if (mittel) 1 else 2,
                modifier = GlanceModifier.defaultWeight(),
            )
            Punkt(WidgetFarbe.gold)
        }
        when {
            zeilen.isEmpty() -> {
                Spacer(GlanceModifier.defaultWeight())
                SpieleLeer(geladen)
            }
            mittel -> {
                zeilen.forEachIndexed { i, z ->
                    if (i > 0) Box(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(WidgetFarbe.onBrandLinie)) {}
                    SpielZeileAnsicht(z)
                }
                Spacer(GlanceModifier.defaultWeight())
            }
            else -> {
                val z = zeilen.first()
                Text(z.beginn, modifier = GlanceModifier.padding(top = 2.dp), style = anzeige(38.sp, WidgetFarbe.onBrand), maxLines = 1)
                Text(
                    listOf(z.platz, z.art).filter { it.isNotEmpty() }.joinToString(" · "),
                    style = text(14.sp, WidgetFarbe.onBrand, FontWeight.Bold),
                    maxLines = 1,
                )
                Spacer(GlanceModifier.defaultWeight())
                Text(z.mit, style = text(12.sp, WidgetFarbe.onBrandLeise), maxLines = 2)
            }
        }
    }
}

@Composable
private fun SpielZeileAnsicht(z: SpielZeile) {
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp)
            .semantics { contentDescription = "${z.kicker}, ${z.zeit}, ${z.platz}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(z.beginn, modifier = GlanceModifier.width(62.dp), style = anzeige(22.sp, WidgetFarbe.onBrand), maxLines = 1)
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(z.kicker, style = anzeige(12.sp, WidgetFarbe.gold), maxLines = 1)
            Text(
                listOf(z.platz, z.art, z.mit).filter { it.isNotEmpty() }.joinToString(" · "),
                style = text(13.sp, WidgetFarbe.onBrandFast, FontWeight.Medium),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun SpieleLeer(geladen: Boolean) {
    Text(
        if (geladen) "Noch nichts geplant" else "Termine konnten nicht geladen werden.",
        style = text(16.sp, WidgetFarbe.onBrand, FontWeight.Bold),
        maxLines = 2,
    )
    Text("Platz buchen ›", modifier = GlanceModifier.padding(top = 2.dp), style = text(13.sp, WidgetFarbe.gold, FontWeight.Medium))
}

// ---- Plaetze jetzt --------------------------------------------------------------

/** Spaltenbreiten einer Platzzeile in dp. */
private const val NAME_BREITE = 58
private const val STATUS_BREITE = 92
private const val SPALTEN_ABSTAND = 8

/** Wie breit die Zeitleiste wird, wenn das Widget `breite` dp breit ist (Rand 14 je Seite). */
fun leistenBreite(breite: Float): Int = (breite - 2 * 14 - NAME_BREITE - STATUS_BREITE - 2 * SPALTEN_ABSTAND).toInt()

@Composable
fun PlaetzeWidgetAnsicht(zustand: WidgetZustand, jetzt: Instant, familie: WidgetFamilie, breite: Float, aktion: Action?) {
    if (zustand !is WidgetZustand.Daten) return WidgetHinweis("Plätze jetzt", zustand, aktion)
    val s = zustand.schnappschuss
    val lage = WidgetInhalt.plaetze(s.plan, jetzt)
    val gross = familie == WidgetFamilie.GROSS

    Column(modifier = GlanceModifier.flaeche(WidgetFarbe.surf, aktion)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Kicker("Plätze jetzt", WidgetFarbe.muted, modifier = GlanceModifier.defaultWeight())
            WidgetInhalt.standText(s.stand, jetzt)?.let {
                Text(it, modifier = GlanceModifier.padding(end = 6.dp), style = text(11.sp, WidgetFarbe.muted), maxLines = 1)
            }
            if (lage != null) {
                Text(
                    lage.ueberschrift,
                    style = text(13.sp, if (lage.freiJetzt > 0) WidgetFarbe.greenInk else WidgetFarbe.ink2, FontWeight.Bold),
                    maxLines = 1,
                )
            }
        }
        if (lage != null) {
            val zeilen = if (gross) lage.zeilen.take(8) else WidgetInhalt.mittelZeilen(lage.zeilen, hoechstens = 4)
            for (z in zeilen) PlatzZeileAnsicht(z, if (lage.geschlossen) null else lage.jetzt, leistenBreite(breite), gross)
            Spacer(GlanceModifier.defaultWeight())
        } else {
            Spacer(GlanceModifier.defaultWeight())
            Text("Die Belegung für heute ist noch nicht geladen.", style = text(14.sp, WidgetFarbe.ink2, FontWeight.Medium), maxLines = 2)
            Spacer(GlanceModifier.defaultWeight())
        }
    }
}

@Composable
private fun PlatzZeileAnsicht(z: PlatzZeile, marke: Double?, leiste: Int, gross: Boolean) {
    Column(
        modifier = GlanceModifier.fillMaxWidth().padding(top = if (gross) 7.dp else 5.dp)
            .semantics { contentDescription = "${z.name}, ${z.status}" },
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(z.name, modifier = GlanceModifier.width(NAME_BREITE.dp), style = anzeige(15.sp, WidgetFarbe.ink), maxLines = 1)
            Spacer(GlanceModifier.width(SPALTEN_ABSTAND.dp))
            // Zu schmal fuer eine lesbare Leiste: dann nur Name und Stand.
            if (leiste >= 40) {
                WidgetZeitleiste(z.belegt, z.frei, marke, leiste)
            } else {
                Spacer(GlanceModifier.defaultWeight())
            }
            Spacer(GlanceModifier.width(SPALTEN_ABSTAND.dp))
            Text(
                z.status,
                modifier = GlanceModifier.width(STATUS_BREITE.dp),
                style = text(12.sp, if (z.freiJetzt) WidgetFarbe.greenInk else WidgetFarbe.ink2, FontWeight.Medium, TextAlign.End),
                maxLines = 1,
            )
        }
        if (gross) {
            Text(
                "Frei: ${z.lueckenText}",
                modifier = GlanceModifier.padding(start = (NAME_BREITE + SPALTEN_ABSTAND).dp),
                style = text(11.sp, WidgetFarbe.muted),
                maxLines = 1,
            )
        }
    }
}

/** Wie MiniZeitleiste auf Home, dazu die freien Luecken gruen - als Reihe von Kaestchen (WidgetLeiste). */
@Composable
fun WidgetZeitleiste(
    belegt: List<de.tcmuckensturm.kern.TimelineSegment>,
    frei: List<LeistenStueck>,
    markierung: Double?,
    breite: Int,
    hoehe: Int = 8,
) {
    val abschnitte = WidgetLeiste.abschnitte(belegt, frei)
    val breiten = WidgetLeiste.breiten(abschnitte, breite)
    Box(modifier = GlanceModifier.width(breite.dp).height((hoehe + 4).dp), contentAlignment = Alignment.CenterStart) {
        Row(modifier = GlanceModifier.width(breite.dp).height(hoehe.dp).rund(hoehe / 2)) {
            abschnitte.forEachIndexed { i, s ->
                if (breiten[i] > 0) {
                    Box(modifier = GlanceModifier.width(breiten[i].dp).height(hoehe.dp).background(WidgetFarbe.leiste(s.art))) {}
                }
            }
        }
        if (markierung != null) {
            Row(modifier = GlanceModifier.width(breite.dp).height((hoehe + 4).dp)) {
                Spacer(GlanceModifier.width(WidgetLeiste.marke(markierung, breite).dp))
                Box(modifier = GlanceModifier.width(2.dp).height((hoehe + 4).dp).background(WidgetFarbe.ink).rund(1)) {}
            }
        }
    }
}

// ---- Naechste Veranstaltung -----------------------------------------------------

@Composable
fun VeranstaltungWidgetAnsicht(zustand: WidgetZustand, jetzt: Instant, familie: WidgetFamilie, aktion: Action?) {
    if (zustand !is WidgetZustand.Daten) return WidgetHinweis("Im Verein", zustand, aktion)
    val s = zustand.schnappschuss
    val e = WidgetInhalt.veranstaltung(s.veranstaltungen.orEmpty(), jetzt)
    val klein = familie == WidgetFamilie.KLEIN

    Column(modifier = GlanceModifier.flaeche(WidgetFarbe.surf, aktion)) {
        Kicker(if (klein) "Im Verein" else "Demnächst im Verein", WidgetFarbe.muted)
        if (e != null) {
            Row(modifier = GlanceModifier.padding(top = 8.dp), verticalAlignment = Alignment.Top) {
                Kachel(e)
                if (!klein) {
                    Spacer(GlanceModifier.width(10.dp))
                    VeranstaltungTitel(e)
                }
            }
            if (klein) {
                Spacer(GlanceModifier.height(6.dp))
                VeranstaltungTitel(e)
            }
            Spacer(GlanceModifier.defaultWeight())
            e.marke?.let { Marke(it) }
        } else {
            Spacer(GlanceModifier.defaultWeight())
            Text(
                if (s.veranstaltungen != null) "Gerade steht nichts an." else "Veranstaltungen konnten nicht geladen werden.",
                style = text(15.sp, WidgetFarbe.ink, FontWeight.Medium),
                maxLines = 3,
            )
            Spacer(GlanceModifier.defaultWeight())
        }
    }
}

@Composable
private fun Kachel(e: WidgetVeranstaltung) {
    val kachel = Veranstaltungen.eventDatumKachel(e.startsAt)
    Column(
        modifier = GlanceModifier.width(46.dp).height(50.dp).background(WidgetFarbe.gold).rund(8),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(kachel.tag, style = anzeige(22.sp, WidgetFarbe.onGold), maxLines = 1)
        Text(kachel.monat.uppercase(), style = anzeige(11.sp, WidgetFarbe.onGold), maxLines = 1)
    }
}

@Composable
private fun VeranstaltungTitel(e: WidgetVeranstaltung) {
    Column {
        Text(e.titel, style = text(15.sp, WidgetFarbe.ink, FontWeight.Bold), maxLines = 2)
        Text(e.zeit, style = text(12.sp, WidgetFarbe.ink2), maxLines = 2)
    }
}

/** Wie eventMeineMarke: angemeldet gruen, Warteliste und "Anmelden" gelb. */
@Composable
private fun Marke(marke: String) {
    val dabei = marke.startsWith("Angemeldet")
    Box(
        modifier = GlanceModifier.background(if (dabei) WidgetFarbe.greenLeise else WidgetFarbe.goldSoft).rund(12)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(marke, style = text(12.sp, if (dabei) WidgetFarbe.greenInk else WidgetFarbe.goldInk, FontWeight.Bold), maxLines = 1)
    }
}
