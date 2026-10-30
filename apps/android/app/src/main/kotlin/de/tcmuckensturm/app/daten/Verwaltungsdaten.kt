/*
 * Was die Verwaltung von Supabase liest und schreibt
 *
 * Wie Bildschirme/Verwaltung/Verwaltungsdaten.swift der iOS-App und
 * apps/mobile/src/lib/verwaltung/plaetze.ts (ladePlaetze, sperre,
 * vorschauSerie, legeSerieAn, aendereSerie, beendeSerie), Vertrag:
 * docs/native/app-api.md, Abschnitt "Sperren und Serien". Nur RPCs; jede
 * davon prueft private.darf_plaetze() selbst. Die Blockungsarten kommen aus
 * booking_types_aktiv, Oeffnung und Schluss aus booking_settings.
 *
 * Lesen wirft den uebersetzten Satz als `Meldung`, Schreiben gibt ein
 * `PlatzErgebnis` zurueck und wirft nie (ausser beim Abbrechen).
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.app.bildschirme.verwaltung.PlatzJetzt
import de.tcmuckensturm.app.bildschirme.verwaltung.SerienEingabe
import de.tcmuckensturm.app.bildschirme.verwaltung.VerwaltungLogik
import de.tcmuckensturm.kern.DbFehler
import de.tcmuckensturm.kern.Zeit
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

// ---- Modelle --------------------------------------------------------------------

/** Eine Zeile aus court_overview, auch stillgelegte Plaetze. */
@Serializable
data class VerwalteterPlatz(
    val id: String,
    val name: String? = null,
    @SerialName("short_name") val shortName: String? = null,
    val subline: String? = null,
    @SerialName("sort_position") val sortPosition: Int? = null,
    val active: Boolean? = null,
    @SerialName("offene_buchungen") val offeneBuchungen: Int? = null,
) {
    val aktiv: Boolean get() = active ?: true
}

/** Eine Zeile aus series_overview. */
@Serializable
data class Serie(
    val id: String,
    @SerialName("court_name") val courtName: String? = null,
    @SerialName("type_name") val typeName: String? = null,
    val title: String? = null,
    val weekday: Int? = null,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("valid_from") val validFrom: String? = null,
    @SerialName("valid_to") val validTo: String? = null,
    val kuenftige: Int? = null,
)

/** Ein Termin aus preview_series; conflict_booking_id gesetzt heisst: da liegt etwas im Weg. */
@Serializable
data class SerienTermin(
    @SerialName("starts_at") val startsAt: String,
    @SerialName("ends_at") val endsAt: String,
    @SerialName("conflict_booking_id") val conflictBookingId: String? = null,
    @SerialName("conflict_member_name") val conflictMemberName: String? = null,
    @SerialName("conflict_kind") val conflictKind: String? = null,
)

/** Alles, was die Seite auf einmal laedt. */
data class VerwaltungsStand(
    val plaetze: List<VerwalteterPlatz>,
    /** Aktive Blockungsarten fuer Sperren und Serien, nach sort_order */
    val blockungsarten: List<Buchungsart>,
    val serien: List<Serie>,
    val zustand: Map<String, PlatzJetzt>,
    /** "HH:MM" */
    val oeffnung: String,
    val schluss: String,
) {
    val aktivePlaetze: List<VerwalteterPlatz> get() = plaetze.filter { it.aktiv }
}

/** Was create_blocking, create_series und update_series zurueckgeben. */
@Serializable
private data class Anzahlen(
    @SerialName("created_count") val createdCount: Int? = null,
    @SerialName("displaced_count") val displacedCount: Int? = null,
)

// ---- Quelle -----------------------------------------------------------------------

/**
 * Alles, was der Tab Verwaltung braucht. Verwaltungsdaten spricht mit
 * Supabase; die Bildschirmfotos und Tests nehmen eine Attrappe ohne Netz.
 */
interface VerwaltungsQuelle {
    /** ich() fuer den Namen oben und den Weg ins Web (admin). */
    suspend fun ich(): Ich?

    suspend fun laden(jetzt: Instant): VerwaltungsStand

    suspend fun sperre(
        platzIds: List<String>,
        tag: String,
        von: String,
        bis: String,
        artCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis

    /** Reine Leseoperation, aendert nichts - auch nicht bei Konflikten. Fehler als Meldung. */
    suspend fun vorschau(f: SerienEingabe): Result<List<SerienTermin>>

    suspend fun legeSerieAn(f: SerienEingabe, verdraengen: Boolean): PlatzErgebnis

    suspend fun aendereSerie(
        id: String,
        startTime: String,
        endTime: String,
        titel: String,
        validTo: String,
        verdraengen: Boolean,
    ): PlatzErgebnis

    suspend fun beendeSerie(id: String): PlatzErgebnis
}

// ---- Laden und Schreiben --------------------------------------------------------

class Verwaltungsdaten(private val client: SupabaseClient) : VerwaltungsQuelle {
    private val start = Startdaten(client)
    private val platzdaten = Platzdaten(client)

    private suspend fun rpc(name: String, parameter: JsonObject = JsonObject(emptyMap())) =
        client.postgrest.rpc(name, parameter)

    override suspend fun ich(): Ich? = Zugangsdaten(client).ich()

    /**
     * Plaetze, Arten, Serien, Einstellungen und der Tagesplan von heute.
     * Die Plaetze tragen die Seite; faellt nur der Tagesplan aus, fehlt bloss
     * der Zustand "gesperrt bis ...".
     */
    override suspend fun laden(jetzt: Instant): VerwaltungsStand = coroutineScope {
        val plaetze = async { plaetze() }
        val arten = async { platzdaten.blockungsarten() }
        val serien = async { serien() }
        val plan = async {
            try {
                start.tagesplan(Zeit.berlinDay(jetzt))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                emptyList()
            }
        }
        val einstellungen = async { start.buchungseinstellungen() }

        val p = plaetze.await()
        val e = einstellungen.await()
        VerwaltungsStand(
            plaetze = p,
            blockungsarten = arten.await(),
            serien = serien.await(),
            zustand = VerwaltungLogik.zustandJetzt(plan.await(), jetzt),
            oeffnung = VerwaltungLogik.uhrzeit(e?.openingTime, ersatz = "08:00"),
            schluss = VerwaltungLogik.uhrzeit(e?.closingTime, ersatz = "21:00"),
        )
    }

    private suspend fun plaetze(): List<VerwalteterPlatz> = try {
        rpc("court_overview").decodeList()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung("Die Plätze konnten nicht geladen werden. (${Meldung.aus(e).text})")
    }

    private suspend fun serien(): List<Serie> = try {
        rpc("series_overview").decodeList()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    // ---- Sperren --------------------------------------------------------------------

    /**
     * Einen Zeitraum auf mehreren Plaetzen sperren. Zweistufig: ohne
     * `verdraengen` lehnt die Datenbank ab, sobald Buchungen im Weg liegen,
     * und nennt ihre Zahl (`kollisionen`). Erst der zweite Aufruf raeumt sie weg.
     */
    override suspend fun sperre(
        platzIds: List<String>,
        tag: String,
        von: String,
        bis: String,
        artCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis {
        val zeiten = VerwaltungLogik.pruefeSperre(tag, von, bis)
            .getOrElse { return PlatzErgebnis(ok = false, meldung = it.message ?: VerwaltungLogik.KEINE_ZEIT) }
        return try {
            val zeilen = rpc(
                "create_blocking",
                buildJsonObject {
                    putJsonArray("p_court_ids") { platzIds.forEach { add(it) } }
                    put("p_von", Zeit.iso(zeiten.von))
                    put("p_bis", Zeit.iso(zeiten.bis))
                    put("p_type_code", artCode)
                    put("p_title", grund.trim())
                    put("p_force", verdraengen)
                },
            ).decodeList<Anzahlen>()
            PlatzErgebnis(
                ok = true,
                meldung = VerwaltungLogik.gesperrtMeldung(
                    angelegt = zeilen.firstOrNull()?.createdCount ?: 0,
                    verdraengt = zeilen.firstOrNull()?.displacedCount ?: 0,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val form = postgresFehler(e)
            PlatzErgebnis(ok = false, meldung = DbFehler.translateDbError(form), kollisionen = PlaetzeLogik.kollisionen(form.message ?: ""))
        }
    }

    // ---- Serien ---------------------------------------------------------------------

    override suspend fun vorschau(f: SerienEingabe): Result<List<SerienTermin>> {
        val w = VerwaltungLogik.pruefeSerie(f).getOrElse { return Result.failure(it) }
        return try {
            Result.success(
                rpc(
                    "preview_series",
                    buildJsonObject {
                        put("p_court_id", w.courtId)
                        put("p_weekday", w.weekday)
                        put("p_start_time", w.startTime)
                        put("p_end_time", w.endTime)
                        put("p_valid_from", w.validFrom)
                        put("p_valid_to", w.validTo)
                    },
                ).decodeList(),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Meldung.aus(e))
        }
    }

    /** Ohne `verdraengen` bricht die Datenbank bei einer Kollision ab. */
    override suspend fun legeSerieAn(f: SerienEingabe, verdraengen: Boolean): PlatzErgebnis {
        val w = VerwaltungLogik.pruefeSerie(f)
            .getOrElse { return PlatzErgebnis(ok = false, meldung = it.message ?: "Die Angaben stimmen nicht.") }
        return try {
            val zeilen = rpc(
                "create_series",
                buildJsonObject {
                    put("p_court_id", w.courtId)
                    put("p_booking_type_code", w.bookingTypeCode)
                    put("p_weekday", w.weekday)
                    put("p_start_time", w.startTime)
                    put("p_end_time", w.endTime)
                    put("p_valid_from", w.validFrom)
                    put("p_valid_to", w.validTo)
                    put("p_title", w.title)
                    put("p_displace", verdraengen)
                },
            ).decodeList<Anzahlen>()
            PlatzErgebnis(
                ok = true,
                meldung = VerwaltungLogik.serieAngelegtMeldung(
                    angelegt = zeilen.firstOrNull()?.createdCount ?: 0,
                    verdraengt = zeilen.firstOrNull()?.displacedCount ?: 0,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PlatzErgebnis(ok = false, meldung = Meldung.aus(e).text)
        }
    }

    /**
     * Uhrzeit, Titel oder Enddatum aendern. Zweistufig wie das Sperren: ohne
     * `verdraengen` nennt die Datenbank die Zahl der Kollisionen. Ein leeres
     * Enddatum faellt weg: dann bleibt es, wie es ist.
     */
    override suspend fun aendereSerie(
        id: String,
        startTime: String,
        endTime: String,
        titel: String,
        validTo: String,
        verdraengen: Boolean,
    ): PlatzErgebnis {
        val von = VerwaltungLogik.normZeit(startTime)
        val bis = VerwaltungLogik.normZeit(endTime)
        if (von == null || bis == null) return PlatzErgebnis(ok = false, meldung = VerwaltungLogik.KEINE_ZEIT)
        var ende: String? = null
        if (validTo.isNotBlank()) {
            ende = VerwaltungLogik.deutschZuIso(validTo) ?: return PlatzErgebnis(ok = false, meldung = VerwaltungLogik.KEIN_DATUM)
        }
        return try {
            val zeilen = rpc(
                "update_series",
                buildJsonObject {
                    put("p_series_id", id)
                    put("p_start_time", von)
                    put("p_end_time", bis)
                    put("p_title", titel)
                    ende?.let { put("p_valid_to", it) }
                    put("p_displace", verdraengen)
                },
            ).decodeList<Anzahlen>()
            PlatzErgebnis(
                ok = true,
                meldung = VerwaltungLogik.serieGeaendertMeldung(
                    neu = zeilen.firstOrNull()?.createdCount ?: 0,
                    verdraengt = zeilen.firstOrNull()?.displacedCount ?: 0,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val form = postgresFehler(e)
            PlatzErgebnis(
                ok = false,
                meldung = DbFehler.translateDbError(form),
                kollisionen = VerwaltungLogik.terminKollisionen(form.message ?: ""),
            )
        }
    }

    /** Beenden statt Loeschen: vergangene Termine bleiben als Beleg stehen. */
    override suspend fun beendeSerie(id: String): PlatzErgebnis = try {
        val weg = rpc("end_series", buildJsonObject { put("p_series_id", id) }).decodeAs<Int>()
        PlatzErgebnis(ok = true, meldung = VerwaltungLogik.serieBeendetMeldung(weg))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        PlatzErgebnis(ok = false, meldung = Meldung.aus(e).text)
    }
}
