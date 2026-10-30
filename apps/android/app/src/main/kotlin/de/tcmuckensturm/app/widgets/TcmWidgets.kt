/*
 * Die drei Widgets der App (Glance)
 *
 * Wie TCMWidgets/Erweiterung/TCMWidgets.swift der iOS-App: "Meine nächsten
 * Spiele", "Plätze jetzt" und "Nächste Veranstaltung". Alle lesen denselben
 * Schnappschuss (WidgetAblage) und zeichnen neu, wenn er sich aendert oder
 * die WidgetArbeit laeuft (WidgetAnzeige.jetzt) - Realtime gibt es hier nicht.
 *
 * Ein Tippen oeffnet die App ueber das eigene URL-Schema der Variante
 * (WidgetLink); HauptActivity gibt den Pfad an die PushZentrale (PushZiel.ausPfad).
 *
 * Anmeldung im Manifest, Groessen und Vorschau in res/xml/widget_*.xml.
 */

package de.tcmuckensturm.app.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.glance.GlanceId
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import de.tcmuckensturm.app.BuildConfig
import de.tcmuckensturm.app.HauptActivity
import de.tcmuckensturm.app.daten.Sitzungsspeicher
import java.time.Instant

/** Gemeinsam: Schnappschuss lesen, Zustand und Uhrzeit bereitstellen, Links bauen. */
abstract class TcmWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val ablage = WidgetAblage.fuer(context)
        val sitzungen = Sitzungsspeicher.fuer(context)
        val anfang = ablage.lesen()
        val angemeldet = sitzungen.vorhanden()
        provideContent {
            val s by ablage.stand.collectAsState(anfang)
            val jetzt by WidgetAnzeige.jetzt.collectAsState()
            // Ohne Schnappschuss: abgemeldet oder nur noch nichts geladen? Danach richtet sich der Hinweis.
            val vorhanden by produceState(angemeldet, s) { value = sitzungen.vorhanden() }
            // Nie aelter als der letzte Lauf, aber auch nicht vor dem Laden des Schnappschusses.
            val uhr = maxOf(jetzt, Instant.now())
            Inhalt(WidgetZustand.aus(s, vorhanden), uhr)
        }
    }

    @Composable
    abstract fun Inhalt(zustand: WidgetZustand, jetzt: Instant)

    companion object {
        /** Oeffnet die App am Pfad - ueber das eigene Schema, wie ein Link von aussen. */
        fun oeffnen(context: Context, pfad: String): Action? {
            val url = WidgetLink.url(pfad, BuildConfig.URL_SCHEMA) ?: return null
            val absicht = Intent(Intent.ACTION_VIEW, url.toUri()).setClass(context, HauptActivity::class.java)
            return actionStartActivity(absicht)
        }

        /** Klein, mittel und gross wie in iOS - etwa 2×2, 4×2 und 4×4 Zellen. */
        val KLEIN = DpSize(110.dp, 110.dp)
        val MITTEL = DpSize(WidgetGroesse.MITTEL_AB_BREITE.dp, 110.dp)
        val GROSS = DpSize(WidgetGroesse.MITTEL_AB_BREITE.dp, WidgetGroesse.GROSS_AB_HOEHE.dp)
    }
}

@Composable
private fun familie(): WidgetFamilie = LocalSize.current.let { WidgetGroesse.familie(it.width.value, it.height.value) }

class SpieleWidget : TcmWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(KLEIN, MITTEL))

    @Composable
    override fun Inhalt(zustand: WidgetZustand, jetzt: Instant) {
        val f = familie()
        SpieleWidgetAnsicht(zustand, jetzt, f, oeffnen(LocalContext.current, WidgetZiele.spiele(zustand)))
    }
}

class PlaetzeWidget : TcmWidget() {
    /** Genau: die Zeitleiste rechnet mit der echten Breite. */
    override val sizeMode = SizeMode.Exact

    @Composable
    override fun Inhalt(zustand: WidgetZustand, jetzt: Instant) {
        val groesse = LocalSize.current
        PlaetzeWidgetAnsicht(
            zustand, jetzt, familie(), groesse.width.value, oeffnen(LocalContext.current, WidgetZiele.plaetze(zustand)),
        )
    }
}

class VeranstaltungWidget : TcmWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(KLEIN, MITTEL))

    @Composable
    override fun Inhalt(zustand: WidgetZustand, jetzt: Instant) {
        VeranstaltungWidgetAnsicht(
            zustand, jetzt, familie(), oeffnen(LocalContext.current, WidgetZiele.veranstaltung(zustand, jetzt)),
        )
    }
}

// ---- Empfaenger (Manifest) ----------------------------------------------------------

/**
 * Liegt ein Widget neu auf dem Home-Bildschirm (oder startet das Geraet), laedt
 * die WidgetArbeit sofort; das letzte entfernte bestellt sie ab.
 */
abstract class TcmWidgetEmpfaenger : GlanceAppWidgetReceiver() {
    // Ohne goAsync: das nimmt sich GlanceAppWidgetReceiver selbst, und einplanen geht sofort.
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetPlanung.sofort(context.applicationContext)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        if (!WidgetAnzeige.vorhanden(context)) WidgetPlanung.abbestellen(context.applicationContext)
    }
}

class SpieleWidgetEmpfaenger : TcmWidgetEmpfaenger() {
    override val glanceAppWidget: GlanceAppWidget = SpieleWidget()
}

class PlaetzeWidgetEmpfaenger : TcmWidgetEmpfaenger() {
    override val glanceAppWidget: GlanceAppWidget = PlaetzeWidget()
}

class VeranstaltungWidgetEmpfaenger : TcmWidgetEmpfaenger() {
    override val glanceAppWidget: GlanceAppWidget = VeranstaltungWidget()
}
