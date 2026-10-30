package de.tcmuckensturm.app.bildschirme.onboarding

import de.tcmuckensturm.app.daten.Abschluss
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.OnboardingZustand
import de.tcmuckensturm.kern.OnboardingSchrittKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Der Ablauf des Assistenten (weiter in OnboardingBildschirm.swift) mit Ersatzdaten, ohne Netz. */
@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingModellTest {
    private val start = OnboardingZustand.aus(OnboardingLogikTest.BEISPIEL)!!

    /** Gibt der Reihe nach `zustaende` zurueck (den letzten immer wieder) und merkt sich die Abschluesse. */
    private class Ersatz(var zustaende: List<OnboardingZustand?>, var abschluss: Abschluss = Abschluss(Ergebnis.erfolg("ok"))) :
        OnboardingAktionen {
        var geladen = 0
        var abgeschlossen = 0
        var ladefehler: String? = null

        override suspend fun laden(): OnboardingZustand? {
            ladefehler?.let { throw Meldung(it) }
            return zustaende[minOf(geladen++, zustaende.size - 1)]
        }
        override suspend fun schliesseAb(): Abschluss {
            abgeschlossen++
            return abschluss
        }
        override suspend fun speichereStammdaten(werte: Map<String, String>) = Ergebnis.erfolg("")
        override suspend fun akzeptiereDokumente(codes: List<String>) = Ergebnis.erfolg("")
        override suspend fun speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Boolean) = Ergebnis.erfolg("")
        override suspend fun speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String) = Ergebnis.erfolg("")
        override suspend fun erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Boolean) = Ergebnis.erfolg("")
        override suspend fun speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Boolean) = Ergebnis.erfolg("")
        override suspend fun setzeMerkmal(code: String, option: String) = Ergebnis.erfolg("")
        override suspend fun entferneMerkmal(code: String) = Ergebnis.erfolg("")
        override suspend fun passwortSpeichern(neu: String): String? = null
    }

    private var verlassen = 0

    @Before
    fun vorher() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun nachher() {
        Dispatchers.resetMain()
    }

    private fun modell(e: Ersatz) = OnboardingModell(e) { verlassen++ }.also { it.starten() }

    @Test
    fun ladenZeigtDenAssistenten() {
        val m = modell(Ersatz(listOf(start)))
        assertEquals(OnboardingLaden.Da(start), m.stand.value.laden)
        assertEquals(0, verlassen)
    }

    @Test
    fun ohneMitgliedOderSchonFertigInDieTabs() {
        modell(Ersatz(listOf(null)))
        assertEquals(1, verlassen)
        modell(Ersatz(listOf(start.copy(abgeschlossenAm = "2026-10-01T10:00:00Z"))))
        assertEquals(2, verlassen)
    }

    @Test
    fun ladefehlerMitErneutVersuchen() {
        val e = Ersatz(listOf(start)).apply { ladefehler = "Keine Verbindung zum Server." }
        val m = modell(e)
        assertEquals(OnboardingLaden.Fehler("Keine Verbindung zum Server."), m.stand.value.laden)
        e.ladefehler = null
        m.erstesLaden()
        assertEquals(OnboardingLaden.Da(start), m.stand.value.laden)
    }

    @Test
    fun weiterZumNaechstenSchritt() = runTest {
        val gespeichert = start.copy(status = start.status + ("stammdaten" to true))
        val e = Ersatz(listOf(start, gespeichert))
        val m = modell(e)
        assertTrue(m.weiter(OnboardingSchrittKey.STAMMDATEN).ok)
        assertEquals(OnboardingSchrittKey.RECHTLICHES, m.stand.value.schritt)
        assertEquals(OnboardingLaden.Da(gespeichert), m.stand.value.laden)
        assertEquals(0, e.abgeschlossen)
    }

    @Test
    fun mitDemMandatFreigeschaltet() = runTest {
        val e = Ersatz(listOf(start))
        val m = modell(e)
        m.weiter(OnboardingSchrittKey.SEPA)
        assertEquals(1, e.abgeschlossen)
        assertTrue(m.stand.value.freigeschaltet)
        assertEquals(Ergebnis.erfolg(OnboardingLogik.FREIGESCHALTET), m.stand.value.hinweis)
        assertEquals(OnboardingSchrittKey.EINWILLIGUNGEN, m.stand.value.schritt)

        // Danach nicht noch einmal freischalten; der letzte Schritt fuehrt in die Tabs.
        m.weiter(OnboardingSchrittKey.TENNIS)
        assertEquals(OnboardingSchrittKey.EINSTELLUNGEN, m.stand.value.schritt)
        m.weiter(OnboardingSchrittKey.EINSTELLUNGEN)
        assertEquals(1, e.abgeschlossen)
        assertEquals(1, verlassen)
    }

    @Test
    fun fehltNochEtwasSpringtDerAssistentDorthin() = runTest {
        val e = Ersatz(
            listOf(start),
            Abschluss(Ergebnis.fehler("Es fehlt noch: Deine Daten."), listOf(OnboardingSchrittKey.STAMMDATEN)),
        )
        val m = modell(e)
        val r = m.weiter(OnboardingSchrittKey.SEPA)
        assertTrue(r.ok)
        assertEquals(OnboardingSchrittKey.STAMMDATEN, m.stand.value.schritt)
        assertEquals(Ergebnis.fehler("Es fehlt noch: Deine Daten."), m.stand.value.hinweis)
        assertFalse(m.stand.value.freigeschaltet)
    }

    @Test
    fun abschlussFehlerOhneSchrittBleibtAmKnopf() = runTest {
        val e = Ersatz(listOf(start), Abschluss(Ergebnis.fehler("Keine Verbindung zum Server.")))
        val m = modell(e)
        assertEquals(Ergebnis.fehler("Keine Verbindung zum Server."), m.weiter(OnboardingSchrittKey.SEPA))
        assertEquals(null, m.stand.value.schritt)
    }

    @Test
    fun zurueckLoeschtDenHinweis() = runTest {
        val m = modell(Ersatz(listOf(start)))
        m.weiter(OnboardingSchrittKey.SEPA)
        m.zurueck(OnboardingSchrittKey.EINWILLIGUNGEN)
        assertEquals(null, m.stand.value.hinweis)
        assertEquals(OnboardingSchrittKey.EINWILLIGUNGEN, m.stand.value.schritt)
    }
}
