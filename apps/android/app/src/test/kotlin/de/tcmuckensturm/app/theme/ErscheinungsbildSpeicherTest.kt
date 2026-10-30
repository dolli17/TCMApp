package de.tcmuckensturm.app.theme

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** Die Wahl im Konto ueberlebt den Neustart: gespeichert unter "erscheinungsbild" wie in iOS. */
class ErscheinungsbildSpeicherTest {
    @Test
    fun speichertUndLiestDieWahl() = runTest {
        val ordner = Files.createTempDirectory("einstellungen").toFile()
        val datei = File(ordner, "einstellungen.preferences_pb")
        val erster = ErscheinungsbildSpeicher(PreferenceDataStoreFactory.create(scope = backgroundScope) { datei })
        assertEquals(Erscheinungsbild.SYSTEM, erster.wahl.first())
        erster.setzen(Erscheinungsbild.DUNKEL)
        assertEquals(Erscheinungsbild.DUNKEL, erster.wahl.first())
        erster.setzen(Erscheinungsbild.HELL)
        assertEquals(Erscheinungsbild.HELL, erster.wahl.first())
        ordner.deleteRecursively()
    }
}
