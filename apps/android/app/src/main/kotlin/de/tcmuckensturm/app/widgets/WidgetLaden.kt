/*
 * Daten fuer die Widgets laden und ablegen
 *
 * Wie TCMWidgets/Gemeinsam/WidgetLaden.swift der iOS-App:
 * - WidgetBruecke (App): nach jedem Laden von Home und der Veranstaltungen
 *   den Schnappschuss ablegen und die Widgets neu zeichnen lassen; beim
 *   Abmelden alles vergessen.
 * - WidgetArbeit (WorkManager): im Zeitplan selbst laden (WidgetZeitplan:
 *   alle 30 Minuten, kurz nach dem Ende des naechsten Spiels, zu seinem
 *   Beginn und um Mitternacht in Berlin). Ein Widget abonniert nichts
 *   (docs/native/app-api.md, Realtime).
 *
 * Die Sitzung: Widgets und Arbeit laufen im Prozess der App und nehmen deren
 * einen Client (TcmApp.sitzung). Erneuert wird das Token also nur an einer
 * Stelle, von supabase-kt selbst - kein zweiter Client, der mit demselben
 * Refresh-Token um die Wette erneuert und den anderen abmeldet.
 *
 * Beide bauen den Schnappschuss mit WidgetSchnappschuss.aus - aus denselben
 * RPCs wie Home und Verein: my_bookings, courts_aktiv, day_schedule,
 * booking_settings, booking_types_aktiv, events_fuer_mitglied; dazu
 * mein_zugang, damit ein Konto ohne Zugang nichts mehr zeigt.
 */

package de.tcmuckensturm.app.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import de.tcmuckensturm.app.TcmApp
import de.tcmuckensturm.app.bildschirme.home.FreiDaten
import de.tcmuckensturm.app.bildschirme.home.HomeInhalt
import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Buchungsart
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.Startdaten
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.daten.Vereinsdaten
import de.tcmuckensturm.app.daten.Zugangsdaten
import de.tcmuckensturm.app.start.StartLogik
import de.tcmuckensturm.app.start.StartZiel
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Zeit
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ---- Laden --------------------------------------------------------------------

/** Woher die WidgetArbeit liest - in der App Supabase, in Tests eine Attrappe. */
interface WidgetQuelle {
    /** false: keine Sitzung (oder sie gilt nicht mehr). */
    suspend fun angemeldet(): Boolean

    /** Wohin die Weiche mit mein_zugang fuehrte; faellt das Lesen aus, wie StartLogik: in die Tabs. */
    suspend fun zugang(): StartZiel

    suspend fun meineBuchungen(): List<MeineBuchung>

    suspend fun plaetze(): List<AktiverPlatz>

    suspend fun tagesplan(tag: String): List<TagesBelegung>

    suspend fun buchungseinstellungen(): Buchungseinstellungen?

    suspend fun buchungsarten(): List<Buchungsart>

    suspend fun veranstaltungen(): List<MitgliedEvent>
}

/** Die Quelle der App: der eine Client aus TcmApp, dieselben RPCs wie Home und Verein. */
class SupabaseWidgetQuelle(private val client: SupabaseClient) : WidgetQuelle {
    private val start = Startdaten(client)
    private val verein = Vereinsdaten(client)

    override suspend fun angemeldet(): Boolean {
        // Laedt die Sitzung aus dem Sitzungsspeicher; ist das Token abgelaufen,
        // erneuert supabase-kt es dabei (oder spaetestens beim ersten Aufruf).
        client.auth.awaitInitialization()
        return client.auth.currentSessionOrNull() != null
    }

    override suspend fun zugang(): StartZiel = StartLogik.ziel(angemeldet = true, zugang = Zugangsdaten(client).meinZugang())

    override suspend fun meineBuchungen() = start.meineBuchungen()

    override suspend fun plaetze() = start.plaetze()

    override suspend fun tagesplan(tag: String) = start.tagesplan(tag)

    override suspend fun buchungseinstellungen() = start.buchungseinstellungen()

    override suspend fun buchungsarten() = start.buchungsarten()

    override suspend fun veranstaltungen() = verein.veranstaltungen()
}

object WidgetLaden {
    sealed interface Ergebnis {
        data class Geladen(val schnappschuss: WidgetSchnappschuss) : Ergebnis

        /** Keine Sitzung oder kein Zugang */
        data object Abgemeldet : Ergebnis

        /** Kein Netz, Server gestoert, nichts ging */
        data object Fehler : Ergebnis
    }

    /** Ein Fehler wird null - wie `try?` in iOS. */
    private suspend fun <T> oderNull(laden: suspend () -> T): T? = try {
        laden()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    suspend fun laden(quelle: WidgetQuelle, jetzt: Instant = Instant.now()): Ergebnis = coroutineScope {
        val angemeldet = oderNull { quelle.angemeldet() } ?: return@coroutineScope Ergebnis.Fehler
        if (!angemeldet) return@coroutineScope Ergebnis.Abgemeldet
        if (oderNull { quelle.zugang() } is StartZiel.KeinZugang) return@coroutineScope Ergebnis.Abgemeldet

        val heute = Zeit.berlinDay(jetzt)
        val meine = async { oderNull { quelle.meineBuchungen() } }
        val plaetze = async { oderNull { quelle.plaetze() } }
        val plan = async { oderNull { quelle.tagesplan(heute) } }
        // Ohne Zeile ist null ein Wert (Rueckfaelle wie Home) - "nicht geladen" ist das Fehlen des Ergebnisses.
        val einstellungen = async { oderNull { Result.success(quelle.buchungseinstellungen()) } }
        val arten = async { oderNull { quelle.buchungsarten() } }
        val events = async { oderNull { quelle.veranstaltungen() } }

        val m = meine.await()
        val p = plaetze.await()
        val t = plan.await()
        val e = einstellungen.await()
        val a = arten.await()
        val v = events.await()
        // Wie "Jetzt frei" auf Home: vier Quellen, fehlt eine, fehlt der Plan.
        val frei = if (p != null && t != null && e != null && a != null) {
            FreiDaten(heute, p, t, e.getOrNull(), a.firstOrNull()?.durationMinutes ?: 60)
        } else {
            null
        }
        if (m == null && frei == null && v == null) return@coroutineScope Ergebnis.Fehler
        Ergebnis.Geladen(WidgetSchnappschuss.aus(termine = m, frei = frei, events = v, jetzt = jetzt))
    }

    /** Was ein Lauf der WidgetArbeit ergab: was jetzt gilt und wann der naechste kommt (null: keiner). */
    data class Lauf(val schnappschuss: WidgetSchnappschuss?, val naechster: Instant?)

    /**
     * Ein Lauf ohne WorkManager: laedt, wenn der Schnappschuss nicht mehr frisch
     * ist, und legt ab. Ohne Sitzung wird der Schnappschuss geloescht - auf dem
     * Home-Bildschirm bleibt dann kein Termin stehen - und bis zur naechsten
     * Anmeldung (Home legt ab und plant neu) laeuft nichts mehr.
     */
    suspend fun lauf(ablage: WidgetAblage, quelle: WidgetQuelle?, jetzt: Instant = Instant.now()): Lauf {
        var s = ablage.lesen()
        if (quelle == null) return Lauf(s, null)
        if (WidgetZeitplan.mussLaden(s?.stand, jetzt)) {
            when (val e = laden(quelle, jetzt)) {
                is Ergebnis.Geladen -> s = ablage.speichern(e.schnappschuss)
                Ergebnis.Abgemeldet -> {
                    ablage.loeschen()
                    return Lauf(null, null)
                }
                Ergebnis.Fehler -> Unit
            }
        }
        return Lauf(s, WidgetZeitplan.naechsterLauf(s?.termine.orEmpty(), jetzt))
    }
}

// ---- WorkManager ----------------------------------------------------------------

/** Laedt im Zeitplan, zeichnet die Widgets neu und plant den naechsten Lauf. */
class WidgetArbeit(context: Context, parameter: WorkerParameters) : CoroutineWorker(context, parameter) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            val quelle = TcmApp.aus(ctx).sitzung?.client?.let(::SupabaseWidgetQuelle)
            val lauf = WidgetLaden.lauf(WidgetAblage.fuer(ctx), quelle)
            WidgetAnzeige.aktualisieren(ctx)
            // Angehaengt statt ersetzt: REPLACE braeche diesen Lauf ab, der gerade noch laeuft.
            lauf.naechster?.let { WidgetPlanung.planen(ctx, it, ExistingWorkPolicy.APPEND_OR_REPLACE) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Nie scheitern: ein gescheiterter Lauf nimmt den angehaengten naechsten mit.
            WidgetPlanung.planen(ctx, Instant.now().plus(WidgetZeitplan.TAKT), ExistingWorkPolicy.APPEND_OR_REPLACE)
        }
        return Result.success()
    }
}

object WidgetPlanung {
    const val NAME = "tcm-widgets"

    /** Plant den naechsten Lauf, nur wenn ein Widget auf dem Home-Bildschirm liegt. */
    fun planen(context: Context, wann: Instant, art: ExistingWorkPolicy = ExistingWorkPolicy.REPLACE) {
        if (!WidgetAnzeige.vorhanden(context)) return abbestellen(context)
        val warten = Duration.between(Instant.now(), wann).toMillis().coerceAtLeast(0)
        val auftrag = OneTimeWorkRequestBuilder<WidgetArbeit>()
            .setInitialDelay(warten, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NAME, art, auftrag)
    }

    /** Gleich laden (ein Widget wurde gerade hingelegt). */
    fun sofort(context: Context) = planen(context, Instant.now())

    fun abbestellen(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(NAME)
    }
}

// ---- Anzeige --------------------------------------------------------------------

/** Die drei Widgets zusammen: neu zeichnen und nachsehen, ob eines liegt. */
object WidgetAnzeige {
    private val _jetzt = MutableStateFlow(Instant.now())

    /**
     * Die Uhrzeit, fuer die gezeichnet wird. Glance zeichnet nur bei einer
     * Aenderung neu; jeder Lauf setzt sie, damit "in 2 Stunden" weiterrueckt.
     */
    val jetzt: StateFlow<Instant> = _jetzt.asStateFlow()

    suspend fun aktualisieren(context: Context) {
        _jetzt.value = Instant.now()
        SpieleWidget().updateAll(context)
        PlaetzeWidget().updateAll(context)
        VeranstaltungWidget().updateAll(context)
    }

    /** Liegt eines der drei auf dem Home-Bildschirm? Ohne suspend - auch aus einem Empfaenger. */
    fun vorhanden(context: Context): Boolean {
        val m = AppWidgetManager.getInstance(context) ?: return false
        return listOf(SpieleWidgetEmpfaenger::class.java, PlaetzeWidgetEmpfaenger::class.java, VeranstaltungWidgetEmpfaenger::class.java)
            .any { m.getAppWidgetIds(ComponentName(context, it)).isNotEmpty() }
    }
}

// ---- Bruecke aus der App ----------------------------------------------------------

object WidgetBruecke {
    /** Legt ab, was Home geladen hat. Neu gezeichnet wird nur, wenn sich etwas geaendert hat. */
    suspend fun ablegen(context: Context, inhalt: HomeInhalt, jetzt: Instant = Instant.now()) =
        ablegen(context, WidgetSchnappschuss.aus(inhalt.termine.wert, inhalt.frei.wert, events = null, jetzt = jetzt))

    /** Legt die Veranstaltungen ab, die der Verein geladen hat (Home laedt auf Android keine). */
    suspend fun veranstaltungenAblegen(context: Context, events: List<MitgliedEvent>, jetzt: Instant = Instant.now()) =
        ablegen(context, WidgetSchnappschuss.aus(termine = null, frei = null, events = events, jetzt = jetzt))

    private suspend fun ablegen(context: Context, neu: WidgetSchnappschuss) {
        try {
            val ablage = WidgetAblage.fuer(context)
            val alt = ablage.lesen()
            val gesamt = ablage.speichern(neu)
            if (alt == null || !alt.gleicherInhalt(gesamt)) WidgetAnzeige.aktualisieren(context)
            // Termine koennen sich geaendert haben: den naechsten Lauf neu legen.
            WidgetPlanung.planen(context, WidgetZeitplan.naechsterLauf(gesamt.termine.orEmpty(), Instant.now()))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Das Widget ist Beiwerk: scheitert die Ablage, merkt die App davon nichts.
        }
    }

    /** Beim Abmelden: kein Termin bleibt auf dem Home-Bildschirm stehen. */
    suspend fun vergessen(context: Context) {
        try {
            WidgetAblage.fuer(context).loeschen()
            WidgetPlanung.abbestellen(context)
            WidgetAnzeige.aktualisieren(context)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Die Datei ist weg (zuerst geloescht); scheitert nur das Neuzeichnen, holt es der naechste Lauf nach.
        }
    }
}
