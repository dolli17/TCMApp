package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.OnboardingSchrittKey
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Der Onboarding-Assistent gegen nachgebaute Antworten: my_onboarding lesen, je Schritt speichern, abschliessen. */
class OnboardingdatenServerTest : ServerTest() {
    private val daten by lazy { Onboardingdaten(client) }

    private val stammdaten = mapOf(
        "first_name" to " Max ", "last_name" to "Muster", "birthday" to "3.5.1985", "gender" to "male",
        "street" to "Am Platz 1", "postcode" to "69469", "city" to "Weinheim", "phone" to "", "mobile" to "0170 1234567",
        "title" to "",
    )

    @Test
    fun laden() = runBlocking {
        server.rpc(
            "my_onboarding",
            """
            {"abgeschlossen_am":null,"minderjaehrig":true,
             "status":{"passwort":true,"stammdaten":true,"rechtliches":false,"sepa":false},
             "stammdaten":{"first_name":"Max","last_name":"Muster","birthday":"2012-05-03","email":"max@tcm.local"},
             "erziehungsberechtigte":{"name":"Erika Muster","email":null,"phone":"0170 1","zustimmung_am":null},
             "notfallkontakt":{"name":null,"phone":null,"relation":null},
             "dokumente":[{"code":"satzung","version":3,"title":"Satzung","valid_from":"2025-01-01","zugestimmt_am":null},
                          {"code":"datenschutz","title":"Datenschutzerklärung"}],
             "mandat":{"vorhanden":false,"referenz":"TCM-0017","glaeubiger_name":"TC Muckensturm","glaeubiger_id":"DE98ZZZ09999999999",
                       "moeglich":true,"text":"Ich ermächtige …","kontoinhaber_vorschlag":"Erika Muster"},
             "merkmale":[{"code":"foto","name":"Fotos","description":null,"gesetzt":true}],
             "tennis":{"tennis_lk":null,"nuliga_id":null,"mannschaft_interesse":false},
             "einstellungen":{"booking_mail":"all"},
             "spaeter":{"dazu":1}}
            """,
        )
        val z = daten.laden()!!
        assertTrue(z.minderjaehrig)
        assertEquals("2012-05-03", z.stammdaten.birthday)
        assertEquals("Erika Muster", z.erziehungsberechtigte.name)
        assertEquals(listOf("satzung", "datenschutz"), z.dokumente.map { it.code })
        assertNull(z.dokumente[1].version)
        assertTrue(z.mandat.moeglich)
        assertTrue(z.merkmale.single().gesetzt)
        assertEquals("all", z.einstellungen.bookingMail)
        // Der naechste Pflichtschritt kommt aus dem Status der Datenbank.
        assertEquals(OnboardingSchrittKey.RECHTLICHES, z.naechsterPflichtschritt)
        assertTrue(z.schritte.any { it.key == OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE })
        assertEquals("{}", server.rpcAnfrage("my_onboarding").parameter)
    }

    /** Kein Mitglied angemeldet (Kiosk): die RPC antwortet mit null. Ein leeres Objekt nimmt ueberall die Vorgaben. */
    @Test
    fun ladenOhneMitglied() = runBlocking {
        server.rpc("my_onboarding", "null")
        assertNull(daten.laden())
        server.rpc("my_onboarding", "{}")
        assertEquals(OnboardingZustand(), daten.laden())
        assertFalse(daten.laden()!!.mandat.vorhanden)
    }

    @Test
    fun ladenFehler() = runBlocking {
        server.rpc("my_onboarding", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(ALLGEMEIN, meldung { daten.laden() })
        // Ein Dokument ohne Titel laesst sich nicht lesen.
        server.rpc("my_onboarding", """{"dokumente":[{"code":"satzung"}]}""")
        assertEquals(ALLGEMEIN, meldung { daten.laden() })
        server.ohneNetz = true
        assertEquals(KEINE_VERBINDUNG, meldung { daten.laden() })
    }

    @Test
    fun stammdaten() = runBlocking {
        server.rpc("onboarding_save_stammdaten", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Deine Daten sind gespeichert."), daten.speichereStammdaten(stammdaten))
        // Getrimmt, das Geburtsdatum als JJJJ-MM-TT; leeres Telefon und leerer Titel fehlen.
        assertEquals(
            """{"p_birthday":"1985-05-03","p_city":"Weinheim","p_first_name":"Max","p_gender":"male","p_last_name":"Muster",""" +
                """"p_mobile":"0170 1234567","p_postcode":"69469","p_street":"Am Platz 1"}""",
            server.rpcAnfrage("onboarding_save_stammdaten").parameter,
        )
    }

    @Test
    fun stammdatenPrueftVorDemAbsenden() = runBlocking {
        assertEquals(
            Ergebnis.fehler("Bitte das Geburtsdatum als TT.MM.JJJJ angeben.", "birthday"),
            daten.speichereStammdaten(stammdaten + ("birthday" to "1985")),
        )
        assertEquals(
            Ergebnis.fehler("Bitte Telefon oder Mobil angeben.", "phone"),
            daten.speichereStammdaten(stammdaten + ("mobile" to "")),
        )
        assertTrue(server.anfragen.isEmpty())

        server.rpc("onboarding_save_stammdaten", Antwort.dbFehler("Pflichtangaben fehlen: Geschlecht."))
        assertEquals(Ergebnis.fehler("Pflichtangaben fehlen: Geschlecht."), daten.speichereStammdaten(stammdaten))
    }

    @Test
    fun dokumente() = runBlocking {
        server.rpc("onboarding_accept_documents", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Zustimmung gespeichert."), daten.akzeptiereDokumente(listOf("satzung", "datenschutz")))
        assertEquals("""{"p_codes":["satzung","datenschutz"]}""", server.rpcAnfrage("onboarding_accept_documents").parameter)
        // Nichts anzukreuzen: kein Aufruf, kein Satz.
        assertEquals(Ergebnis.erfolg(""), daten.akzeptiereDokumente(emptyList()))
        assertEquals(1, server.anfragen.size)
    }

    @Test
    fun erziehungsberechtigte() = runBlocking {
        server.rpc("onboarding_save_guardian", Antwort.LEER)
        assertEquals(
            Ergebnis.erfolg("Erziehungsberechtigte gespeichert."),
            daten.speichereErziehungsberechtigte(" Erika Muster ", "", " 0170 1 ", zustimmung = true),
        )
        assertEquals(
            """{"p_consent":true,"p_name":"Erika Muster","p_phone":"0170 1"}""",
            server.rpcAnfrage("onboarding_save_guardian").parameter,
        )
        assertEquals(
            Ergebnis.fehler("Bitte den Namen angeben.", "name"),
            daten.speichereErziehungsberechtigte("", "e@tcm.local", "", zustimmung = true),
        )
        assertEquals(
            Ergebnis.fehler("Bitte E-Mail oder Telefon angeben.", "email"),
            daten.speichereErziehungsberechtigte("Erika", " ", "", zustimmung = false),
        )
        assertEquals(1, server.anfragen.size)
    }

    @Test
    fun notfallkontakt() = runBlocking {
        server.rpc("onboarding_save_notfallkontakt", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Notfallkontakt gespeichert."), daten.speichereNotfallkontakt("Erika", "0170 1", " Mutter "))
        // Ohne Angaben geht der Aufruf trotzdem hinaus: nur die RPC weiss, ob er Pflicht ist.
        daten.speichereNotfallkontakt("", "", "")
        assertEquals(
            listOf("""{"p_name":"Erika","p_phone":"0170 1","p_relation":"Mutter"}""", """{"p_name":"","p_phone":""}"""),
            server.rpcs("onboarding_save_notfallkontakt").map { it.parameter },
        )
        assertEquals(
            Ergebnis.fehler("Zur Notfallnummer gehört auch ein Name.", "name"),
            daten.speichereNotfallkontakt(" ", "0170 1", ""),
        )
        assertEquals(2, server.anfragen.size)

        server.rpc("onboarding_save_notfallkontakt", Antwort.dbFehler("Bei Minderjährigen ist der Notfallkontakt Pflicht."))
        assertEquals(
            Ergebnis.fehler("Bei Minderjährigen ist der Notfallkontakt Pflicht."),
            daten.speichereNotfallkontakt("", "", ""),
        )
    }

    @Test
    fun mandat() = runBlocking {
        server.rpc("create_my_sepa_mandate", Antwort.LEER)
        assertEquals(
            Ergebnis.erfolg("Das Mandat ist erteilt."),
            daten.erteileMandat("DE89 3704 0044 0532 0130 00", " Erika Muster ", bestaetigt = true),
        )
        daten.erteileMandat("DE89370400440532013000", "", bestaetigt = true)
        assertEquals(
            listOf(
                """{"p_accept":true,"p_holder":"Erika Muster","p_iban":"DE89 3704 0044 0532 0130 00"}""",
                """{"p_accept":true,"p_iban":"DE89370400440532013000"}""",
            ),
            server.rpcs("create_my_sepa_mandate").map { it.parameter },
        )

        // Ohne ausdrueckliche Bestaetigung oder mit falscher IBAN geht nichts hinaus.
        assertEquals(
            Ergebnis.fehler("Bitte bestätige das Mandat ausdrücklich."),
            daten.erteileMandat("DE89370400440532013000", "", bestaetigt = false),
        )
        assertEquals(
            Ergebnis.fehler("Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen."),
            daten.erteileMandat("DE89370400440532013001", "", bestaetigt = true),
        )
        assertEquals(2, server.anfragen.size)
    }

    @Test
    fun tennis() = runBlocking {
        server.rpc("save_my_tennis", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Gespeichert."), daten.speichereTennis("12,3", " 12345678 ", mannschaftInteresse = true))
        assertEquals(
            """{"p_mannschaft_interesse":true,"p_nuliga_id":"12345678","p_tennis_lk":"12,3"}""",
            server.rpcAnfrage("save_my_tennis").parameter,
        )
        server.rpc(
            "save_my_tennis",
            Antwort.dbFehler("""duplicate key value violates unique constraint "members_nuliga_id_key"""", code = "23505", status = 409),
        )
        assertEquals(
            Ergebnis.fehler("Diese nuLiga-Id ist bereits einem anderen Mitglied zugeordnet."),
            daten.speichereTennis("", "12345678", mannschaftInteresse = false),
        )
    }

    @Test
    fun abschliessen() = runBlocking {
        server.rpc("complete_onboarding", Antwort.LEER)
        assertEquals(Abschluss(Ergebnis.erfolg("Dein Konto ist freigeschaltet.")), daten.schliesseAb())

        // Fehlt noch etwas, nennt das DETAIL die Schritte - dorthin springt der Assistent.
        server.rpc(
            "complete_onboarding",
            Antwort.dbFehler("Es fehlen noch Angaben.", details = "stammdaten, sepa, einstellungen, quatsch"),
        )
        assertEquals(
            Abschluss(Ergebnis.fehler("Es fehlen noch Angaben."), listOf(OnboardingSchrittKey.STAMMDATEN, OnboardingSchrittKey.SEPA)),
            daten.schliesseAb(),
        )

        server.ohneNetz = true
        assertEquals(Abschluss(Ergebnis.fehler(KEINE_VERBINDUNG)), daten.schliesseAb())
    }

    @Test
    fun schreibfehlerOhneNetz() = runBlocking {
        server.ohneNetz = true
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.speichereStammdaten(stammdaten))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.akzeptiereDokumente(listOf("satzung")))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.speichereErziehungsberechtigte("Erika", "e@tcm.local", "", true))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.erteileMandat("DE89370400440532013000", "", true))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.speichereTennis("", "", false))
    }
}
