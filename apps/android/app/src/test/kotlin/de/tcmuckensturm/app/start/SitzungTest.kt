package de.tcmuckensturm.app.start

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.daten.Antwort
import de.tcmuckensturm.app.daten.Pushdaten
import de.tcmuckensturm.app.daten.Serverattrappe
import de.tcmuckensturm.app.daten.client
import de.tcmuckensturm.app.daten.warteBis
import de.tcmuckensturm.app.push.Markenquelle
import de.tcmuckensturm.app.push.PushZentrale
import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.ZugangsGrund
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserSession
import java.io.File
import java.nio.file.Files
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Die Weiche mit dem echten Supabase-Client gegen nachgebaute Antworten von
 * Auth und PostgREST: wohin es nach dem Start und nach dem Anmelden geht, was
 * eine abgelaufene Sitzung bewirkt, An- und Abmelden, Passwort vergessen und
 * der Link aus der E-Mail. Die reine Entscheidung prueft StartLogikTest.
 */
@RunWith(AndroidJUnit4::class)
class SitzungTest {
    private val server = Serverattrappe()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var client: SupabaseClient? = null
    private var abgemeldet = 0

    @After
    fun aufraeumen() = runBlocking<Unit> {
        scope.cancel()
        client?.close()
    }

    private fun sitzung(gespeichert: UserSession? = null, push: PushZentrale? = null): Sitzung {
        val c = server.client(MemorySessionManager(gespeichert)).also { client = it }
        return Sitzung(Serverattrappe.UMGEBUNG, c, scope, push = push, nachAbmelden = { abgemeldet++ }).also { it.starten() }
    }

    /** Eine gespeicherte Sitzung; `abgelaufen`: das Zugriffstoken gilt seit einer Stunde nicht mehr. */
    private fun gespeichert(abgelaufen: Boolean = false) = UserSession(
        accessToken = "at-alt",
        refreshToken = "rt-alt",
        expiresIn = 3600,
        tokenType = "bearer",
        user = null,
        expiresAt = if (abgelaufen) Clock.System.now() - 1.hours else Clock.System.now() + 1.hours,
    )

    private fun Sitzung.wartetAuf(ziel: StartZiel) = warteBis("Ziel $ziel, ist ${this.ziel.value}") { this.ziel.value == ziel }

    private inline fun <reified T : PasswortZustand> Sitzung.wartetAufPasswort(): T {
        warteBis("Passwort-Zustand ${T::class.simpleName}, ist ${passwort.value}") { passwort.value is T }
        return passwort.value as T
    }

    private fun zugang(text: String = """[{"zugang":true,"grund":null,"onboarding_offen":false}]""") = server.rpc("mein_zugang", text)

    private fun anmeldungGelingt(zugriff: String = "at-1", email: String = "max@tcm.local") =
        server.auth("token") { Antwort.sitzung(zugriff, email) }

    // ---- Start ----------------------------------------------------------------

    @Test
    fun ohneSitzungZurAnmeldung() = runBlocking<Unit> {
        val s = sitzung()
        s.wartetAuf(StartZiel.Anmelden)
        // Ohne Sitzung wird der Server gar nicht gefragt.
        assertTrue(server.anfragen.isEmpty())
    }

    @Test
    fun gespeicherteSitzungFuehrtInDieTabs() = runBlocking<Unit> {
        zugang()
        val s = sitzung(gespeichert())
        s.wartetAuf(StartZiel.Tabs)
        // Gefragt wird mit dem Token der gespeicherten Sitzung.
        assertEquals("Bearer at-alt", server.rpcs("mein_zugang").first().kopf["Authorization"])
        assertTrue(server.auths("token").isEmpty())
    }

    /** Das Zugriffstoken ist abgelaufen, das Erneuern gelingt: weiter in die Tabs, mit dem neuen Token. */
    @Test
    fun abgelaufeneSitzungWirdErneuert() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt("at-neu")
        val s = sitzung(gespeichert(abgelaufen = true))
        s.wartetAuf(StartZiel.Tabs)
        val erneuern = server.auths("token").single()
        assertEquals("refresh_token", erneuern.abfrage["grant_type"])
        assertEquals("""{"refresh_token":"rt-alt"}""", erneuern.parameter)
        assertEquals("Bearer at-neu", server.rpcs("mein_zugang").last().kopf["Authorization"])
    }

    /** Auch das Erneuerungstoken gilt nicht mehr (lange nicht benutzt, woanders abgemeldet): zur Anmeldung. */
    @Test
    fun abgelaufeneSitzungOhneErneuernZurAnmeldung() = runBlocking<Unit> {
        zugang()
        server.auth("token") { Antwort.authFehler(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found") }
        val s = sitzung(gespeichert(abgelaufen = true))
        s.wartetAuf(StartZiel.Anmelden)
        assertEquals(1, server.auths("token").size)
        assertNull(client!!.auth.currentSessionOrNull())
    }

    /** Scheitert nur das Erneuern, weil das Netz fehlt, bleibt man angemeldet - die Tabs zeigen dann ihre Fehler. */
    @Test
    fun abgelaufeneSitzungOhneNetzBleibtAngemeldet() = runBlocking<Unit> {
        server.ohneNetz = true
        val s = sitzung(gespeichert(abgelaufen = true))
        s.wartetAuf(StartZiel.Tabs)
        assertEquals(0, abgemeldet)
    }

    // ---- Anmelden und die Weiche ----------------------------------------------

    @Test
    fun anmeldenFuehrtInDieTabs() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt()
        val s = sitzung()
        s.wartetAuf(StartZiel.Anmelden)

        assertNull(s.anmelden("  max@tcm.local ", " geheim 123 "))
        s.wartetAuf(StartZiel.Tabs)

        val anfrage = server.auths("token").single()
        assertEquals("password", anfrage.abfrage["grant_type"])
        // Die Adresse getrimmt, das Passwort unveraendert.
        assertEquals("\"max@tcm.local\"", anfrage.json["email"].toString())
        assertEquals("\" geheim 123 \"", anfrage.json["password"].toString())
        assertEquals("Bearer at-1", server.rpcAnfrage("mein_zugang").kopf["Authorization"])
    }

    @Test
    fun offenesOnboarding() = runBlocking<Unit> {
        zugang("""[{"zugang":true,"grund":null,"onboarding_offen":true}]""")
        anmeldungGelingt()
        val s = sitzung()
        assertNull(s.anmelden("max@tcm.local", "geheim123"))
        s.wartetAuf(StartZiel.Onboarding)

        // Fertig: in die Tabs, ohne mein_zugang noch einmal zu fragen.
        s.onboardingVerlassen()
        assertEquals(StartZiel.Tabs, s.ziel.value)
        assertEquals(1, server.rpcs("mein_zugang").size)
        // Ausserhalb des Onboardings tut der Aufruf nichts.
        s.onboardingVerlassen()
        assertEquals(StartZiel.Tabs, s.ziel.value)
    }

    /** Ausgetreten, archiviert, gesperrt: Hinweis statt leerer Seiten - und abgemeldet, damit der naechste Start bei der Anmeldung beginnt. */
    @Test
    fun keinZugangMeldetAb() = runBlocking<Unit> {
        zugang("""[{"zugang":false,"grund":"gesperrt","onboarding_offen":false}]""")
        anmeldungGelingt()
        server.auth("logout") { Antwort.LEER }
        val s = sitzung()
        assertNull(s.anmelden("max@tcm.local", "geheim123"))
        s.wartetAuf(StartZiel.KeinZugang(ZugangsGrund.GESPERRT))

        warteBis("nachAbmelden") { abgemeldet > 0 }
        assertEquals("global", server.auths("logout").single().abfrage["scope"])
        assertNull(client!!.auth.currentSessionOrNull())
        // Der Hinweis bleibt stehen, bis man selbst zur Anmeldung geht.
        assertEquals(StartZiel.KeinZugang(ZugangsGrund.GESPERRT), s.ziel.value)
        s.zurAnmeldung()
        assertEquals(StartZiel.Anmelden, s.ziel.value)
    }

    @Test
    fun unbekannterGrund() = runBlocking<Unit> {
        zugang("""[{"zugang":false,"grund":"neu_erfunden"}]""")
        anmeldungGelingt()
        server.auth("logout") { Antwort.LEER }
        val s = sitzung()
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.KeinZugang(ZugangsGrund.UNBEKANNT))
    }

    /** Faellt mein_zugang aus, geht es in die Tabs: die Datenbank weist ein offenes Konto ohnehin selbst ab. */
    @Test
    fun ohneAntwortAufMeinZugangInDieTabs() = runBlocking<Unit> {
        server.rpc("mein_zugang", Antwort(500, """{"message":"kaputt"}"""))
        anmeldungGelingt()
        val s = sitzung()
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)
    }

    @Test
    fun anmeldefehler() = runBlocking<Unit> {
        val s = sitzung()
        s.wartetAuf(StartZiel.Anmelden)
        suspend fun text(antwort: Antwort): String? {
            server.auth("token") { antwort }
            return s.anmelden("max@tcm.local", "falsch")
        }

        assertEquals(Anmeldefehler.ANMELDEDATEN_FALSCH, text(Antwort.authFehler(400, "invalid_credentials", "Invalid login credentials")))
        assertEquals(Anmeldefehler.GESPERRT, text(Antwort.authFehler(400, "user_banned", "User is banned")))
        assertEquals(Anmeldefehler.NICHT_BESTAETIGT, text(Antwort.authFehler(400, "email_not_confirmed", "Email not confirmed")))
        assertEquals(Anmeldefehler.ZU_VIELE_VERSUCHE, text(Antwort.authFehler(429, "over_request_rate_limit", "Too many requests")))
        assertEquals(Anmeldefehler.SERVER, text(Antwort(503, "Service Unavailable")))
        server.ohneNetz = true
        assertEquals(Anmeldefehler.VERBINDUNG, s.anmelden("max@tcm.local", "geheim123"))
        // Nichts davon wechselt den Bildschirm.
        assertEquals(StartZiel.Anmelden, s.ziel.value)
    }

    // ---- Abmelden ---------------------------------------------------------------

    private class Marke : Markenquelle {
        var verworfen = 0
        override suspend fun marke() = "fcm-1"
        override suspend fun verwerfen() {
            verworfen++
        }
    }

    private fun zentrale(quelle: Markenquelle): PushZentrale {
        val ordner = Files.createTempDirectory("sitzung-push").toFile()
        val speicher = PreferenceDataStoreFactory.create(scope = scope) { File(ordner, "einstellungen.preferences_pb") }
        return PushZentrale(speicher, quelle, erlaubt = { true }, geraet = "Pixel")
    }

    /** Erst die Marke abmelden, solange die Sitzung noch gilt, dann alle Sitzungen des Kontos beenden. */
    @Test
    fun abmeldenMeldetErstDasGeraetAb() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt()
        server.rpc("register_push_token", Antwort.LEER)
        server.rpc("remove_push_token", Antwort.LEER)
        server.auth("logout") { Antwort.LEER }
        val marke = Marke()
        val push = zentrale(marke)
        val s = sitzung(push = push)
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)
        assertTrue(push.anmelden(Pushdaten(client!!)).ok)

        s.abmelden()
        s.wartetAuf(StartZiel.Anmelden)

        val reihenfolge = server.anfragen.map { it.rpc ?: it.pfad }.filter { it == "remove_push_token" || it == "/auth/v1/logout" }
        assertEquals(listOf("remove_push_token", "/auth/v1/logout"), reihenfolge)
        assertEquals("Bearer at-1", server.rpcAnfrage("remove_push_token").kopf["Authorization"])
        assertEquals("global", server.auths("logout").single().abfrage["scope"])
        assertEquals(1, marke.verworfen)
        assertNull(client!!.auth.currentSessionOrNull())
        warteBis("nachAbmelden") { abgemeldet > 0 }
        assertEquals(1, abgemeldet)
    }

    /** Kein Netz oder Server gestoert: abgemeldet ist man trotzdem. */
    @Test
    fun abmeldenOhneNetz() = runBlocking<Unit> {
        zugang()
        val s = sitzung(gespeichert())
        s.wartetAuf(StartZiel.Tabs)
        server.ohneNetz = true
        s.abmelden()
        s.wartetAuf(StartZiel.Anmelden)
        assertNull(client!!.auth.currentSessionOrNull())
    }

    // ---- Passwort vergessen -----------------------------------------------------

    @Test
    fun passwortLinkAnfordern() = runBlocking<Unit> {
        server.auth("recover") { Antwort(200, "{}") }
        val s = sitzung()
        assertNull(s.passwortLinkAnfordern("  max@tcm.local "))
        val anfrage = server.auths("recover").single()
        assertEquals("\"max@tcm.local\"", anfrage.json["email"].toString())
        // Lokal ohne Web fuehrt der Link ueber das eigene Schema zurueck in die App.
        assertEquals("tcmlokal://passwort-setzen", anfrage.abfrage["redirect_to"])
    }

    /** Eine Stoerung wird gemeldet (sonst wartet jemand auf eine Mail, die nie kam) - "zu viele Versuche" nicht: das verriete, dass es die Adresse gibt. */
    @Test
    fun passwortLinkAnfordernFehler() = runBlocking<Unit> {
        val s = sitzung()
        server.auth("recover") { Antwort.authFehler(429, "over_email_send_rate_limit", "Email rate limit exceeded") }
        assertNull(s.passwortLinkAnfordern("max@tcm.local"))
        server.auth("recover") { Antwort(500, "Internal Server Error") }
        assertEquals(Anmeldefehler.SERVER, s.passwortLinkAnfordern("max@tcm.local"))
        // Eine Absage in der Sache (unbekannte Adresse o. Ae.) bleibt stumm.
        server.auth("recover") { Antwort.authFehler(400, "validation_failed", "Unable to validate email address") }
        assertNull(s.passwortLinkAnfordern("max@tcm.local"))
        server.ohneNetz = true
        assertEquals(Anmeldefehler.VERBINDUNG, s.passwortLinkAnfordern("max@tcm.local"))
    }

    // ---- Der Link aus der E-Mail --------------------------------------------------

    @Test
    fun fremderLinkGehoertNichtHierher() = runBlocking<Unit> {
        val s = sitzung()
        assertFalse(s.linkOeffnen("tcmlokal://plaetze"))
        assertFalse(s.linkOeffnen("https://example.org/passwort-setzen?token_hash=x&type=recovery"))
        assertNull(s.passwort.value)
    }

    @Test
    fun linkEinloesenUndPasswortSpeichern() = runBlocking<Unit> {
        zugang()
        server.auth("verify") { Antwort.sitzung("at-link", "erika@tcm.local") }
        server.auth("user") { Antwort(200, Antwort.nutzer("erika@tcm.local")) }
        val s = sitzung()
        s.wartetAuf(StartZiel.Anmelden)

        assertTrue(s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=abc123&type=recovery"))
        assertEquals(PasswortZustand.Bereit("erika@tcm.local"), s.wartetAufPasswort<PasswortZustand.Bereit>())
        val einloesen = server.auths("verify").single()
        assertEquals("\"abc123\"", einloesen.json["token_hash"].toString())
        assertEquals("\"recovery\"", einloesen.json["type"].toString())

        assertNull(s.passwortSpeichern("neues-passwort"))
        val speichern = server.auths("user").last { it.methode == "PUT" }
        assertEquals("""{"password":"neues-passwort"}""", speichern.parameter)
        assertEquals("Bearer at-link", speichern.kopf["Authorization"])

        // Fertig: zurueck in die Weiche, die laengst in den Tabs steht.
        s.passwortSchliessen()
        assertNull(s.passwort.value)
        s.wartetAuf(StartZiel.Tabs)
    }

    @Test
    fun einladungWirdAlsEinladungEingeloest() = runBlocking<Unit> {
        zugang()
        server.auth("verify") { Antwort.sitzung("at-link", "neu@tcm.local") }
        val s = sitzung()
        assertTrue(s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=abc&type=invite"))
        s.wartetAufPasswort<PasswortZustand.Bereit>()
        assertEquals("\"invite\"", server.auths("verify").single().json["type"].toString())
    }

    @Test
    fun linkAbgelaufenOderOhneNetz() = runBlocking<Unit> {
        val s = sitzung()
        server.auth("verify") { Antwort.authFehler(403, "otp_expired", "Email link is invalid or has expired") }
        s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=alt&type=recovery")
        assertEquals(PasswortZustand.Fehler(PasswortTexte.ABGELAUFEN), s.wartetAufPasswort<PasswortZustand.Fehler>())

        // Ohne Netz soll niemand lesen, der Link sei abgelaufen - er gilt ja noch.
        s.passwortSchliessen()
        server.ohneNetz = true
        s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=alt&type=recovery")
        assertEquals(PasswortZustand.Fehler(PasswortTexte.KEIN_NETZ), s.wartetAufPasswort<PasswortZustand.Fehler>())

        // Ein Link, den Supabase schon als fehlerhaft zurueckgibt, fragt den Server gar nicht.
        s.passwortSchliessen()
        val vorher = server.anfragen.size
        s.linkOeffnen("tcmlokal://passwort-setzen?error=access_denied&error_code=otp_expired")
        assertEquals(PasswortZustand.Fehler(PasswortTexte.ABGELAUFEN), s.passwort.value)
        s.passwortSchliessen()
        s.linkOeffnen("tcmlokal://passwort-setzen")
        assertEquals(PasswortZustand.Fehler(PasswortTexte.OHNE_TOKEN), s.passwort.value)
        assertEquals(vorher, server.anfragen.size)
    }

    /** Ist ein anderes Konto angemeldet, fragt die App erst - und meldet es vor dem Einloesen ab. */
    @Test
    fun linkMitAngemeldetemKontoFragtNach() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt()
        server.auth("logout") { Antwort.LEER }
        server.auth("verify") { Antwort.sitzung("at-link", "erika@tcm.local", id = "99999999-2222-4333-8444-555555555555") }
        val s = sitzung()
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)

        assertTrue(s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=abc&type=recovery"))
        assertEquals(PasswortZustand.Rueckfrage("max@tcm.local"), s.passwort.value)
        assertTrue(server.auths("verify").isEmpty())

        // "Abbrechen": nichts passiert, man bleibt angemeldet.
        s.passwortSchliessen()
        assertNull(s.passwort.value)
        s.linkBestaetigen()
        assertNull(s.passwort.value)
        assertTrue(server.auths("logout").isEmpty())

        // "Fortfahren": abmelden, dann einloesen.
        s.linkOeffnen("tcmlokal://passwort-setzen?token_hash=abc&type=recovery")
        s.linkBestaetigen()
        assertEquals(PasswortZustand.Bereit("erika@tcm.local"), s.wartetAufPasswort<PasswortZustand.Bereit>())
        val reihenfolge = server.anfragen.map { it.pfad }.filter { it.endsWith("/logout") || it.endsWith("/verify") }
        assertEquals(listOf("/auth/v1/logout", "/auth/v1/verify"), reihenfolge)
    }

    /** Ohne Link, aber angemeldet: das eigene Passwort aendern. */
    @Test
    fun linkOhneTokenMitSitzung() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt()
        val s = sitzung()
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)
        assertTrue(s.linkOeffnen("tcmlokal://passwort-setzen"))
        assertEquals(PasswortZustand.Bereit("max@tcm.local"), s.passwort.value)
    }

    @Test
    fun passwortSpeichernFehler() = runBlocking<Unit> {
        zugang()
        anmeldungGelingt()
        val s = sitzung()
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)
        server.auth("user") { Antwort.authFehler(422, "same_password", "New password should be different from the old password.") }
        assertEquals("Das neue Passwort muss sich vom bisherigen unterscheiden.", s.passwortSpeichern("geheim123"))
        server.auth("user") { Antwort.authFehler(422, "weak_password", "Password should be at least 8 characters.") }
        assertEquals("Das Passwort ist zu schwach. Bitte wähle ein längeres.", s.passwortSpeichern("kurz"))
        server.auth("user") { Antwort(500, "Internal Server Error") }
        assertEquals(Anmeldefehler.SERVER, s.passwortSpeichern("neues-passwort"))
        server.ohneNetz = true
        assertEquals(Anmeldefehler.VERBINDUNG, s.passwortSpeichern("neues-passwort", imKonto = true))
        server.ohneNetz = false
        // Die Sitzung gibt es beim Server nicht mehr (woanders abgemeldet). supabase-kt
        // verwirft sie danach auch auf dem Geraet; der zweite Versuch fragt gar nicht mehr.
        server.auth("user") { Antwort.authFehler(403, "session_not_found", "Session from session_id claim in JWT does not exist") }
        assertEquals("Der Link ist abgelaufen. Bitte fordere einen neuen an.", s.passwortSpeichern("neues-passwort"))
        assertEquals(Anmeldefehler.NEU_ANMELDEN, s.passwortSpeichern("neues-passwort", imKonto = true))
        // Das Token gehoert zu keiner Sitzung: Auth sagt bad_jwt - gleiche Folge.
        s.anmelden("max@tcm.local", "geheim123")
        s.wartetAuf(StartZiel.Tabs)
        server.auth("user") { Antwort.authFehler(403, "bad_jwt", "invalid claim: missing sub claim") }
        assertEquals(Anmeldefehler.NEU_ANMELDEN, s.passwortSpeichern("neues-passwort", imKonto = true))
    }

    /**
     * Ohne Sitzung auf dem Geraet sagt "Passwort speichern", dass der Link
     * abgelaufen ist bzw. dass man sich neu anmelden muss. Frueher kam hier der
     * allgemeine Satz: supabase-kt fragt ohne Sitzung mit dem oeffentlichen
     * Schluessel, und Auth antwortet 403 bad_jwt.
     */
    @Test
    fun passwortSpeichernOhneSitzung() = runBlocking<Unit> {
        server.auth("user") { Antwort.authFehler(403, "bad_jwt", "invalid claim: missing sub claim") }
        val s = sitzung()
        s.wartetAuf(StartZiel.Anmelden)
        assertEquals("Der Link ist abgelaufen. Bitte fordere einen neuen an.", s.passwortSpeichern("neues-passwort"))
        assertEquals(Anmeldefehler.NEU_ANMELDEN, s.passwortSpeichern("neues-passwort", imKonto = true))
    }
}
