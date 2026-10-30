package de.tcmuckensturm.app.start

import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.daten.Zugang
import de.tcmuckensturm.kern.KeinZugang
import de.tcmuckensturm.kern.ZugangsGrund
import org.junit.Assert.assertEquals
import org.junit.Test

/** Dieselben Faelle wie StartLogikTests der iOS-App. */
class StartLogikTest {
    @Test
    fun ohneSitzungZurAnmeldung() {
        assertEquals(StartZiel.Anmelden, StartLogik.ziel(angemeldet = false, zugang = null))
        assertEquals(StartZiel.Anmelden, StartLogik.ziel(angemeldet = false, zugang = Zugang(zugang = true)))
    }

    @Test
    fun mitZugangInDieTabs() {
        assertEquals(StartZiel.Tabs, StartLogik.ziel(true, Zugang(zugang = true, onboardingOffen = false)))
    }

    @Test
    fun offenesOnboarding() {
        assertEquals(StartZiel.Onboarding, StartLogik.ziel(true, Zugang(zugang = true, onboardingOffen = true)))
    }

    @Test
    fun keinZugangMitGrund() {
        for (grund in listOf(ZugangsGrund.ARCHIVIERT, ZugangsGrund.GESPERRT, ZugangsGrund.AUSGETRETEN)) {
            assertEquals(StartZiel.KeinZugang(grund), StartLogik.ziel(true, Zugang(zugang = false, grund = grund.wert)))
        }
    }

    @Test
    fun keinZugangGehtDemOnboardingVor() {
        assertEquals(
            StartZiel.KeinZugang(ZugangsGrund.GESPERRT),
            StartLogik.ziel(true, Zugang(zugang = false, grund = "gesperrt", onboardingOffen = true)),
        )
    }

    @Test
    fun unbekannterGrund() {
        assertEquals(StartZiel.KeinZugang(ZugangsGrund.UNBEKANNT), StartLogik.ziel(true, Zugang(zugang = false, grund = "admin")))
        assertEquals(StartZiel.KeinZugang(ZugangsGrund.UNBEKANNT), StartLogik.ziel(true, Zugang(zugang = false, grund = null)))
    }

    @Test
    fun lesefehlerInDieTabs() {
        assertEquals(StartZiel.Tabs, StartLogik.ziel(angemeldet = true, zugang = null))
    }

    @Test
    fun nachAbmeldenZurAnmeldung() {
        assertEquals(StartZiel.Anmelden, StartLogik.nachAbmelden(StartZiel.Tabs))
        assertEquals(StartZiel.Anmelden, StartLogik.nachAbmelden(StartZiel.Onboarding))
        assertEquals(StartZiel.Anmelden, StartLogik.nachAbmelden(StartZiel.Laden))
    }

    @Test
    fun keinZugangBleibtNachAbmelden() {
        val ziel = StartZiel.KeinZugang(ZugangsGrund.AUSGETRETEN)
        assertEquals(ziel, StartLogik.nachAbmelden(ziel))
    }

    @Test
    fun zugangDekodiertDieRpcZeile() {
        val zeilen = SupabaseVerbindung.json.decodeFromString<List<Zugang>>(
            """[{"zugang":false,"grund":"archiviert","onboarding_offen":false,"neu":1}]""",
        )
        assertEquals(listOf(Zugang(zugang = false, grund = "archiviert", onboardingOffen = false)), zeilen)
    }

    @Test
    fun keinZugangTexteWieInCore() {
        assertEquals("Kein Zugang mehr", KeinZugang.TITEL)
        assertEquals("Der Verein hat deinen Zugang gesperrt.", KeinZugang.text(ZugangsGrund.GESPERRT))
        assertEquals(KeinZugang.text(ZugangsGrund.ARCHIVIERT), KeinZugang.text(ZugangsGrund.AUSGETRETEN))
        assertEquals("Mit diesem Konto ist im Moment keine Anmeldung möglich.", KeinZugang.text(ZugangsGrund.UNBEKANNT))
    }
}
