package de.tcmuckensturm.kern

import de.tcmuckensturm.kern.OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE
import de.tcmuckensturm.kern.OnboardingSchrittKey.NOTFALLKONTAKT
import de.tcmuckensturm.kern.OnboardingSchrittKey.PASSWORT
import de.tcmuckensturm.kern.OnboardingSchrittKey.RECHTLICHES
import de.tcmuckensturm.kern.OnboardingSchrittKey.SEPA
import de.tcmuckensturm.kern.OnboardingSchrittKey.STAMMDATEN
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Die Faelle aus packages/core/src/onboarding.test.ts und iban.test.ts (wie
 * OnboardingTests.swift). Golden Files gibt es fuer beides nicht.
 */
class OnboardingTest {
    private val allesOffen = mapOf(
        "passwort" to true, "stammdaten" to false, "rechtliches" to false, "erziehungsberechtigte" to false,
        "notfallkontakt" to false, "sepa" to false, "einwilligungen" to false, "tennis" to false, "einstellungen" to false,
    )

    @Test
    fun `Erwachsene ohne Erziehungsberechtigte, Notfallkontakt optional`() {
        val s = Onboarding.schritte(minderjaehrig = false, status = allesOffen)
        assertEquals(
            listOf("passwort", "stammdaten", "rechtliches", "notfallkontakt", "sepa", "einwilligungen", "tennis", "einstellungen"),
            s.map { it.key.wert },
        )
        assertEquals(listOf(PASSWORT, STAMMDATEN, RECHTLICHES, SEPA), s.filter { it.pflicht }.map { it.key })
        assertEquals("Passwort", s.first().titel)
        assertEquals("App-Einstellungen", s.last().titel)
    }

    @Test
    fun `Minderjaehrige mit Erziehungsberechtigten und Notfallkontakt als Pflicht`() {
        val s = Onboarding.schritte(minderjaehrig = true, status = allesOffen)
        assertEquals(
            listOf(PASSWORT, STAMMDATEN, RECHTLICHES, ERZIEHUNGSBERECHTIGTE, NOTFALLKONTAKT, SEPA),
            s.filter { it.pflicht }.map { it.key },
        )
        assertEquals(9, s.size)
    }

    @Test
    fun `Erledigt kommt aus der Datenbank`() {
        val s = Onboarding.schritte(false, allesOffen + ("stammdaten" to true))
        assertTrue(s.first { it.key == STAMMDATEN }.erledigt)
        assertFalse(s.first { it.key == SEPA }.erledigt)
    }

    @Test
    fun naechsterPflichtschritt() {
        assertEquals(STAMMDATEN, Onboarding.naechsterPflichtschritt(false, allesOffen))
        val status = allesOffen + mapOf("stammdaten" to true, "rechtliches" to true)
        assertEquals(SEPA, Onboarding.naechsterPflichtschritt(false, status))
        assertEquals(ERZIEHUNGSBERECHTIGTE, Onboarding.naechsterPflichtschritt(true, status))
        assertNull(Onboarding.naechsterPflichtschritt(false, status + ("sepa" to true)))
    }

    @Test
    fun `Schluessel aus der Datenbank`() {
        assertEquals(SEPA, OnboardingSchrittKey.aus("sepa"))
        assertNull(OnboardingSchrittKey.aus("unbekannt"))
        assertNull(OnboardingSchrittKey.aus(null))
    }

    /** Derselbe Text steht als Erwartung in supabase/tests/23_onboarding.sql. */
    @Test
    fun mandatstext() {
        assertEquals(
            "SEPA-Lastschriftmandat (SEPA-Basislastschrift)\n" +
                "\n" +
                "Zahlungsempfänger: TC Muckensturm e.V.\n" +
                "Gläubiger-Identifikationsnummer: DE98ZZZ09999999999\n" +
                "Mandatsreferenz: TCM-0001-2026\n" +
                "Zahlungsart: Wiederkehrende Zahlungen\n" +
                "\n" +
                "Ich ermächtige TC Muckensturm e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. " +
                "Zugleich weise ich mein Kreditinstitut an, die von TC Muckensturm e.V. auf mein Konto gezogenen Lastschriften einzulösen.\n" +
                "\n" +
                "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. " +
                "Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.",
            Onboarding.mandatstext("TC Muckensturm e.V.", "DE98ZZZ09999999999", "TCM-0001-2026"),
        )
    }

    @Test
    fun iban() {
        for (gut in listOf(
            "DE89370400440532013000", "DE89 3704 0044 0532 0130 00", "de89370400440532013000",
            "GB82WEST12345698765432", "AT611904300234573201", "CH9300762011623852957", "DE89-3704-0044-0532-0130-00",
        )) {
            assertTrue(Iban.istGueltig(gut), gut)
        }
        for (schlecht in listOf(
            "DE88370400440532013000", "DE00370400440532013000", "DE89370400440532010300",
            "DE8937040044053201300", "DE893704004405320130000", "", "keine iban", "1234567890",
        )) {
            assertFalse(Iban.istGueltig(schlecht), schlecht)
        }
        assertFalse(Iban.istGueltig(null))
        assertEquals("DE8937040044", Iban.normalisiert(" de89 3704-0044 "))
    }
}
