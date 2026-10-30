/*
 * Was die Widgets zeigen: ein kleiner Schnappschuss als Datei der App
 *
 * Wie TCMWidgets/Gemeinsam/Schnappschuss.swift der iOS-App. Die App legt ihn
 * nach jedem Laden von Home (und der Veranstaltungen) ab (WidgetBruecke), die
 * WidgetArbeit nach jedem eigenen Laden im Zeitplan. Widgets, App und Arbeit
 * laufen im selben Prozess - eine Datei unter noBackupFilesDir reicht, eine
 * App Group wie in iOS braucht es nicht.
 *
 * Darin steht nur, was die App ohnehin zeigt: die eigenen Termine mit den
 * Namen der Mitspieler, die Belegung des Tages ohne Namen (nur die Art, wie
 * im Raster farbig) und die naechsten Veranstaltungen. Keine Bankdaten,
 * keine Nachrichten, keine Namen Fremder ausser den eigenen Mitspielern.
 */

package de.tcmuckensturm.app.widgets

import android.content.Context
import de.tcmuckensturm.app.bildschirme.home.FreiDaten
import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.kern.BelegterSlot
import de.tcmuckensturm.kern.Belegungsmerkmale
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Veranstaltungen
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.Zeitraum
import java.io.File
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json

/** Zeitpunkte als ISO-Text ("2026-09-28T12:00:00Z"), lesbar fuer Menschen und andere Werkzeuge. */
object InstantAlsText : KSerializer<Instant> {
    override val descriptor = PrimitiveSerialDescriptor("de.tcmuckensturm.app.widgets.Instant", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Instant = Instant.parse(decoder.decodeString())

    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())
}

@Serializable
data class WidgetSchnappschuss(
    /** Steigt, wenn sich das Format so aendert, dass alte Dateien nicht mehr passen. */
    val version: Int = AKTUELLE_VERSION,
    /** Wann geladen wurde */
    @Serializable(InstantAlsText::class) val stand: Instant,
    /** Kommende eigene Termine, der naechste zuerst; null, wenn sie nie geladen werden konnten. */
    val termine: List<WidgetTermin>? = null,
    /** Belegung eines Tages; null, wenn sie nie geladen werden konnte. */
    val plan: WidgetPlan? = null,
    /** Die naechsten Veranstaltungen; null, wenn sie nie geladen werden konnten. */
    val veranstaltungen: List<WidgetVeranstaltung>? = null,
) {
    /**
     * Neu ueber alt: Was diesmal nicht geladen werden konnte (null), bleibt
     * aus dem alten Schnappschuss stehen - ein Netzfehler leert kein Widget.
     */
    fun ueber(alt: WidgetSchnappschuss?): WidgetSchnappschuss {
        if (alt == null) return this
        return copy(
            termine = termine ?: alt.termine,
            plan = plan ?: alt.plan,
            veranstaltungen = veranstaltungen ?: alt.veranstaltungen,
        )
    }

    /** Gleich bis auf den Zeitpunkt des Ladens. */
    fun gleicherInhalt(b: WidgetSchnappschuss): Boolean = this == b.copy(stand = stand)

    companion object {
        const val AKTUELLE_VERSION = 1

        /** So viele Termine und Veranstaltungen nimmt der Schnappschuss mit. */
        const val HOECHSTENS_TERMINE = 5
        const val HOECHSTENS_VERANSTALTUNGEN = 3

        private val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

        fun kodieren(s: WidgetSchnappschuss): String = json.encodeToString(serializer(), s)

        /** null bei fremder Version oder kaputter Datei - dann gilt: kein Schnappschuss. */
        fun dekodieren(text: String): WidgetSchnappschuss? =
            runCatching { json.decodeFromString(serializer(), text) }.getOrNull()?.takeIf { it.version == AKTUELLE_VERSION }

        /**
         * Baut den Schnappschuss aus dem, was Home (bzw. die WidgetArbeit) geladen hat.
         * null heisst "konnte nicht geladen werden" und bleibt null.
         */
        fun aus(
            termine: List<MeineBuchung>?,
            frei: FreiDaten?,
            events: List<MitgliedEvent>?,
            jetzt: Instant,
        ): WidgetSchnappschuss = WidgetSchnappschuss(
            stand = jetzt,
            termine = termine?.let { liste ->
                Startseite.upcomingBookings(liste, jetzt).take(HOECHSTENS_TERMINE).map { b ->
                    WidgetTermin(
                        id = b.bookingId,
                        startsAt = b.startsAt,
                        endsAt = b.endsAt,
                        platz = b.courtName ?: "",
                        art = b.typeName ?: "",
                        mit = HomeLogik.mitText(b),
                    )
                }
            },
            plan = frei?.let(::plan),
            veranstaltungen = events?.let { liste ->
                Veranstaltungen.eventDemnaechst(liste, jetzt, HOECHSTENS_VERANSTALTUNGEN).map { e ->
                    WidgetVeranstaltung(
                        id = e.id,
                        titel = e.title ?: "",
                        startsAt = e.startsAt,
                        endsAt = e.endsAt,
                        zeit = Veranstaltungen.eventKartenZeit(e),
                        marke = Veranstaltungen.eventMeineMarke(e, jetzt, aufforderung = true)?.text,
                    )
                }
            },
        )

        private fun plan(d: FreiDaten): WidgetPlan = WidgetPlan(
            tag = d.heute,
            // Dieselben Rueckfaelle wie HomeLogik.jetztFreiKarten
            oeffnung = Zeit.timeToMinutes(d.einstellungen?.openingTime ?: "08:00"),
            schluss = Zeit.timeToMinutes(d.einstellungen?.closingTime ?: "21:00"),
            raster = d.einstellungen?.slotMinutes ?: 30,
            dauer = d.dauer,
            vorlaufTage = d.einstellungen?.leadDays,
            plaetze = d.plaetze.map { WidgetPlatz(it.id, it.name ?: it.shortName ?: "") },
            belegungen = d.belegung.map { b ->
                WidgetBelegung(
                    courtId = b.courtId,
                    startsAt = b.startsAt,
                    endsAt = b.endsAt,
                    kind = b.kind,
                    isOwn = b.isOwn,
                    partnerWanted = b.partnerWanted,
                    frei = b.frei,
                    seriesId = b.seriesId,
                )
            },
        )
    }
}

/** Ein eigener Termin aus my_bookings. */
@Serializable
data class WidgetTermin(
    val id: String,
    override val startsAt: String,
    override val endsAt: String,
    val platz: String,
    val art: String,
    /** "mit A, B", "Du hast gebucht" oder "von X" (HomeLogik.mitText) */
    val mit: String,
) : Zeitraum

/** Ein Platz, wie courts_aktiv ihn liefert. */
@Serializable
data class WidgetPlatz(val id: String, val name: String)

/** Eine Belegung aus day_schedule - ohne Namen, nur was Art und Lage braucht. */
@Serializable
data class WidgetBelegung(
    override val courtId: String,
    override val startsAt: String,
    override val endsAt: String,
    override val kind: String? = null,
    override val isOwn: Boolean? = null,
    override val partnerWanted: Boolean? = null,
    override val frei: Int? = null,
    override val seriesId: String? = null,
) : BelegterSlot, Belegungsmerkmale

/** Die Belegung eines Berliner Tages mit den Regeln aus booking_settings. */
@Serializable
data class WidgetPlan(
    /** "2026-10-29" */
    val tag: String,
    val oeffnung: Int,
    val schluss: Int,
    val raster: Int,
    /** Dauer der ersten Buchungsart, sonst 60 (wie "Jetzt frei" auf Home) */
    val dauer: Int,
    val vorlaufTage: Int? = null,
    val plaetze: List<WidgetPlatz>,
    val belegungen: List<WidgetBelegung>,
)

/** Eine Veranstaltung, schon fuer die Anzeige aufbereitet. */
@Serializable
data class WidgetVeranstaltung(
    val id: String,
    val titel: String,
    val startsAt: String,
    val endsAt: String? = null,
    /** "Fr 19 Uhr · Clubhaus" (eventKartenZeit) */
    val zeit: String,
    /** "Angemeldet", "Warteliste", "Anmelden" oder null (eventMeineMarke) */
    val marke: String? = null,
)

// ---- Ablage -------------------------------------------------------------------

/**
 * Liest und schreibt den Schnappschuss als JSON-Datei. Ein Mutex je Datei,
 * weil App und WidgetArbeit im selben Prozess gleichzeitig schreiben koennen;
 * geschrieben wird ueber eine Zwischendatei, damit nie eine halbe Datei liegt.
 *
 * `stand` meldet jede Aenderung an die Widgets, die gerade zeichnen.
 */
class WidgetAblage(private val datei: File) {
    private val sperre = Mutex()
    private val _stand = MutableStateFlow<WidgetSchnappschuss?>(null)
    private var gelesen = false

    /** Was zuletzt gelesen oder geschrieben wurde. */
    val stand: StateFlow<WidgetSchnappschuss?> = _stand.asStateFlow()

    suspend fun lesen(): WidgetSchnappschuss? = sperre.withLock { lesenOhneSperre() }

    /** Schreibt neu ueber alt (siehe `ueber`) und gibt zurueck, was jetzt gilt. */
    suspend fun speichern(neu: WidgetSchnappschuss): WidgetSchnappschuss = sperre.withLock {
        val gesamt = neu.ueber(lesenOhneSperre())
        datei.parentFile?.mkdirs()
        val zwischen = File(datei.parentFile, "${datei.name}.neu")
        zwischen.writeText(WidgetSchnappschuss.kodieren(gesamt))
        if (!zwischen.renameTo(datei)) {
            zwischen.delete()
            error("Schnappschuss nicht geschrieben")
        }
        _stand.value = gesamt
        gesamt
    }

    suspend fun loeschen() = sperre.withLock {
        datei.delete()
        gelesen = true
        _stand.value = null
    }

    private fun lesenOhneSperre(): WidgetSchnappschuss? {
        if (gelesen) return _stand.value
        val s = runCatching { datei.readText() }.getOrNull()?.let(WidgetSchnappschuss::dekodieren)
        _stand.value = s
        gelesen = true
        return s
    }

    companion object {
        const val DATEINAME = "widget-schnappschuss.json"

        @Volatile private var instanz: WidgetAblage? = null

        /** Die eine Ablage je Prozess - nicht in der Sicherung (noBackupFilesDir). */
        fun fuer(context: Context): WidgetAblage =
            instanz ?: synchronized(this) {
                instanz ?: WidgetAblage(File(context.applicationContext.noBackupFilesDir, DATEINAME)).also { instanz = it }
            }
    }
}
