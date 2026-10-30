/*
 * Ausnahmen von supabase-kt in die Formen, die @tcm/core zuordnet
 *
 * Auth: AuthFehlerForm fuer Anmeldefehler (kern/Anmeldefehler.kt).
 * RPCs: PostgresFehler fuer translateDbError (kern/DbFehler.kt), als Meldung
 * mit dem fertigen Satz. Wie AuthFehlerForm.aus und Meldung.aus in der iOS-App.
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.start.Zeitueberschreitung
import de.tcmuckensturm.kern.AuthFehlerForm
import de.tcmuckensturm.kern.DbFehler
import de.tcmuckensturm.kern.PostgresFehler
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.auth.exception.SessionRequiredException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import java.io.IOException
import kotlinx.serialization.json.JsonPrimitive

/** Keine Antwort vom Server: kein Netz, Zeitueberschreitung, Verbindung abgerissen. */
fun istVerbindungsfehler(fehler: Throwable): Boolean =
    fehler is IOException || fehler is Zeitueberschreitung || fehler.cause?.let(::istVerbindungsfehler) == true

/** Was supabase-kt wirft, in die Form von auth-js gebracht. */
fun authFehlerForm(fehler: Throwable): AuthFehlerForm = when {
    fehler is AuthRestException ->
        AuthFehlerForm(code = fehler.error, status = fehler.statusCode, nachricht = fehler.errorDescription)
    // Ohne Sitzung gar nicht erst gefragt (etwa updateUser): wie session_not_found von Auth
    fehler is SessionRequiredException -> AuthFehlerForm(code = "session_not_found")
    fehler is RestException -> AuthFehlerForm(status = fehler.statusCode, nachricht = fehler.description)
    istVerbindungsfehler(fehler) -> AuthFehlerForm(nachricht = fehler.message, ohneAntwort = true)
    else -> AuthFehlerForm(nachricht = fehler.message)
}

/** Die Form, die translateDbError erwartet (wie der Fehler von supabase-js). */
fun postgresFehler(fehler: Throwable): PostgresFehler = when {
    fehler is PostgrestRestException -> PostgresFehler(
        code = fehler.code,
        message = fehler.error,
        details = fehler.details?.let { (it as? JsonPrimitive)?.content ?: it.toString() },
        hint = fehler.hint,
    )
    // Wie fetch in React Native: wird zu "Keine Verbindung zum Server."
    istVerbindungsfehler(fehler) -> PostgresFehler(message = "Network request failed")
    // Decodierfehler u. a.: englischer Text ohne Regel - landet beim allgemeinen Satz.
    else -> PostgresFehler(message = "unbekannt")
}

/** Ein Fehler mit dem Satz fuer die Anzeige. Die Datenzugriffe der Bildschirme werfen ihn. */
class Meldung(val text: String) : Exception(text) {
    companion object {
        fun aus(fehler: Throwable): Meldung =
            fehler as? Meldung ?: Meldung(DbFehler.translateDbError(postgresFehler(fehler)))
    }
}
