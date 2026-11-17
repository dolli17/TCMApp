package de.tcmuckensturm.app.daten

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Der Konto-Tab gegen nachgebaute Antworten: Lesen, Speichern und was vor dem Absenden abgefangen wird. */
class KontodatenServerTest : ServerTest() {
    private val daten by lazy { Kontodaten(client) }

    private val alt = mapOf(
        "first_name" to "Max", "last_name" to "Muster", "title" to "", "phone" to "06201 1234",
        "mobile" to "", "street" to "Am Platz 1", "postcode" to "69469", "city" to "Weinheim",
    )

    @Test
    fun profilMandatForderungen() = runBlocking {
        server.rpc(
            "mein_profil",
            """
            [{"first_name":"Max","last_name":"Muster","title":null,"phone":"06201 1234","postcode":"69469",
              "emergency_contact_name":"Erika","membership_number":"M-17","member_since":"2019-04-01",
              "team_name":"Herren 40","is_team_captain":true,"spaeter_dazu":"x"}]
            """,
        )
        server.rpc(
            "my_charges",
            """
            [{"id":"f1","kind":"beitrag","description":"Jahresbeitrag","period_label":"2026","amount_cents":18000,
              "due_date":"2026-03-01","status":"open","member_name":"Max Muster","is_for_other":false},{"id":"f2"}]
            """,
        )
        server.rpc(
            "mein_mandat",
            """[{"reference":"TCM-0017","signed_on":"2024-01-15","status":"active","holder":"Max Muster","bank_name":"Volksbank","iban_last4":"3000"}]""",
        )

        val profil = daten.profil()!!
        assertEquals("Herren 40", profil.teamName)
        assertEquals(true, profil.isTeamCaptain)
        // Fuer das Formular wird aus null der leere Text.
        assertEquals("", profil.werte["title"])
        assertEquals("Erika", profil.werte["emergency_contact_name"])
        assertEquals(11, profil.werte.size)

        val forderungen = daten.forderungen()
        assertEquals(18000, forderungen[0].amountCents)
        assertNull(forderungen[1].amountCents)
        assertEquals("3000", daten.mandat()?.ibanLast4)

        // Ohne Zugang oder ohne aktives Mandat: keine Zeile.
        server.rpc("mein_profil", "[]")
        server.rpc("mein_mandat", "[]")
        assertNull(daten.profil())
        assertNull(daten.mandat())
    }

    @Test
    fun merkmaleFragenMitDerEigenenKennung() = runBlocking {
        server.rpc("ich", """[{"member_id":"m1"}]""")
        server.rpc(
            "member_attributes",
            """
            [{"code":"trikot","name":"Trikotgröße","value_kind":"list","multiple":false,
              "optionen":[{"value":"m","label":"M"},{"value":"l"}],"option_value":"m","option_label":"M",
              "self_editable":true,"darf_ich":true},
             {"code":"foto","name":"Fotos","value_kind":"boolean","text_value":null}]
            """,
        )
        val merkmale = daten.merkmale()
        assertEquals(listOf("trikot", "foto"), merkmale.map { it.code })
        assertEquals(listOf("m", "l"), merkmale[0].optionen?.map { it.value })
        assertNull(merkmale[0].optionen?.get(1)?.label)
        assertEquals("""{"p_member_id":"m1"}""", server.rpcAnfrage("member_attributes").parameter)
    }

    /** Kiosk oder ohne Zugang: keine member_id, also auch keine Frage nach Merkmalen. */
    @Test
    fun merkmaleOhneMitglied() = runBlocking {
        server.rpc("ich", "[]")
        assertEquals(emptyList<MerkmalZeile>(), daten.merkmale())
        assertNull(daten.meineId())
        assertTrue(server.rpcs("member_attributes").isEmpty())
    }

    /** Nur was sich geaendert hat, geht hinaus - getrimmt; ein leerer Text leert das Feld. */
    @Test
    fun speichereProfilSchicktNurGeaendertes() = runBlocking {
        server.rpc("save_my_profile", Antwort.LEER)
        val neu = alt + mapOf("mobile" to " 0170 1234567 ", "phone" to "")
        assertEquals(Ergebnis.erfolg("Gespeichert."), daten.speichereProfil(neu, alt))
        assertEquals("""{"p_mobile":"0170 1234567","p_phone":""}""", server.rpcAnfrage("save_my_profile").parameter)
    }

    @Test
    fun speichereProfilPrueftVorDemAbsenden() = runBlocking {
        assertEquals(Ergebnis.fehler("Nichts geändert."), daten.speichereProfil(alt, alt))
        assertEquals(
            Ergebnis.fehler("Postleitzahl muss fünfstellig sein.", "postcode"),
            daten.speichereProfil(alt + ("postcode" to "6946"), alt),
        )
        assertEquals(Ergebnis.fehler("Vorname fehlt.", "first_name"), daten.speichereProfil(alt + ("first_name" to " "), alt))
        assertTrue(server.anfragen.isEmpty())
    }

    @Test
    fun speichereProfilMeldetDenFehlerDerDatenbank() = runBlocking {
        val neu = alt + ("city" to "Hemsbach")
        server.rpc("save_my_profile", Antwort.dbFehler("Du bist nicht angemeldet."))
        assertEquals(Ergebnis.fehler("Du bist nicht angemeldet."), daten.speichereProfil(neu, alt))
        server.rpc("save_my_profile", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(Ergebnis.fehler(ALLGEMEIN), daten.speichereProfil(neu, alt))
        server.ohneNetz = true
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.speichereProfil(neu, alt))
    }

    @Test
    fun notfallkontakt() = runBlocking {
        server.rpc("save_my_notfallkontakt", Antwort.LEER)
        val r = daten.speichereNotfallkontakt(
            mapOf("emergency_contact_name" to " Erika Muster ", "emergency_contact_phone" to "0170 1", "emergency_contact_relation" to ""),
        )
        assertEquals(Ergebnis.erfolg("Notfallkontakt gespeichert."), r)
        // Immer alle drei: leere Texte macht die RPC zu null.
        assertEquals(
            """{"p_name":"Erika Muster","p_phone":"0170 1","p_relation":""}""",
            server.rpcAnfrage("save_my_notfallkontakt").parameter,
        )

        // Eine Nummer ohne Namen faengt die App ab.
        assertEquals(
            Ergebnis.fehler("Zur Notfallnummer gehört auch ein Name.", "emergency_contact_name"),
            daten.speichereNotfallkontakt(mapOf("emergency_contact_phone" to "0170 1")),
        )
        assertEquals(1, server.anfragen.size)

        // Den Constraint der Datenbank uebersetzt translateDbError.
        server.rpc(
            "save_my_notfallkontakt",
            Antwort.dbFehler(
                """new row for relation "members" violates check constraint "members_emergency_contact_paarweise"""",
                code = "23514",
            ),
        )
        assertEquals(
            Ergebnis.fehler("Zur Notfallnummer gehört auch ein Name."),
            daten.speichereNotfallkontakt(mapOf("emergency_contact_name" to "Erika")),
        )
    }

    /** Der Bereich Tennis kommt aus my_onboarding und geht ueber save_my_tennis - wie im Onboarding. */
    @Test
    fun tennis() = runBlocking {
        server.rpc("my_onboarding", """{"tennis":{"tennis_lk":"12.3","nuliga_id":"12345678","mannschaft_interesse":true}}""")
        server.rpc("save_my_tennis", Antwort.LEER)
        assertEquals(OnboardingZustand.Tennis("12.3", "12345678", true), daten.tennis())
        assertEquals(Ergebnis.erfolg("Gespeichert."), daten.speichereTennis(" 11,5 ", "", mannschaftInteresse = false))
        // Das Interesse geht immer mit; leere Felder fehlen, statt null zu sein.
        assertEquals("""{"p_mannschaft_interesse":false,"p_tennis_lk":"11,5"}""", server.rpcAnfrage("save_my_tennis").parameter)

        server.rpc("my_onboarding", "null")
        assertNull(daten.tennis())
    }

    @Test
    fun merkmalSetzenUndEntfernen() = runBlocking {
        server.rpc("ich", """[{"member_id":"m1"}]""")
        server.rpc("set_member_attribute", Antwort.LEER)
        server.rpc("remove_member_attribute", Antwort.LEER)

        assertEquals(Ergebnis.erfolg("Gespeichert."), daten.setzeMerkmal("trikot", option = "l"))
        assertEquals(Ergebnis.erfolg("Gespeichert."), daten.setzeMerkmal("hinweis", text = "Linkshänder"))
        assertEquals(Ergebnis.erfolg("Entfernt."), daten.entferneMerkmal("trikot", option = "l"))
        assertEquals(Ergebnis.erfolg("Entfernt."), daten.entferneMerkmal("foto"))
        // Optionale Parameter fehlen, statt null zu sein.
        assertEquals(
            listOf(
                """{"p_member_id":"m1","p_option_value":"l","p_type_code":"trikot"}""",
                """{"p_member_id":"m1","p_text_value":"Linkshänder","p_type_code":"hinweis"}""",
            ),
            server.rpcs("set_member_attribute").map { it.parameter },
        )
        assertEquals(
            listOf(
                """{"p_member_id":"m1","p_option_value":"l","p_type_code":"trikot"}""",
                """{"p_member_id":"m1","p_type_code":"foto"}""",
            ),
            server.rpcs("remove_member_attribute").map { it.parameter },
        )
    }

    @Test
    fun merkmalFehler() = runBlocking {
        // Ohne Mitglied wird gar nicht erst geschrieben.
        server.rpc("ich", "[]")
        assertEquals(Ergebnis.fehler("Nicht angemeldet."), daten.setzeMerkmal("trikot", option = "l"))
        assertTrue(server.rpcs("set_member_attribute").isEmpty())

        server.rpc("ich", """[{"member_id":"m1"}]""")
        server.rpc("set_member_attribute", VERBOTEN)
        assertEquals(Ergebnis.fehler(KEIN_RECHT), daten.setzeMerkmal("trikot", option = "l"))

        // Scheitert schon ich(), steht dessen Satz im Formular.
        server.ohneNetz = true
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.entferneMerkmal("trikot"))
    }

    @Test
    fun kontoloeschung() = runBlocking {
        server.rpc("konto_loeschung_beantragen", "true")
        assertEquals(
            Ergebnis.erfolg("Dein Antrag ist eingegangen. Der Vorstand meldet sich bei dir."),
            daten.beantrageKontoloeschung("  Ich ziehe um.  "),
        )
        // Ein zweiter Antrag binnen 24 Stunden ist kein Fehler.
        server.rpc("konto_loeschung_beantragen", "false")
        assertEquals(
            Ergebnis.erfolg("Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum."),
            daten.beantrageKontoloeschung(""),
        )
        // Ohne Nachricht fehlt der Parameter.
        assertEquals(
            listOf("""{"p_nachricht":"Ich ziehe um."}""", "{}"),
            server.rpcs("konto_loeschung_beantragen").map { it.parameter },
        )

        // Zu lang: gar nicht erst abschicken.
        assertEquals(
            Ergebnis.fehler("Die Nachricht ist zu lang (höchstens 1000 Zeichen)."),
            daten.beantrageKontoloeschung("x".repeat(1001)),
        )
        assertEquals(2, server.anfragen.size)

        server.rpc("konto_loeschung_beantragen", Antwort.dbFehler("Du bist nicht angemeldet."))
        assertEquals(Ergebnis.fehler("Du bist nicht angemeldet."), daten.beantrageKontoloeschung(""))
        server.ohneNetz = true
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.beantrageKontoloeschung(""))
    }

    @Test
    fun lesefehlerWerdenUebersetzt() = runBlocking {
        val aufrufe: Map<String, suspend () -> Any?> = mapOf(
            "mein_profil" to { daten.profil() },
            "ich" to { daten.meineId() },
            "my_charges" to { daten.forderungen() },
            "mein_mandat" to { daten.mandat() },
            "my_onboarding" to { daten.tennis() },
        )
        for ((rpc, aufruf) in aufrufe) {
            server.rpc(rpc, VERBOTEN)
            assertEquals(rpc, KEIN_RECHT, meldung(aufruf))
            server.rpc(rpc, Antwort.SITZUNG_ABGELAUFEN)
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
            server.rpc(rpc, "kein json")
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
        }
        // Die Kennung kommt, aber die Merkmale nicht.
        server.rpc("ich", """[{"member_id":"m1"}]""")
        server.rpc("member_attributes", VERBOTEN)
        assertEquals(KEIN_RECHT, meldung { daten.merkmale() })
        server.ohneNetz = true
        for ((rpc, aufruf) in aufrufe) assertEquals(rpc, KEINE_VERBINDUNG, meldung(aufruf))
    }
}
