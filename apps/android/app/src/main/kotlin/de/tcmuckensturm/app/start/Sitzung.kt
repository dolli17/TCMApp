/*
 * Sitzung und Weiche der App
 *
 * Haelt den Supabase-Client, hoert auf An- und Abmeldung und legt danach
 * fest, welcher Bildschirm zu sehen ist (StartLogik). An- und Abmelden laufen
 * nur hier durch - so gibt es fuer beides genau eine Stelle. Wie
 * App/Sitzung.swift der iOS-App.
 *
 * Dazu der Link aus der E-Mail (Einladung, Passwort vergessen): Solange einer
 * offen ist, liegt "Passwort festlegen" ueber der Weiche (PasswortAblauf).
 *
 * Lebt so lange wie die App (TcmApp), nicht wie ein Bildschirm.
 */

package de.tcmuckensturm.app.start

import de.tcmuckensturm.app.daten.Zugangsdaten
import de.tcmuckensturm.app.daten.authFehlerForm
import de.tcmuckensturm.kern.Anmeldefehler
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch

/** Was "Passwort festlegen" gerade zeigt. */
sealed interface PasswortZustand {
    /** Ein anderes Konto ist angemeldet - erst fragen. */
    data class Rueckfrage(val email: String?) : PasswortZustand

    /** Der Link wird eingeloest. */
    data object Laden : PasswortZustand

    /** Bereit fuer das neue Passwort; `konto` ist die Adresse, fuer die es gilt. */
    data class Bereit(val konto: String?) : PasswortZustand

    data class Fehler(val text: String) : PasswortZustand
}

class Sitzung(
    val umgebung: Umgebung,
    val client: SupabaseClient,
    private val scope: CoroutineScope,
) {
    private val _ziel = MutableStateFlow<StartZiel>(StartZiel.Laden)
    val ziel: StateFlow<StartZiel> = _ziel.asStateFlow()

    /** Der offene Link aus der E-Mail; null, solange keiner offen ist. */
    private val _passwort = MutableStateFlow<PasswortZustand?>(null)
    val passwort: StateFlow<PasswortZustand?> = _passwort.asStateFlow()

    private var beobachter: Job? = null

    /** Zaehlt Entscheidungen mit; eine aeltere, die spaeter fertig wird, verfaellt. */
    private var runde = 0

    /** Der Link, ueber den noch die Rueckfrage entscheidet. */
    private var offenerLink: LinkInhalt? = null

    /** Wie `runde`, fuer Links: oeffnet jemand einen neuen, verfaellt das Ergebnis des alten. */
    private var linkRunde = 0

    /** Startet die Beobachtung. Der erste Stand nach dem Laden meldet die gespeicherte Sitzung. */
    fun starten() {
        if (beobachter != null) return
        beobachter = scope.launch {
            client.auth.sessionStatus
                .mapNotNull(::angemeldet)
                // Token erneuert, Nutzer geaendert usw.: kein Wechsel des Bildschirms.
                .distinctUntilChanged()
                .collect { angemeldet ->
                    if (angemeldet) {
                        entscheiden()
                    } else {
                        // TODO (Widget-Spur): Schnappschuss des Widgets loeschen, wie WidgetBruecke.vergessen.
                        runde += 1
                        _ziel.value = StartLogik.nachAbmelden(_ziel.value)
                    }
                }
        }
    }

    /** null: noch nicht entschieden. Scheitert nur das Erneuern (kein Netz), bleibt man angemeldet. */
    private fun angemeldet(status: SessionStatus): Boolean? = when (status) {
        SessionStatus.Initializing -> null
        is SessionStatus.Authenticated, is SessionStatus.RefreshFailure -> true
        is SessionStatus.NotAuthenticated -> false
    }

    private suspend fun entscheiden() {
        runde += 1
        val meine = runde
        val zugang = Zugangsdaten(client).meinZugang()
        if (meine != runde) return
        val neu = StartLogik.ziel(angemeldet = true, zugang = zugang)
        _ziel.value = neu
        // Wie kein-zugang.tsx: abmelden, damit der naechste Start bei der Anmeldung beginnt.
        if (neu is StartZiel.KeinZugang) abmelden()
    }

    // ---- An- und Abmelden ---------------------------------------------------

    /**
     * Meldet an. Gibt bei Erfolg null zurueck, sonst den Text fuer die Anzeige.
     * Den Bildschirm wechselt danach die Weiche (sessionStatus).
     */
    suspend fun anmelden(email: String, passwort: String): String? = try {
        client.auth.signInWith(Email) {
            this.email = email.trim()
            this.password = passwort
        }
        null
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Anmeldefehler.anmeldeFehlerText(authFehlerForm(e))
    }

    /** Die eine Stelle zum Abmelden. */
    suspend fun abmelden() {
        // TODO (Push-Spur): vorher das Geraet abmelden (remove_push_token), solange die
        // Sitzung noch gilt - sonst bekommt es weiter die Nachrichten des Vorbesitzers.
        try {
            // Wie supabase-js und supabase-swift: alle Sitzungen des Kontos beenden.
            client.auth.signOut(SignOutScope.GLOBAL)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Kein Netz oder Server gestoert: abgemeldet ist man trotzdem.
            client.auth.clearSession()
        }
    }

    // ---- Passwort vergessen und setzen --------------------------------------

    /**
     * Fordert den Link zum Neusetzen an. Gibt bei Erfolg null zurueck, sonst den
     * Text fuer die Anzeige. Erfolg heisst nur "abgeschickt": ob es die Adresse
     * gibt, verraet die Antwort nicht (PasswortTexte.UNTERWEGS).
     */
    suspend fun passwortLinkAnfordern(email: String): String? = try {
        client.auth.resetPasswordForEmail(email.trim(), redirectUrl = umgebung.passwortRueckleitung)
        null
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        // Kein Netz oder Server gestoert: sonst wartet jemand auf eine Mail, die
        // nie verschickt wurde (U19). "Zu viele Versuche" dagegen nicht - das
        // meldet Auth nur fuer Adressen, die es gibt.
        val stoerung = Anmeldefehler.stoerungText(authFehlerForm(e))
        if (stoerung == Anmeldefehler.ZU_VIELE_VERSUCHE) null else stoerung
    }

    /**
     * Ein Link aus einem Intent: nimmt Links nach passwort-setzen an. Gibt
     * false zurueck, wenn der Link nicht hierher gehoert.
     */
    fun linkOeffnen(adresse: String): Boolean {
        val link = Passwortlink.auswerten(adresse) ?: return false
        linkRunde += 1
        offenerLink = link
        ausfuehren(PasswortAblauf.beimOeffnen(link, angemeldetesKonto()))
        return true
    }

    /** "Fortfahren" in der Rueckfrage: abmelden, dann den Link einloesen. */
    fun linkBestaetigen() {
        if (_passwort.value !is PasswortZustand.Rueckfrage) return
        ausfuehren(PasswortAblauf.nachBestaetigung)
    }

    /** "Abbrechen" in der Rueckfrage, "Zurueck" oder fertig: den Link verwerfen, zurueck in die Weiche. */
    fun passwortSchliessen() {
        linkRunde += 1
        offenerLink = null
        _passwort.value = null
    }

    /**
     * Speichert das neue Passwort. Gibt bei Erfolg null zurueck, sonst den Text fuer die Anzeige.
     * `imKonto`: aus dem Konto statt aus einem Mail-Link (andere Meldung ohne Sitzung).
     */
    suspend fun passwortSpeichern(neu: String, imKonto: Boolean = false): String? = try {
        client.auth.updateUser { password = neu }
        null
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Anmeldefehler.passwortFehlerText(authFehlerForm(e), imKonto)
    }

    private fun angemeldetesKonto(): AngemeldetesKonto? {
        val nutzer = client.auth.currentSessionOrNull()?.user ?: return null
        return AngemeldetesKonto(nutzerId = nutzer.id.lowercase(), email = nutzer.email)
    }

    private fun ausfuehren(schritt: PasswortAblauf.Schritt) {
        when (schritt) {
            is PasswortAblauf.Schritt.Rueckfrage -> _passwort.value = PasswortZustand.Rueckfrage(schritt.email)
            PasswortAblauf.Schritt.EigenesKonto -> {
                offenerLink = null
                _passwort.value = PasswortZustand.Bereit(client.auth.currentUserOrNull()?.email)
            }
            is PasswortAblauf.Schritt.Fehler -> {
                offenerLink = null
                _passwort.value = PasswortZustand.Fehler(schritt.text)
            }
            is PasswortAblauf.Schritt.Einloesen -> {
                val link = offenerLink ?: return
                offenerLink = null
                _passwort.value = PasswortZustand.Laden
                val meine = linkRunde
                scope.launch { einloesen(link, schritt.abmelden, meine) }
            }
        }
    }

    private suspend fun einloesen(link: LinkInhalt, vorherAbmelden: Boolean, meine: Int) {
        // Nie zwei Konten zugleich. Abgemeldet wird nur ueber die eine Stelle.
        if (vorherAbmelden) abmelden()
        val auth = client.auth
        try {
            val konto = mitFrist(FRIST) {
                when (link) {
                    is LinkInhalt.Token -> {
                        val art = if (link.typ == LinkTyp.INVITE) OtpType.Email.INVITE else OtpType.Email.RECOVERY
                        auth.verifyEmailOtp(type = art, tokenHash = link.tokenHash)
                        auth.currentUserOrNull()?.email
                    }
                    is LinkInhalt.Fragment -> {
                        // Uebergang, bis die Cloud-Vorlagen token_hash schicken (S20).
                        auth.importAuthToken(link.accessToken, link.refreshToken, retrieveUser = true)
                        auth.currentUserOrNull()?.email
                    }
                    LinkInhalt.Ungueltig, LinkInhalt.Ohne -> error("Kein Link zum Einloesen")
                }
            }
            if (meine != linkRunde) return
            _passwort.value = PasswortZustand.Bereit(konto)
        } catch (e: Zeitueberschreitung) {
            if (meine != linkRunde) return
            _passwort.value = PasswortZustand.Fehler(PasswortAblauf.einloeseFehlerText(null, zeitUeberschritten = true))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (meine != linkRunde) return
            _passwort.value = PasswortZustand.Fehler(PasswortAblauf.einloeseFehlerText(authFehlerForm(e)))
        }
    }

    /**
     * Das Onboarding ist fertig (oder gar nicht noetig, etwa beim Kiosk): in
     * die Tabs. Ohne neue Frage an mein_zugang - widerspraechen sich die
     * beiden RPCs, pendelte die Weiche sonst zwischen Onboarding und Tabs.
     */
    fun onboardingVerlassen() {
        if (_ziel.value != StartZiel.Onboarding) return
        runde += 1
        _ziel.value = StartZiel.Tabs
    }

    /** Von "Kein Zugang" zurueck zur Anmeldung. */
    fun zurAnmeldung() {
        runde += 1
        _ziel.value = StartZiel.Anmelden
    }

    companion object {
        /** Laenger wartet niemand vor einem Ladekreis (wie FRIST_MS in passwort-setzen.tsx). */
        val FRIST = 15.seconds
    }
}
