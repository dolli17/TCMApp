package de.tcmuckensturm.app.widgets

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.glance.appwidget.provideContent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.widgets.WidgetBeispiel.JETZT
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bilder der Widgets ohne Geraet und ohne Widget-Host: Glance rechnet die
 * Ansicht in RemoteViews um (GlanceAppWidget.compose), Robolectric blaest sie
 * auf, Roborazzi fotografiert die Tafel - wie WidgetBilderTests.swift, mit den
 * Beispieldaten um 14:00. Groessen wie auf einem Pixel mit 412 dp Breite.
 *
 * `./gradlew test` zeichnet nur; die PNGs nach apps/android/docs schreibt
 * `./gradlew :app:recordRoborazziLokalDebug`.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// Hoeher als ein Pixel, damit die ganze Tafel auf ein Bild passt.
@Config(qualifiers = "w412dp-h1300dp-xxhdpi")
class WidgetBildschirmfotoTest {
    /** Ein Widget nur fuer das Bild: zeichnet, was es bekommt. */
    private class Probe(private val inhalt: @Composable () -> Unit) : GlanceAppWidget() {
        override suspend fun provideGlance(context: Context, id: GlanceId) = provideContent { inhalt() }
    }

    private val daten = WidgetZustand.Daten(WidgetBeispiel.schnappschuss())

    private val klein = DpSize(170.dp, 170.dp)
    private val mittel = DpSize(364.dp, 170.dp)
    private val gross = DpSize(364.dp, 382.dp)

    /** Die Ansicht als echte View in Groesse `groesse`. */
    private fun widget(context: Context, groesse: DpSize, inhalt: @Composable () -> Unit): View {
        val ansichten = runBlocking { Probe(inhalt).compose(context, size = groesse) }
        val dichte = context.resources.displayMetrics.density
        val rahmen = FrameLayout(context)
        rahmen.addView(ansichten.apply(context, rahmen))
        rahmen.layoutParams = LinearLayout.LayoutParams((groesse.width.value * dichte).toInt(), (groesse.height.value * dichte).toInt())
            .apply { topMargin = (14 * dichte).toInt() }
        // Wie der Launcher: die Ecken rund (unter Robolectric hat das Widget sie nicht selbst)
        rahmen.clipToOutline = true
        rahmen.background = GradientDrawable().apply { cornerRadius = 22 * dichte }
        return rahmen
    }

    private fun reihe(context: Context, vararg kinder: View): View = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        kinder.forEachIndexed { i, k ->
            if (i > 0) (k.layoutParams as LinearLayout.LayoutParams).marginStart = (14 * context.resources.displayMetrics.density).toInt()
            addView(k)
        }
    }

    private fun tafel(name: String, dunkel: Boolean) {
        if (dunkel) RuntimeEnvironment.setQualifiers("+night")
        ActivityScenario.launch(ComponentActivity::class.java).use { szenario ->
            szenario.onActivity { a ->
                val t = LinearLayout(a).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(36, 22, 36, 64)
                    setBackgroundColor(if (dunkel) Color.rgb(20, 20, 20) else Color.rgb(204, 219, 237))
                    addView(
                        reihe(
                            a,
                            widget(a, klein) { SpieleWidgetAnsicht(daten, JETZT, WidgetFamilie.KLEIN, null) },
                            widget(a, klein) { VeranstaltungWidgetAnsicht(daten, JETZT, WidgetFamilie.KLEIN, null) },
                        ),
                    )
                    addView(widget(a, mittel) { SpieleWidgetAnsicht(daten, JETZT, WidgetFamilie.MITTEL, null) })
                    addView(widget(a, mittel) { PlaetzeWidgetAnsicht(daten, JETZT, WidgetFamilie.MITTEL, mittel.width.value, null) })
                    addView(widget(a, gross) { PlaetzeWidgetAnsicht(daten, JETZT, WidgetFamilie.GROSS, gross.width.value, null) })
                    addView(
                        reihe(
                            a,
                            widget(a, klein) { SpieleWidgetAnsicht(WidgetZustand.Abgemeldet, JETZT, WidgetFamilie.KLEIN, null) },
                            widget(a, klein) { VeranstaltungWidgetAnsicht(WidgetZustand.KeineDaten, JETZT, WidgetFamilie.KLEIN, null) },
                        ),
                    )
                }
                a.setContentView(t, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                t.captureRoboImage("../docs/$name.png")
            }
        }
    }

    @Test
    fun widgetsHell() = tafel("widgets-hell", dunkel = false)

    @Test
    fun widgetsDunkel() = tafel("widgets-dunkel", dunkel = true)

    /** Einzelbilder fuer die Widget-Auswahl vor Android 12 (previewImage in res/xml/widget_*.xml). */
    @Test
    fun vorschaubilder() {
        ActivityScenario.launch(ComponentActivity::class.java).use { szenario ->
            szenario.onActivity { a ->
                val bilder = mapOf<String, Pair<DpSize, @Composable () -> Unit>>(
                    "vorschau_spiele" to (klein to { SpieleWidgetAnsicht(daten, JETZT, WidgetFamilie.KLEIN, null) }),
                    "vorschau_plaetze" to (mittel to { PlaetzeWidgetAnsicht(daten, JETZT, WidgetFamilie.MITTEL, mittel.width.value, null) }),
                    "vorschau_veranstaltung" to (klein to { VeranstaltungWidgetAnsicht(daten, JETZT, WidgetFamilie.KLEIN, null) }),
                )
                for ((name, b) in bilder) {
                    val v = widget(a, b.first, b.second).apply { (layoutParams as LinearLayout.LayoutParams).topMargin = 0 }
                    val halter = LinearLayout(a).apply { addView(v) }
                    a.setContentView(halter, ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                    v.captureRoboImage("src/main/res/drawable-nodpi/$name.png")
                }
            }
        }
    }
}
