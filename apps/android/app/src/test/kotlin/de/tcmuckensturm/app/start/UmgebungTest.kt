package de.tcmuckensturm.app.start

import de.tcmuckensturm.app.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

/** Wie UmgebungTests der iOS-App. */
class UmgebungTest {
    private fun umgebung(site: String = "https://dev.tennisclub-muckensturm.de/", schema: String = "tcmdev") =
        Umgebung.aus("https://beispiel.supabase.co", "sb_publishable_x", site, schema)

    @Test
    fun liestAlleWerte() {
        val u = umgebung()
        assertEquals("https://beispiel.supabase.co", u.supabaseUrl)
        assertEquals("sb_publishable_x", u.supabaseKey)
        assertEquals("https://dev.tennisclub-muckensturm.de", u.siteUrl)
        assertEquals("tcmdev", u.urlSchema)
    }

    @Test
    fun fehlendeWerteWerfen() {
        val url = assertThrows(Umgebung.Fehler.Fehlt::class.java) { Umgebung.aus(" ", "k", "", "") }
        assertEquals(Umgebung.SCHLUESSEL_URL, url.schluessel)
        val key = assertThrows(Umgebung.Fehler.Fehlt::class.java) { Umgebung.aus("https://a.b", "", "", "") }
        assertEquals(Umgebung.SCHLUESSEL_KEY, key.schluessel)
    }

    @Test
    fun ungueltigeUrlWirft() {
        for (url in listOf("ftp://a.b", "keine adresse", "https://", "a.b")) {
            assertThrows(url, Umgebung.Fehler.Ungueltig::class.java) { Umgebung.aus(url, "k", "", "") }
        }
    }

    @Test
    fun ohneSiteGibtEsKeineWebLinks() {
        val u = umgebung(site = "")
        assertNull(u.siteUrl)
        assertNull(u.webLink("/antrag"))
    }

    @Test
    fun webLinkSetztGenauEinenSchraegstrich() {
        val u = umgebung(site = "https://dev.tennisclub-muckensturm.de//")
        assertEquals("https://dev.tennisclub-muckensturm.de/antrag", u.webLink("/antrag"))
        assertEquals("https://dev.tennisclub-muckensturm.de/antrag", u.webLink("antrag"))
    }

    @Test
    fun passwortRueckleitungUeberDasWeb() {
        assertEquals("https://dev.tennisclub-muckensturm.de/passwort-setzen", umgebung().passwortRueckleitung)
    }

    @Test
    fun passwortRueckleitungOhneWeb() {
        assertEquals("tcmlokal://passwort-setzen", umgebung(site = "", schema = "tcmlokal").passwortRueckleitung)
        assertNull(umgebung(site = "", schema = "").passwortRueckleitung)
    }

    /** Die Tests laufen mit der Variante lokal: eigenes Schema, kein Web. */
    @Test
    fun variantenwerteDerTestvariante() {
        assertEquals("tcmlokal", BuildConfig.URL_SCHEMA)
        assertEquals("", BuildConfig.SITE_URL)
    }
}
