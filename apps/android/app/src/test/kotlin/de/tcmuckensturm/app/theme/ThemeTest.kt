package de.tcmuckensturm.app.theme

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import de.tcmuckensturm.app.ui.tokens.Dunkel
import de.tcmuckensturm.app.ui.tokens.Hell
import de.tcmuckensturm.app.ui.tokens.Schrift
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ThemeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    /** Jede Schrift, die Tokens.kt nennt, liegt unter res/font und laesst sich laden. */
    @Test
    fun alleSchriftenAusDenTokensLiegenBei() {
        val dateien = listOf(
            Schrift.DATEI_TEXT_NORMAL, Schrift.DATEI_TEXT_MITTEL, Schrift.DATEI_TEXT_HALBFETT,
            Schrift.DATEI_TEXT_FETT, Schrift.DATEI_TEXT_EXTRAFETT,
            Schrift.DATEI_DISPLAY_NORMAL, Schrift.DATEI_DISPLAY_MITTEL, Schrift.DATEI_DISPLAY_HALBFETT,
            Schrift.DATEI_DISPLAY_FETT, Schrift.DATEI_DISPLAY_EXTRAFETT,
        )
        for (datei in dateien) {
            @Suppress("DiscouragedApi")
            val id = context.resources.getIdentifier(datei, "font", context.packageName)
            assertNotEquals("res/font/$datei fehlt", 0, id)
            assertNotNull(datei, androidx.core.content.res.ResourcesCompat.getFont(context, id))
        }
    }

    @Test
    fun farbschemaNimmtDieVereinsfarben() {
        val hell = farbschema(Hell, dunkel = false)
        assertEquals(Hell.brand, hell.primary)
        assertEquals(Hell.bg, hell.background)
        assertEquals(Hell.ink, hell.onSurface)
        val dunkel = farbschema(Dunkel, dunkel = true)
        assertEquals(Dunkel.bg, dunkel.background)
        assertEquals(Dunkel.ink, dunkel.onBackground)
        assertNotEquals(hell.background, dunkel.background)
    }

    @Test
    fun erscheinungsbild() {
        assertEquals(Erscheinungsbild.SYSTEM, Erscheinungsbild.aus(null))
        assertEquals(Erscheinungsbild.SYSTEM, Erscheinungsbild.aus("bunt"))
        assertEquals(Erscheinungsbild.DUNKEL, Erscheinungsbild.aus("dunkel"))
        assertTrue(Erscheinungsbild.SYSTEM.dunkel(systemDunkel = true))
        assertFalse(Erscheinungsbild.SYSTEM.dunkel(systemDunkel = false))
        assertFalse(Erscheinungsbild.HELL.dunkel(systemDunkel = true))
        assertTrue(Erscheinungsbild.DUNKEL.dunkel(systemDunkel = false))
        // Dieselben Werte wie die iOS-App (UserDefaults "erscheinungsbild")
        assertEquals(listOf("system", "hell", "dunkel"), Erscheinungsbild.entries.map { it.wert })
    }
}
