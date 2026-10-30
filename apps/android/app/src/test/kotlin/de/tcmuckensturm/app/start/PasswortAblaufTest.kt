package de.tcmuckensturm.app.start

import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.AuthFehlerForm
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Wie PasswortAblaufTests der iOS-App: Regeln, Texte und der Ablauf beim Oeffnen eines Links. */
class PasswortAblaufTest {
    private val ich = AngemeldetesKonto(nutzerId = "4f1c0b7e-0000-4000-8000-000000000001", email = "ich@tcm.local")

    private fun token(sub: String): String {
        val nutzlast = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"sub":"$sub"}""".toByteArray())
        return "kopf.$nutzlast.signatur"
    }

    // ---- Regeln ---------------------------------------------------------------

    @Test
    fun mindestensAchtZeichen() {
        assertEquals(PasswortTexte.ZU_KURZ, PasswortRegeln.pruefen("1234567", "1234567"))
        assertNull(PasswortRegeln.pruefen("12345678", "12345678"))
    }

    @Test
    fun beideEingabenMuessenGleichSein() {
        assertEquals(PasswortTexte.UNGLEICH, PasswortRegeln.pruefen("12345678", "12345679"))
    }

    @Test
    fun laengeVorVergleich() {
        assertEquals(PasswortTexte.ZU_KURZ, PasswortRegeln.pruefen("kurz", "anders"))
    }

    /** Zaehlt wie String.length in JavaScript: ein Emoji sind zwei Einheiten. */
    @Test
    fun zaehltWieJavaScript() {
        assertNull(PasswortRegeln.pruefen("🎾🎾🎾🎾", "🎾🎾🎾🎾"))
    }

    @Test
    fun texteWieInDerExpoApp() {
        assertEquals("Passwort festlegen", PasswortTexte.SETZEN_TITEL)
        assertEquals("Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs.", PasswortTexte.UNTERWEGS)
        assertEquals("Dieser Link ist abgelaufen oder wurde schon benutzt.", PasswortTexte.ABGELAUFEN)
    }

    // ---- Beim Oeffnen eines Links ---------------------------------------------

    @Test
    fun ohneAnmeldungWirdEingeloest() {
        val einloesen = PasswortAblauf.Schritt.Einloesen(abmelden = false)
        assertEquals(einloesen, PasswortAblauf.beimOeffnen(LinkInhalt.Token("h", LinkTyp.RECOVERY), null))
        assertEquals(einloesen, PasswortAblauf.beimOeffnen(LinkInhalt.Fragment(token(ich.nutzerId), "r"), null))
    }

    @Test
    fun tokenBeiAnmeldungFragtErst() {
        assertEquals(
            PasswortAblauf.Schritt.Rueckfrage("ich@tcm.local"),
            PasswortAblauf.beimOeffnen(LinkInhalt.Token("h", LinkTyp.INVITE), ich),
        )
    }

    @Test
    fun fragmentFuerEinAnderesKontoFragtErst() {
        val fremd = LinkInhalt.Fragment(token("00000000-0000-4000-8000-000000000002"), "r")
        assertEquals(PasswortAblauf.Schritt.Rueckfrage("ich@tcm.local"), PasswortAblauf.beimOeffnen(fremd, ich))
        // Ein Token, aus dem sich nichts lesen laesst, gilt als fremd.
        assertEquals(
            PasswortAblauf.Schritt.Rueckfrage("ich@tcm.local"),
            PasswortAblauf.beimOeffnen(LinkInhalt.Fragment("kaputt", "r"), ich),
        )
    }

    @Test
    fun fragmentFuersEigeneKontoOhneRueckfrage() {
        val eigen = LinkInhalt.Fragment(token("4F1C0B7E-0000-4000-8000-000000000001"), "r")
        assertEquals(PasswortAblauf.Schritt.Einloesen(abmelden = false), PasswortAblauf.beimOeffnen(eigen, ich))
    }

    @Test
    fun nachBestaetigungWirdAbgemeldet() {
        assertEquals(PasswortAblauf.Schritt.Einloesen(abmelden = true), PasswortAblauf.nachBestaetigung)
    }

    @Test
    fun ungueltigerLinkMeldetAbgelaufen() {
        assertEquals(PasswortAblauf.Schritt.Fehler(PasswortTexte.ABGELAUFEN), PasswortAblauf.beimOeffnen(LinkInhalt.Ungueltig, null))
        assertEquals(PasswortAblauf.Schritt.Fehler(PasswortTexte.ABGELAUFEN), PasswortAblauf.beimOeffnen(LinkInhalt.Ungueltig, ich))
    }

    @Test
    fun ohneTokenNurMitAnmeldung() {
        assertEquals(PasswortAblauf.Schritt.Fehler(PasswortTexte.OHNE_TOKEN), PasswortAblauf.beimOeffnen(LinkInhalt.Ohne, null))
        assertEquals(PasswortAblauf.Schritt.EigenesKonto, PasswortAblauf.beimOeffnen(LinkInhalt.Ohne, ich))
    }

    @Test
    fun rueckfrageText() {
        assertEquals(
            "Du bist als ich@tcm.local angemeldet. Mit diesem Link meldest du dich ab und setzt das Passwort für ein anderes Konto. Fortfahren?",
            PasswortTexte.rueckfrage("ich@tcm.local"),
        )
        assertEquals(
            "Du bist mit einem anderen Konto angemeldet. Mit diesem Link meldest du dich ab und setzt das Passwort für ein anderes Konto. Fortfahren?",
            PasswortTexte.rueckfrage(null),
        )
    }

    @Test
    fun einloeseFehler() {
        assertEquals(PasswortTexte.KEIN_NETZ, PasswortAblauf.einloeseFehlerText(null, zeitUeberschritten = true))
        assertEquals(PasswortTexte.ABGELAUFEN, PasswortAblauf.einloeseFehlerText(null))
        assertEquals(PasswortTexte.ABGELAUFEN, PasswortAblauf.einloeseFehlerText(AuthFehlerForm(code = "otp_expired", status = 403)))
        assertEquals(PasswortTexte.KEIN_NETZ, PasswortAblauf.einloeseFehlerText(AuthFehlerForm(ohneAntwort = true)))
        assertEquals(Anmeldefehler.SERVER, PasswortAblauf.einloeseFehlerText(AuthFehlerForm(status = 502)))
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, PasswortAblauf.einloeseFehlerText(AuthFehlerForm(status = 429)))
    }
}
