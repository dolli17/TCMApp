/*
 * Lader fuer die Golden Files (packages/core/golden, README dort)
 *
 * Der Ordner ist in kern/build.gradle.kts als Testressource eingebunden, nicht
 * kopiert. Je Funktion eine Datei `<funktion>.json` mit einer Liste von
 * Faellen { name, input, output }. Fehlt `output`, war das Ergebnis `undefined`
 * (hier null).
 *
 * Neue Funktionen pruefen: eine eigene Testklasse je Bereich anlegen (etwa
 * PlatzplanGoldenTest) und je Funktion eine @TestFactory, die `Golden.pruefen`
 * zurueckgibt. Jeder Fall erscheint dann mit seinem Namen im Testbericht:
 *
 *     @TestFactory
 *     fun freeGaps() = Golden.pruefen("freeGaps") { input ->
 *         JsonPrimitive(Platzplan.freeGaps(input.text("day")!!, ...))
 *     }
 *
 * Verglichen wird als JsonElement. So faellt auch ein Feld auf, das die
 * Portierung zu viel liefert. Zahlen vergleicht `gleich` nach Wert (1 == 1.0).
 */

package de.tcmuckensturm.kern.golden

import java.io.File
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import de.tcmuckensturm.kern.Zeit

@Serializable
data class Fall(
    val name: String,
    val input: JsonObject = JsonObject(emptyMap()),
    /** null: das Ergebnis war `undefined`. JsonNull: es war `null`. */
    val output: JsonElement? = null,
)

object Golden {
    val json = Json { ignoreUnknownKeys = false }

    /** Der Ordner mit den Golden Files im Testklassenpfad. */
    val ordner: File by lazy {
        val readme = requireNotNull(Golden::class.java.getResource("/README.md")) {
            "packages/core/golden fehlt im Testklassenpfad (kern/build.gradle.kts)"
        }
        File(readme.toURI()).parentFile
    }

    /** Alle Funktionen, zu denen es eine Golden-Datei gibt. */
    fun funktionen(): List<String> =
        ordner.listFiles { f -> f.extension == "json" }.orEmpty().map { it.nameWithoutExtension }.sorted()

    fun faelle(funktion: String): List<Fall> {
        val text = requireNotNull(Golden::class.java.getResource("/$funktion.json")) {
            "Keine Golden-Datei $funktion.json"
        }.readText()
        return json.decodeFromString(text)
    }

    /** Ein Test je Fall: `rechnen` bekommt `input` und liefert das Ergebnis als JSON. */
    fun pruefen(funktion: String, rechnen: (JsonObject) -> JsonElement?): List<DynamicTest> =
        faelle(funktion).map { fall ->
            DynamicTest.dynamicTest(fall.name) {
                val ergebnis = rechnen(fall.input)
                assertTrue(gleich(fall.output, ergebnis)) {
                    "$funktion / ${fall.name}: erwartet ${fall.output}, bekommen $ergebnis"
                }
            }
        }

    /** Wie JSON.stringify verglichen: Felder ohne Wert (undefined) und fehlende Felder sind gleich. */
    fun gleich(erwartet: JsonElement?, ist: JsonElement?): Boolean {
        if (erwartet == null || ist == null) return erwartet == ist
        return when (erwartet) {
            is JsonObject -> ist is JsonObject && erwartet.keys == ist.keys &&
                erwartet.all { (k, v) -> gleich(v, ist[k]) }
            is JsonArray -> ist is JsonArray && erwartet.size == ist.size &&
                erwartet.indices.all { gleich(erwartet[it], ist[it]) }
            is JsonNull -> ist is JsonNull
            is JsonPrimitive -> {
                if (ist !is JsonPrimitive || ist is JsonNull) return false
                if (erwartet.isString || ist.isString) return erwartet.isString == ist.isString && erwartet.content == ist.content
                val a = erwartet.doubleOrNull
                val b = ist.doubleOrNull
                if (a != null && b != null) a == b else erwartet.booleanOrNull == ist.booleanOrNull
            }
        }
    }
}

// ---- Eingaben lesen -------------------------------------------------------

/** Ein Text; null, wenn das Feld fehlt, null ist oder kein Text. */
fun JsonObject.text(name: String): String? =
    (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content

fun JsonObject.zahl(name: String): Int = getValue(name).jsonPrimitive.int

/** Ein Zeitpunkt aus ISO-8601 (`now`, `startsAt` ...). */
fun JsonObject.zeitpunkt(name: String): Instant =
    requireNotNull(text(name)?.let(Zeit::datum)) { "$name ist kein Zeitpunkt" }

/** Der Wert wie in JavaScript: Text, Zahl, Wahrheitswert; null fuer null und fehlend; sonst das JSON selbst. */
fun JsonObject.roh(name: String): Any? = when (val wert = this[name]) {
    null, is JsonNull -> null
    is JsonPrimitive -> if (wert.isString) wert.content else wert.booleanOrNull ?: wert.doubleOrNull
    else -> wert
}
