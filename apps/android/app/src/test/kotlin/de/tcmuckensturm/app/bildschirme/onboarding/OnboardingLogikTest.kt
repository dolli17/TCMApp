package de.tcmuckensturm.app.bildschirme.onboarding

import de.tcmuckensturm.app.daten.OnboardingZustand
import de.tcmuckensturm.kern.OnboardingSchrittKey
import de.tcmuckensturm.kern.Profil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Die Ansichtslogik des Onboardings: Faelle aus OnboardingTests.swift (dort
 * aus daten.ts und onboarding.tsx), dazu das Lesen von my_onboarding().
 */
class OnboardingLogikTest {
    private val gueltig = mapOf(
        "first_name" to "Nora", "last_name" to "Neumitglied", "title" to "", "birthday" to "19.09.1992", "gender" to "female",
        "street" to "Hauptstr. 1", "postcode" to "70372", "city" to "Stuttgart", "phone" to "", "mobile" to "0170 1234567",
    )

    @Test
    fun stammdatenGueltig() {
        assertEquals(OnboardingLogik.Pruefung.Ok("1992-09-19"), OnboardingLogik.pruefeStammdaten(gueltig, heute = "2026-10-29"))
    }

    @Test
    fun stammdatenNennenDasFeld() {
        val faelle = listOf(
            listOf("first_name", " ", "first_name", "Vorname fehlt."),
            listOf("last_name", "", "last_name", "Nachname fehlt."),
            listOf("birthday", "", "birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben."),
            listOf("birthday", "31.02.2000", "birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben."),
            listOf("birthday", "01.01.85", "birthday", "Das Geburtsdatum liegt in der Zukunft. Bitte das Jahr vierstellig angeben."),
            listOf("birthday", "01.01.1899", "birthday", "Bitte ein gültiges Geburtsdatum angeben."),
            listOf("gender", "", "gender", "Bitte das Geschlecht wählen."),
            listOf("street", "", "street", "Straße fehlt."),
            listOf("postcode", "", "postcode", "Postleitzahl fehlt."),
            listOf("city", "", "city", "Ort fehlt."),
            listOf("mobile", "", "phone", "Bitte Telefon oder Mobil angeben."),
        )
        for ((feld, wert, erwartet, meldung) in faelle) {
            assertEquals(
                "$feld=$wert",
                OnboardingLogik.Pruefung.Fehler(Profil.Fehler(erwartet, meldung)),
                OnboardingLogik.pruefeStammdaten(gueltig + (feld to wert), heute = "2026-10-29"),
            )
        }
    }

    @Test
    fun erziehungsberechtigte() {
        assertEquals(Profil.Fehler("name", "Bitte den Namen angeben."), OnboardingLogik.pruefeErziehungsberechtigte(" ", "a@b.de", ""))
        assertEquals(
            Profil.Fehler("email", "Bitte E-Mail oder Telefon angeben."),
            OnboardingLogik.pruefeErziehungsberechtigte("Eva", "", " "),
        )
        assertNull(OnboardingLogik.pruefeErziehungsberechtigte("Eva", "", "0711"))
    }

    @Test
    fun datum() {
        assertEquals("29.09.2026", OnboardingLogik.isoZuDeutsch("2026-09-29"))
        assertEquals("29.09.2026", OnboardingLogik.isoZuDeutsch("2026-09-29T10:00:00+00:00"))
        assertEquals("", OnboardingLogik.isoZuDeutsch(null))
        assertEquals("2026-09-29", OnboardingLogik.deutschZuIso("29.09.2026"))
        assertEquals("2026-09-29", OnboardingLogik.deutschZuIso("29.9.26"))
        assertEquals("2026-09-29", OnboardingLogik.deutschZuIso(" 2026-09-29 "))
        assertNull(OnboardingLogik.deutschZuIso("29.02.2026"))
        assertNull(OnboardingLogik.deutschZuIso("29.09.026"))
        assertNull(OnboardingLogik.deutschZuIso("gestern"))
        // Datumswaehler: Mitternacht UTC hin und zurueck
        val ms = OnboardingLogik.millis("19.09.2014")!!
        assertEquals(1411084800000L, ms)
        assertEquals("19.09.2014", OnboardingLogik.deutsch(ms))
        assertNull(OnboardingLogik.millis("31.02.2014"))
    }

    @Test
    fun fehlendeSchritteAusDemDetail() {
        assertEquals(
            listOf(OnboardingSchrittKey.STAMMDATEN, OnboardingSchrittKey.SEPA),
            OnboardingLogik.fehlendeSchritte("stammdaten, sepa,unbekannt,tennis"),
        )
        assertEquals(emptyList<OnboardingSchrittKey>(), OnboardingLogik.fehlendeSchritte(null))
    }

    @Test
    fun lesenUndAktuellerSchritt() {
        val z = OnboardingZustand.aus(BEISPIEL)!!
        assertTrue(z.minderjaehrig)
        assertEquals(listOf("satzung", "beitragsordnung", "datenschutz"), z.dokumente.map { it.code })
        assertEquals("TCM-402-2026", z.mandat.referenz)
        assertNull(z.einstellungen.bookingMail)

        // Ohne Wahl der erste offene Pflichtschritt, mit Wahl dieser.
        assertEquals(OnboardingLogik.Stelle(OnboardingSchrittKey.STAMMDATEN, 1), OnboardingLogik.aktuell(null, z))
        assertEquals(7, OnboardingLogik.aktuell(OnboardingSchrittKey.TENNIS, z).index)
        assertEquals("Konto einrichten · Schritt 2 von 9", OnboardingLogik.kopfKicker(1, z.schritte.size))
        assertEquals(
            listOf(OnboardingLogik.Fortschritt.ERLEDIGT, OnboardingLogik.Fortschritt.JETZT, OnboardingLogik.Fortschritt.OFFEN),
            OnboardingLogik.fortschritt(z.schritte, 1).take(3),
        )

        // Nach der Freischaltung kein Weg zurueck in die Pflicht.
        assertEquals(0, OnboardingLogik.ersterErreichbarer(z.schritte, freigeschaltet = false))
        assertEquals(6, OnboardingLogik.ersterErreichbarer(z.schritte, freigeschaltet = true))

        // Minderjaehrig ohne Notfallkontakt: vorbelegt mit den Erziehungsberechtigten (hier leer).
        assertEquals("", OnboardingLogik.notfallVorbelegung(z).verhaeltnis)
        assertEquals("19.09.2014", OnboardingLogik.stammdatenWerte(z.stammdaten)["birthday"])
    }

    @Test
    fun gewaehlterSchrittFaelltWeg() {
        // Erwachsen: Erziehungsberechtigte gibt es nicht mehr - dann der erste Schritt.
        val z = OnboardingZustand.aus(BEISPIEL)!!.copy(minderjaehrig = false)
        assertEquals(OnboardingLogik.Stelle(OnboardingSchrittKey.PASSWORT, 0), OnboardingLogik.aktuell(OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE, z))
    }

    @Test
    fun notfallVorbelegung() {
        val z = OnboardingZustand.aus(BEISPIEL)!!
        val mitEltern = z.copy(erziehungsberechtigte = OnboardingZustand.Erziehungsberechtigte(name = "Eva Neumitglied", phone = "0711 1"))
        assertEquals(OnboardingLogik.Notfall("Eva Neumitglied", "0711 1", "Erziehungsberechtigte"), OnboardingLogik.notfallVorbelegung(mitEltern))
        // Schon eingetragen oder erwachsen: was gespeichert ist.
        val eingetragen = mitEltern.copy(notfallkontakt = OnboardingZustand.Notfallkontakt("Opa", null, "Großvater"))
        assertEquals(OnboardingLogik.Notfall("Opa", "", "Großvater"), OnboardingLogik.notfallVorbelegung(eingetragen))
        assertEquals(OnboardingLogik.Notfall("", "", ""), OnboardingLogik.notfallVorbelegung(mitEltern.copy(minderjaehrig = false)))
    }

    @Test
    fun ohneMitglied() {
        assertNull(OnboardingZustand.aus("null"))
        assertNull(OnboardingZustand.aus(" "))
    }

    @Test
    fun texte() {
        assertEquals("Ich akzeptiere die Satzung.", OnboardingLogik.zustimmungstext("satzung", "Satzung"))
        assertEquals(
            "Ich habe die Datenschutzerklärung zur Kenntnis genommen.",
            OnboardingLogik.zustimmungstext("datenschutz", "Datenschutzerklärung"),
        )
        assertEquals(
            "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Freiwillig – du kannst den Schritt überspringen.",
            OnboardingLogik.einleitung(OnboardingSchrittKey.NOTFALLKONTAKT, minderjaehrig = false),
        )
        val d = OnboardingZustand.Dokument("satzung", 1, "Satzung", "2026-10-29", null)
        assertEquals("Fassung 1 vom 29.10.2026", OnboardingLogik.fassung(d))
        assertEquals("Fassung – vom 29.10.2026 · bereits zugestimmt", OnboardingLogik.fassung(d.copy(version = null, zugestimmtAm = "2026-10-30")))
        val m = OnboardingZustand.Mandat(glaeubigerName = "TC", glaeubigerId = "DE98", referenz = "R1", moeglich = true)
        assertTrue(OnboardingLogik.mandatstext(m).contains("Mandatsreferenz: R1"))
        assertEquals("aus der Datenbank", OnboardingLogik.mandatstext(m.copy(text = "aus der Datenbank")))
    }

    @Test
    fun buchungsmail() {
        assertEquals("wichtige", OnboardingLogik.buchungsmail(null))
        assertEquals("alle", OnboardingLogik.buchungsmail("alle"))
        assertEquals("wichtige", OnboardingLogik.buchungsmail("quatsch"))
        // Noch nichts gesetzt: speichern, auch wenn die Vorgabe bleibt.
        assertTrue(OnboardingLogik.buchungsmailSpeichern("wichtige", null))
        assertFalse(OnboardingLogik.buchungsmailSpeichern("alle", "alle"))
        assertTrue(OnboardingLogik.buchungsmailSpeichern("keine", "alle"))
    }

    companion object {
        /** my_onboarding() fuer kind@tcm.local aus dem lokalen Stack (gekuerzt, wie in OnboardingTests.swift). */
        const val BEISPIEL = """
        {"mandat":{"text":null,"moeglich":true,"referenz":"TCM-402-2026","vorhanden":false,"text_version":1,
          "glaeubiger_id":"DE98ZZZ09999999999","glaeubiger_name":"TC Muckensturm e.V.","online_erteilt_am":null,"kontoinhaber_vorschlag":null},
         "status":{"sepa":false,"tennis":false,"passwort":true,"stammdaten":false,"rechtliches":false,"einstellungen":false,
          "einwilligungen":false,"notfallkontakt":false,"erziehungsberechtigte":false},
         "tennis":{"nuliga_id":null,"tennis_lk":null,"mannschaft_interesse":false},
         "merkmale":[{"code":"foto","name":"Fotos und Veröffentlichung","gesetzt":false,"description":"Darf die Person auf Fotos erscheinen?"}],
         "dokumente":[{"code":"satzung","title":"Satzung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null},
          {"code":"beitragsordnung","title":"Beitragsordnung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null},
          {"code":"datenschutz","title":"Datenschutzerklärung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null}],
         "stammdaten":{"city":"Stuttgart","email":"kind@tcm.local","phone":null,"title":null,"gender":"male","mobile":"0170 1234567",
          "street":"Hauptstr. 1","birthday":"2014-09-19","postcode":"70372","last_name":"Neumitglied","first_name":"Kian",
          "salutation":"male","country_code":"DE","bestaetigt_am":null,"nationality_code":null},
         "beitragsarten":[{"code":"jugend","name":"Kinder und Jugendliche"}],"einstellungen":{"booking_mail":null},
         "minderjaehrig":true,"pflicht_fehlt":["stammdaten","rechtliches","erziehungsberechtigte","notfallkontakt","sepa"],
         "notfallkontakt":{"name":null,"phone":null,"relation":null},"abgeschlossen_am":null,
         "erziehungsberechtigte":{"name":null,"email":null,"phone":null,"zustimmung_am":null}}
        """
    }
}
