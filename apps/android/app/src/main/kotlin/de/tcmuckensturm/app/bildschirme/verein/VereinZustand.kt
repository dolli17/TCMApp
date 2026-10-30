/*
 * Was der Tab Verein ueber einen Bildschirm hinaus behaelt
 *
 * Wie VereinZustand in Bildschirme/Verein/VereinBildschirm.swift der iOS-App:
 * der gewaehlte Reiter (gemerkt unter tcm-verein-reiter, beim ersten Mal die
 * Getraenke) und der Getraenkekorb (U17). Der Korb uebersteht Reiter- und
 * Tab-Wechsel; wer mit vollem Korb geht, bekommt eine Erinnerung mit dem Weg
 * zurueck. Bewusst nur im Speicher - HauptTabs haelt den Zustand, mit dem
 * Abmelden ist er weg, und der Naechste auf dem Geraet erbt keinen Korb.
 *
 * VereinTab haengt das an die Tabs: stellt Zustand und LocalZuVerein bereit
 * und zeigt die Erinnerung, auch wenn schon ein anderer Tab offen ist.
 */

package de.tcmuckensturm.app.bildschirme.verein

import android.content.Context
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import androidx.navigation.NavHostController
import de.tcmuckensturm.app.daten.Getraenk
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Getraenke
import de.tcmuckensturm.kern.Getraenkekorb

/** Wohin ein Sprung in den Verein fuehrt (Home, Neuigkeiten, Glocke). */
sealed interface VereinZiel {
    data object Getraenke : VereinZiel

    data object Veranstaltungen : VereinZiel

    data class Veranstaltung(val id: String) : VereinZiel
}

/** Wo der Reiter gemerkt wird - in der App SharedPreferences, in Tests eine Map. */
interface Reiterspeicher {
    fun lesen(): String?

    fun schreiben(wert: String)
}

class VereinZustand(private val speicher: Reiterspeicher) {
    var reiter: VereinReiter by mutableStateOf(VereinReiter.aus(speicher.lesen()))
        private set

    var korb: Getraenkekorb by mutableStateOf(emptyMap())

    /** Die zuletzt geladene Karte - fuer die Erinnerung, auch wenn der Bildschirm weg ist. */
    var karte: List<Getraenk> by mutableStateOf(emptyList())

    /** Text der Rueckfrage "Noch nicht eingetragen", solange sie offen ist. */
    var erinnerung: String? by mutableStateOf(null)

    /** Fuer den Avatar im Kopf; laedt der Reiter, der gerade offen ist. */
    var ich: Ich? by mutableStateOf(null)

    val korbSumme: Pair<Int, Int>
        get() = Getraenke.basketSummary(karte, korb).let { it.count to it.totalCents }

    /** Reiter wechseln; wer die Getraenke mit vollem Korb verlaesst, wird erinnert. */
    fun wechsle(neu: VereinReiter) {
        if (reiter == VereinReiter.GETRAENKE && neu != VereinReiter.GETRAENKE) erinnereAnKorb()
        reiter = neu
        speicher.schreiben(neu.wert)
    }

    /** Stellt den Reiter fuer ein Ziel ein; die Navigation dorthin macht oeffne(nav, ...). */
    fun oeffne(ziel: VereinZiel) {
        wechsle(if (ziel == VereinZiel.Getraenke) VereinReiter.GETRAENKE else VereinReiter.VERANSTALTUNGEN)
    }

    /** Der Korb bleibt; die Rueckfrage bietet nur den Weg zurueck an. */
    fun erinnereAnKorb() {
        val (stueck, betrag) = korbSumme
        if (stueck > 0) erinnerung = VereinLogik.erinnerung(stueck, betrag)
    }

    companion object {
        const val REITER_SCHLUESSEL = "tcm-verein-reiter"
    }
}

/** Der Reiter in den SharedPreferences der App (kein Geheimnis, wie UserDefaults in iOS). */
private class Einstellungsspeicher(context: Context) : Reiterspeicher {
    private val prefs = context.getSharedPreferences("tcm-verein", Context.MODE_PRIVATE)

    override fun lesen(): String? = prefs.getString(VereinZustand.REITER_SCHLUESSEL, null)

    override fun schreiben(wert: String) = prefs.edit { putString(VereinZustand.REITER_SCHLUESSEL, wert) }
}

val LocalVereinZustand = staticCompositionLocalOf<VereinZustand> { error("VereinTab fehlt") }

/**
 * Springt in den Verein - wie `zuVerein` in der iOS-App. Home und Neuigkeiten
 * rufen `LocalZuVerein.current(VereinZiel.Veranstaltung(id))`.
 */
val LocalZuVerein = staticCompositionLocalOf<(VereinZiel) -> Unit> { {} }

/**
 * Haengt den Verein an die Tabs (HauptTabs): stellt den Zustand und
 * LocalZuVerein bereit und erinnert beim Tab-Wechsel an einen vollen Korb.
 */
@Composable
fun VereinTab(
    nav: NavHostController,
    vereinOffen: Boolean,
    zuTab: (HauptTab) -> Unit,
    inhalt: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val zustand = remember { VereinZustand(Einstellungsspeicher(context.applicationContext)) }
    val zuVerein: (VereinZiel) -> Unit = { ziel ->
        zustand.oeffne(ziel)
        zuTab(HauptTab.VEREIN)
        // Der Stapel des Tabs beginnt wieder bei der Liste, darueber hoechstens die eine Veranstaltung.
        nav.popBackStack(VereinStart, inclusive = false)
        if (ziel is VereinZiel.Veranstaltung) nav.navigate(VeranstaltungZiel(ziel.id))
    }

    var warOffen by remember { mutableStateOf(vereinOffen) }
    LaunchedEffect(vereinOffen) {
        if (warOffen && !vereinOffen && zustand.reiter == VereinReiter.GETRAENKE) zustand.erinnereAnKorb()
        warOffen = vereinOffen
    }

    CompositionLocalProvider(LocalVereinZustand provides zustand, LocalZuVerein provides zuVerein) {
        inhalt()
        zustand.erinnerung?.let { text ->
            Erinnerung(
                text = text,
                spaeter = { zustand.erinnerung = null },
                zuGetraenken = {
                    zustand.erinnerung = null
                    zuVerein(VereinZiel.Getraenke)
                },
            )
        }
    }
}

/** Die Rueckfrage "Noch nicht eingetragen" (Alert in iOS). */
@Composable
fun Erinnerung(text: String, spaeter: () -> Unit, zuGetraenken: () -> Unit) {
    val f = TcmTheme.farben
    AlertDialog(
        onDismissRequest = spaeter,
        title = { Text("Noch nicht eingetragen", style = TcmSchrift.text(Schrift.gewichtFett, Schrift.titel)) },
        text = { Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal), color = f.ink2) },
        confirmButton = {
            TextButton(onClick = zuGetraenken) {
                Text("Zu den Getränken", style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal), color = f.blueInk)
            }
        },
        dismissButton = {
            TextButton(onClick = spaeter) {
                Text("Später", style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.normal), color = f.ink2)
            }
        },
        containerColor = f.surf,
    )
}
