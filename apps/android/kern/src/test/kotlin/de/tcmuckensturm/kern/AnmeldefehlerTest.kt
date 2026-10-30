package de.tcmuckensturm.kern

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Dieselben Faelle wie packages/core/src/anmeldefehler.test.ts (und AnmeldefehlerTests der iOS-App). */
class AnmeldefehlerTest {
    private fun text(form: AuthFehlerForm?) = Anmeldefehler.anmeldeFehlerText(form)

    @Test
    fun `falsche Daten bleiben ein Satz`() {
        assertEquals(Anmeldefehler.ANMELDEDATEN_FALSCH, text(AuthFehlerForm(code = "invalid_credentials", status = 400)))
        assertEquals(Anmeldefehler.ANMELDEDATEN_FALSCH, text(null))
        assertEquals(Anmeldefehler.ANMELDEDATEN_FALSCH, text(AuthFehlerForm(code = "user_not_found", status = 400)))
    }

    @Test
    fun `fehlende Verbindung`() {
        assertEquals(Anmeldefehler.VERBINDUNG, text(AuthFehlerForm(status = 0, nachricht = "Failed to fetch", ohneAntwort = true)))
        // Auch nur am Text erkannt
        assertEquals(Anmeldefehler.VERBINDUNG, text(AuthFehlerForm(nachricht = "TypeError: fetch failed")))
    }

    @Test
    fun `Serverfehler ist kein falsches Passwort`() {
        assertEquals(Anmeldefehler.SERVER, text(AuthFehlerForm(status = 503, ohneAntwort = true)))
        assertEquals(Anmeldefehler.SERVER, text(AuthFehlerForm(status = 500, nachricht = "boom")))
    }

    @Test
    fun `zu viele Versuche`() {
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, text(AuthFehlerForm(code = "over_request_rate_limit", status = 429)))
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, text(AuthFehlerForm(status = 429)))
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, text(AuthFehlerForm(code = "over_email_send_rate_limit", status = 400)))
    }

    @Test
    fun `gesperrt und nicht bestaetigt`() {
        assertEquals(Anmeldefehler.GESPERRT, text(AuthFehlerForm(code = "user_banned", status = 400)))
        assertEquals(Anmeldefehler.NICHT_BESTAETIGT, text(AuthFehlerForm(code = "email_not_confirmed", status = 400)))
    }

    @Test
    fun `Texte wie in core`() {
        assertEquals("E-Mail-Adresse oder Passwort stimmt nicht.", Anmeldefehler.ANMELDEDATEN_FALSCH)
        assertEquals(
            "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut.",
            Anmeldefehler.VERBINDUNG,
        )
    }

    @Test
    fun `Stoerung verraet nichts ueber die Adresse`() {
        assertNull(Anmeldefehler.stoerungText(null))
        assertNull(Anmeldefehler.stoerungText(AuthFehlerForm(code = "invalid_credentials", status = 400)))
        assertNull(Anmeldefehler.stoerungText(AuthFehlerForm(code = "user_not_found", status = 400)))
        assertEquals(
            Anmeldefehler.ZU_VIELE_VERSUCHE,
            Anmeldefehler.stoerungText(AuthFehlerForm(code = "over_email_send_rate_limit", status = 429)),
        )
        assertEquals(Anmeldefehler.VERBINDUNG, Anmeldefehler.stoerungText(AuthFehlerForm(status = 0, ohneAntwort = true)))
    }

    @Test
    fun `Passwortfehler bekannte Faelle`() {
        val p = Anmeldefehler::passwortFehlerText
        assertTrue(p(AuthFehlerForm(code = "same_password", status = 422), false).contains("unterscheiden"))
        assertTrue(p(AuthFehlerForm(code = "weak_password", status = 422), false).contains("zu schwach"))
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, p(AuthFehlerForm(status = 429), false))
        assertEquals(Anmeldefehler.VERBINDUNG, p(AuthFehlerForm(status = 0, ohneAntwort = true), false))
        assertTrue(p(AuthFehlerForm(status = 401), false).contains("abgelaufen"))
        assertTrue(p(AuthFehlerForm(code = "session_not_found"), false).contains("abgelaufen"))
        // Im Konto gibt es keinen Link: dort heisst es neu anmelden.
        assertEquals(Anmeldefehler.NEU_ANMELDEN, p(AuthFehlerForm(status = 401), true))
        assertEquals(Anmeldefehler.NEU_ANMELDEN, p(AuthFehlerForm(code = "session_not_found", status = 403), true))
        assertTrue(p(AuthFehlerForm(code = "weak_password", status = 422), true).contains("zu schwach"))
    }

    @Test
    fun `Passwortfehler ohne englischen Rohtext`() {
        val text = Anmeldefehler.passwortFehlerText(
            AuthFehlerForm(code = "unexpected_failure", status = 400, nachricht = "Something broke"),
        )
        assertFalse(text.contains("Something"))
    }
}
