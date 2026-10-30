package de.tcmuckensturm.app.start

import java.util.Base64
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Dieselben Faelle wie apps/mobile/src/lib/passwortlink.test.ts und PasswortlinkTests der iOS-App. */
class PasswortlinkTest {
    private fun link(adresse: String) = Passwortlink.auswerten(adresse)

    // ---- linkAuswerten (wie passwortlink.test.ts) ---------------------------

    @Test
    fun erkenntEinladungUndWiederherstellung() {
        assertEquals(
            LinkInhalt.Token("abc", LinkTyp.INVITE),
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=invite"),
        )
        assertEquals(
            LinkInhalt.Token("abc", LinkTyp.RECOVERY),
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=recovery"),
        )
    }

    @Test
    fun lehntFremdeOderFehlendeTypenAb() {
        assertEquals(LinkInhalt.Ungueltig, link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=magiclink"))
        assertEquals(LinkInhalt.Ungueltig, link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc"))
    }

    @Test
    fun nimmtBeiDoppeltenParameternDenErsten() {
        assertEquals(
            LinkInhalt.Token("a", LinkTyp.RECOVERY),
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=a&token_hash=b&type=recovery"),
        )
    }

    @Test
    fun meldetEinenFehlerAusDemLinkAlsUngueltig() {
        assertEquals(
            LinkInhalt.Ungueltig,
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?error=access_denied&error_code=otp_expired"),
        )
    }

    @Test
    fun nimmtImUebergangDieSitzungAusDemFragmentAn() {
        assertEquals(
            LinkInhalt.Fragment("a.b", "r"),
            link("https://app.tennisclub-muckensturm.de/passwort-setzen#access_token=a%2Eb&refresh_token=r&type=recovery"),
        )
    }

    @Test
    fun liestDasFragmentAusDemEigenenSchema() {
        assertEquals(LinkInhalt.Fragment("a", "r"), link("tcm://passwort-setzen#access_token=a&refresh_token=r"))
    }

    @Test
    fun tokenHashGehtDemFragmentVor() {
        assertEquals(
            LinkInhalt.Token("h", LinkTyp.INVITE),
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=invite#access_token=a&refresh_token=r"),
        )
    }

    @Test
    fun einFragmentOhneRefreshTokenReichtNicht() {
        assertEquals(LinkInhalt.Ohne, link("tcm://passwort-setzen#access_token=a"))
    }

    @Test
    fun meldetEinenFehlerImFragmentAlsUngueltig() {
        assertEquals(LinkInhalt.Ungueltig, link("tcm://passwort-setzen#error=access_denied&error_code=otp_expired"))
    }

    @Test
    fun ohneParameterKeinLink() {
        assertEquals(LinkInhalt.Ohne, link("https://app.tennisclub-muckensturm.de/passwort-setzen"))
        assertEquals(LinkInhalt.Ohne, Passwortlink.auswerten(emptyMap(), emptyMap()))
    }

    // ---- Welche Adressen die App annimmt ------------------------------------

    @Test
    fun nimmtBeideWebadressenUndAlleSchemataAn() {
        for (adresse in listOf(
            "https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://dev.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://dev.tennisclub-muckensturm.de/passwort-setzen/?token_hash=h&type=recovery",
            "https://APP.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "tcm://passwort-setzen?token_hash=h&type=recovery",
            "tcmdev://passwort-setzen?token_hash=h&type=recovery",
            "tcmlokal://passwort-setzen?token_hash=h&type=recovery",
            "tcm:///passwort-setzen?token_hash=h&type=recovery",
        )) {
            assertEquals(adresse, LinkInhalt.Token("h", LinkTyp.RECOVERY), link(adresse))
        }
    }

    @Test
    fun fremdeAdressenGehenDiePasswortBehandlungNichtsAn() {
        for (adresse in listOf(
            "https://boese.example/passwort-setzen?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de.boese.example/passwort-setzen?token_hash=h&type=recovery",
            "http://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de/login?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de/passwort-setzen/mehr",
            "tcm://buchung?token_hash=h&type=recovery",
            "anders://passwort-setzen?token_hash=h&type=recovery",
            "kein link mit leerzeichen",
        )) {
            assertNull(adresse, link(adresse))
        }
    }

    /** Wie URLSearchParams: "+" ist ein Leerzeichen, %xx wird dekodiert. */
    @Test
    fun parameterDekodierenWieURLSearchParams() {
        assertEquals(mapOf("a" to "x y", "b" to "+&", "c" to ""), Passwortlink.parameter("a=x+y&b=%2B%26&c&a=zweiter"))
        assertEquals(emptyMap<String, String>(), Passwortlink.parameter(null))
        // Kaputtes %xx bleibt stehen statt zu werfen
        assertEquals(mapOf("a" to "100%"), Passwortlink.parameter("a=100%"))
    }

    // ---- Nutzer-ID aus dem Token ----------------------------------------------

    @Test
    fun nutzerIdAusDemToken() {
        val nutzlast = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"sub":"4F1C0B7E-0000-4000-8000-000000000001","email":"a@b.de"}""".toByteArray())
        assertEquals("4f1c0b7e-0000-4000-8000-000000000001", Passwortlink.nutzerIdAusToken("kopf.$nutzlast.signatur"))
        assertNull(Passwortlink.nutzerIdAusToken("kein-token"))
        assertNull(Passwortlink.nutzerIdAusToken("a.b.c"))
    }

    // ---- mitFrist -------------------------------------------------------------

    @Test
    fun mitFristReichtDasErgebnisDurch() = runBlocking {
        assertEquals(1, mitFrist(1.seconds) { 1 })
    }

    @Test
    fun mitFristBrichtNachDerFristAb() = runBlocking {
        try {
            mitFrist(50.milliseconds) {
                delay(30.seconds)
                1
            }
            fail("Haette abbrechen muessen")
        } catch (e: Zeitueberschreitung) {
            assertTrue(true)
        }
    }
}
