/*
 * Erscheinungsbild: System, Hell oder Dunkel
 *
 * Wie Bildschirme/Konto/Erscheinungsbild.swift der iOS-App (gleiche Werte
 * unter demselben Schluessel). Die Wahl im Konto setzt die Konto-Spur
 * (`ErscheinungsbildSpeicher.setzen`); StartAnsicht wendet sie an.
 */

package de.tcmuckensturm.app.theme

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class Erscheinungsbild(val wert: String, val titel: String) {
    SYSTEM("system", "System"),
    HELL("hell", "Hell"),
    DUNKEL("dunkel", "Dunkel"),
    ;

    /** Dunkel zeichnen? `systemDunkel` ist die Einstellung des Geraets. */
    fun dunkel(systemDunkel: Boolean): Boolean = when (this) {
        SYSTEM -> systemDunkel
        HELL -> false
        DUNKEL -> true
    }

    companion object {
        const val SCHLUESSEL = "erscheinungsbild"

        fun aus(wert: String?): Erscheinungsbild = entries.firstOrNull { it.wert == wert } ?: SYSTEM
    }
}

/** Einstellungen der App ohne Geheimnisse (nicht verschluesselt). */
val Context.einstellungen: DataStore<Preferences> by preferencesDataStore(name = "einstellungen")

class ErscheinungsbildSpeicher(private val daten: DataStore<Preferences>) {
    private val schluessel = stringPreferencesKey(Erscheinungsbild.SCHLUESSEL)

    val wahl: Flow<Erscheinungsbild> = daten.data.map { Erscheinungsbild.aus(it[schluessel]) }

    suspend fun setzen(neu: Erscheinungsbild) {
        daten.edit { it[schluessel] = neu.wert }
    }

    companion object {
        fun fuer(context: Context) = ErscheinungsbildSpeicher(context.applicationContext.einstellungen)
    }
}
