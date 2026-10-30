package de.tcmuckensturm.app.bildschirme.konto

import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.Forderung
import de.tcmuckensturm.app.daten.MeinMandat
import de.tcmuckensturm.app.daten.MeinProfil
import de.tcmuckensturm.app.daten.MerkmalZeile
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.theme.Erscheinungsbild
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Konto: Decoding der Modelle und die Ansichtslogik - dieselben Faelle wie
 * KontoTests.swift der iOS-App. Die Pruefung der Stammdaten und die
 * Kuendigung stehen in kern (ProfilTest), die Golden Files in KontoGoldenTest.
 */
class KontoLogikTest {
    private inline fun <reified T> lies(json: String): T = SupabaseVerbindung.json.decodeFromString(json)

    @Test
    fun meinProfil() {
        val p = lies<List<MeinProfil>>(
            """
            [{"first_name":"Max","last_name":"Muster","title":null,"phone":"0711 1","mobile":null,"street":"Hauptstr. 1",
              "postcode":"71711","city":"Murr","emergency_contact_name":null,"emergency_contact_phone":null,
              "emergency_contact_relation":null,"membership_number":"0042","member_since":"2019-04-01",
              "team_name":"Herren 40","is_team_captain":true,"neue_spalte":1}]
            """,
        )
        assertEquals("", p[0].werte["title"])
        assertEquals("71711", p[0].werte["postcode"])
        assertEquals(listOf("Mitglied seit 2019", "Herren 40", "Mannschaftsführer"), KontoLogik.marken(p[0]))
        assertEquals("MM", KontoLogik.initialen("max", "Muster"))
        assertEquals("", KontoLogik.initialen("", ""))

        val ohne = lies<List<MeinProfil>>("""[{"first_name":"Eva","last_name":"E","team_name":null,"is_team_captain":false}]""")
        assertEquals(emptyList<String>(), KontoLogik.marken(ohne[0]))
        assertEquals(emptyList<String>(), KontoLogik.marken(null))
    }

    @Test
    fun forderungenUndSumme() {
        val f = lies<List<Forderung>>(
            """
            [{"id":"1","kind":"fee","description":"Jahresbeitrag","period_label":"2026","amount_cents":12000,
              "due_date":"2026-11-02","status":"notified","member_name":"Max","is_for_other":false},
             {"id":"2","kind":"drinks","period_label":"September 2026","amount_cents":850,"status":"returned"},
             {"id":"3","kind":"guest","amount_cents":500,"status":"paid"},
             {"id":"4","kind":"neu","amount_cents":100,"status":"open"}]
            """,
        )
        val offen = KontoLogik.offen(f)
        assertEquals(listOf("1", "2", "4"), offen.map { it.id })
        assertEquals(12000 + 850 + 100 + 1250, KontoLogik.summe(offen, getraenkeLaufend = 1250))
        assertEquals("Beitrag 2026", KontoLogik.forderungTitel(f[0]))
        assertEquals("neu", KontoLogik.forderungTitel(f[3]))
        assertEquals(Statusmarke("Einzug am 02.11.2026", Statusmarke.Ton.GOLD), KontoLogik.statusmarke("notified", "2026-11-02"))
        assertEquals("angekündigt", KontoLogik.statusmarke("notified", null).text)
        assertEquals(Statusmarke("zurückgebucht", Statusmarke.Ton.ROT), KontoLogik.statusmarke("returned", null))
        assertEquals("läuft noch", KontoLogik.statusmarke("laufend", null).text)
        assertEquals("offen", KontoLogik.statusmarke("open", null).text)
        assertNull(KontoLogik.zurueckText(0))
        assertEquals(
            "Eine Lastschrift kam zurück – die Beträge sind wieder offen. Bitte melde dich beim Verein.",
            KontoLogik.zurueckText(1),
        )
        assertTrue(KontoLogik.zurueckText(2)!!.startsWith("2 Lastschriften kamen zurück"))
    }

    @Test
    fun getraenkeTitelInBerlinerZeit() {
        // 31.10. 23:30 UTC ist in Berlin schon November.
        assertEquals("Getränke November", KontoLogik.getraenkeTitel(Instant.parse("2026-10-31T23:30:00Z")))
    }

    @Test
    fun arbeitsdienst() {
        val offen = Arbeitsdienst(year = 2026, requiredHours = 10.0, completedHours = 4.0, missingHours = 6.0)
        assertEquals("4 / 10 h", KontoLogik.dienstWert(offen))
        assertEquals("Fehlende Stunden werden zum Jahresende als Ausgleich berechnet.", KontoLogik.dienstText(offen))
        assertEquals(0.4, KontoLogik.dienstAnteil(offen), 0.0001)
        assertEquals("4 von 10 Stunden geleistet", KontoLogik.dienstBedienText(offen))
        val fertig = Arbeitsdienst(year = 2026, requiredHours = 10.0, completedHours = 12.5, missingHours = 0.0)
        assertEquals("Erledigt – danke für deinen Einsatz.", KontoLogik.dienstText(fertig))
        assertEquals(1.0, KontoLogik.dienstAnteil(fertig), 0.0)
        val ohne = Arbeitsdienst(year = 2026, requiredHours = 0.0, completedHours = 2.5, missingHours = 0.0)
        assertEquals("2.5 h", KontoLogik.dienstWert(ohne))
        assertEquals("Für dieses Jahr ist kein Arbeitsdienst vorgesehen.", KontoLogik.dienstText(ohne))
        assertEquals(0.0, KontoLogik.dienstAnteil(ohne), 0.0)
    }

    @Test
    fun arbeitsdienstStundenAlsZahlOderText() {
        // numeric kommt je nach Weg als Zahl oder als Text.
        val d = lies<List<Arbeitsdienst>>(
            """[{"year":2026,"required_hours":"10.0","completed_hours":4.5,"missing_hours":null}]""",
        )[0]
        assertEquals(Arbeitsdienst(year = 2026, requiredHours = 10.0, completedHours = 4.5, missingHours = null), d)
        assertEquals("4.5 / 10 h", KontoLogik.dienstWert(d))
    }

    @Test
    fun mandat() {
        val m = lies<List<MeinMandat>>(
            """
            [{"reference":"TCM-0042","signed_on":"2024-03-01","status":"active","holder":"Max Muster",
              "bank_name":null,"iban_last4":"4321"}]
            """,
        )
        val zeilen = KontoLogik.mandatZeilen(m[0])
        assertEquals(listOf("Kontoinhaber", "IBAN", "Bank", "Mandatsreferenz", "Unterschrieben am"), zeilen.map { it.first })
        assertEquals(listOf("Max Muster", "•••• 4321", "–", "TCM-0042", "01.03.2024"), zeilen.map { it.second })
        assertEquals("–", KontoLogik.mandatZeilen(MeinMandat(ibanLast4 = ""))[1].second)
    }

    @Test
    fun tagDatum() {
        assertEquals("29.10.2026", KontoLogik.tagDatum("2026-10-29"))
        // 23:30 UTC ist in Berlin schon der naechste Tag.
        assertEquals("01.07.2026", KontoLogik.tagDatum("2026-06-30T23:30:00+00:00"))
        assertEquals("kaputt", KontoLogik.tagDatum("kaputt"))
    }

    @Test
    fun merkmaleBuendeln() {
        val z = lies<List<MerkmalZeile>>(
            """
            [{"code":"foto","name":"Fotos","description":"Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
              "value_kind":"boolean","multiple":false,"optionen":[],"option_value":"true","option_label":null,"text_value":null,
              "set_at":"2026-05-01T10:00:00+00:00","self_editable":true,"darf_ich":true},
             {"code":"bereich","name":"Bereiche","description":"","value_kind":"list","multiple":true,
              "optionen":[{"value":"jugend","label":"Jugend"},{"value":"technik","label":"Technik"}],
              "option_value":"jugend","option_label":"Jugend","text_value":null,"set_at":null,"self_editable":true,"darf_ich":true},
             {"code":"bereich","name":"Bereiche","description":"","value_kind":"list","multiple":true,
              "optionen":[{"value":"jugend","label":"Jugend"},{"value":"technik","label":"Technik"}],
              "option_value":"technik","option_label":"Technik","text_value":null,"set_at":null,"self_editable":true,"darf_ich":true},
             {"code":"mail","name":"Benachrichtigungen","value_kind":"list","multiple":false,
              "optionen":[{"value":"alle","label":"Alle"},{"value":"keine","label":"Keine"}],
              "option_value":null,"option_label":null,"text_value":null,"self_editable":true,"darf_ich":true},
             {"code":"ehrung","name":"Ehrung","value_kind":"text","multiple":false,"optionen":null,
              "option_value":null,"text_value":"25 Jahre","self_editable":true,"darf_ich":false},
             {"code":"intern","name":"Intern","value_kind":"text","self_editable":false,"darf_ich":false}]
            """,
        )
        val m = KontoLogik.merkmale(z)
        assertEquals(listOf("foto", "bereich", "mail", "ehrung"), m.map { it.code })
        assertEquals(Merkmal.Darstellung.JA_NEIN, m[0].darstellung)
        assertTrue(m[0].gesetzt)
        assertTrue(m[0].beschreibung.startsWith("Dürfen wir dich"))
        assertEquals(Merkmal.Darstellung.LISTE, m[1].darstellung)
        assertEquals(listOf("jugend", "technik"), m[1].werte.map { it.option })
        assertEquals(emptyList<MerkmalZeile.Option>(), KontoLogik.freieOptionen(m[1]))
        assertEquals(Merkmal.Darstellung.EINZELWAHL, m[2].darstellung)
        assertFalse(m[2].gesetzt)
        assertEquals(listOf("alle", "keine"), KontoLogik.freieOptionen(m[2]).map { it.value })
        assertEquals(Merkmal.Darstellung.NUR_LESEN, m[3].darstellung)
        assertEquals("25 Jahre · nur der Verein kann das ändern", KontoLogik.nurLesenText(m[3]))
        assertTrue(KontoLogik.zeigeEinwilligungen(z))
        assertFalse(KontoLogik.zeigeEinwilligungen(listOf(z[5])))
        assertFalse(KontoLogik.zeigeEinwilligungen(null))
    }

    @Test
    fun darstellungDerMerkmale() {
        fun merkmal(art: String, multiple: Boolean = false, optionen: Int = 0, darfIch: Boolean = true) = Merkmal(
            code = "x", name = "x", beschreibung = "", art = art, multiple = multiple, darfIch = darfIch,
            optionen = List(optionen) { MerkmalZeile.Option("o$it") }, werte = emptyList(),
        )
        assertEquals(Merkmal.Darstellung.NUR_LESEN, merkmal("boolean", darfIch = false).darstellung)
        // Mehr als vier Optionen oder nur eine: als Liste mit Marken
        assertEquals(Merkmal.Darstellung.LISTE, merkmal("list", optionen = 5).darstellung)
        assertEquals(Merkmal.Darstellung.LISTE, merkmal("list", optionen = 1).darstellung)
        assertEquals(Merkmal.Darstellung.EINZELWAHL, merkmal("list", optionen = 4).darstellung)
        assertEquals(Merkmal.Darstellung.EINGABE, merkmal("date").darstellung)
        assertEquals(Merkmal.Darstellung.EINGABE, merkmal("number").darstellung)
        assertEquals("nicht gesetzt · nur der Verein kann das ändern", KontoLogik.nurLesenText(merkmal("text", darfIch = false)))
    }

    @Test
    fun erscheinungsbild() {
        assertEquals(listOf("System", "Hell", "Dunkel"), Erscheinungsbild.entries.map { it.titel })
        assertTrue(Erscheinungsbild.SYSTEM.dunkel(systemDunkel = true))
        assertFalse(Erscheinungsbild.HELL.dunkel(systemDunkel = true))
        assertTrue(Erscheinungsbild.DUNKEL.dunkel(systemDunkel = false))
        // Unbekanntes oder nichts Gespeichertes folgt dem System.
        assertEquals(Erscheinungsbild.SYSTEM, Erscheinungsbild.aus(null))
        assertEquals(Erscheinungsbild.SYSTEM, Erscheinungsbild.aus("bunt"))
    }
}
