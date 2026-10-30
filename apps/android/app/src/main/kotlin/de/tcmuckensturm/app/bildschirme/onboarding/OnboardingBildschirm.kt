/*
 * Onboarding nach dem ersten Login (apps/mobile/app/onboarding.tsx,
 * Bildschirme/Onboarding/OnboardingBildschirm.swift der iOS-App)
 *
 * Derselbe Assistent wie im Web, in der Expo-App und in iOS: Reihenfolge,
 * Titel und welche Schritte Pflicht sind, kommen aus kern/Onboarding.kt
 * (onboardingSchritte), was erledigt ist, aus my_onboarding(). Gespeichert
 * wird je Schritt ueber die Onboarding-RPCs (daten/Onboardingdaten.kt); die
 * Datenbank prueft alles noch einmal selbst.
 *
 * Mit dem SEPA-Mandat ruft der Assistent complete_onboarding() - dann ist
 * das Konto freigeschaltet. Einwilligungen, Tennis und App-Einstellungen
 * folgen danach, lassen sich ueberspringen und bleiben im Konto erreichbar.
 * Fertig (oder kein Mitglied, etwa der Kiosk) geht es ueber
 * Sitzung.onboardingVerlassen() in die Tabs.
 *
 * Erreichbar bleiben waehrenddessen nur Abmelden, Datenschutz und Impressum
 * und die Rechtstexte selbst - alles uebrige sperren Weiche und Datenbank.
 * Die Zurueck-Geste geht einen Schritt zurueck, solange es einen gibt.
 *
 * Der Stand lebt im OnboardingModell (ViewModel), damit er eine neu
 * gebaute Activity (etwa nach dem Wechsel auf dunkles System) uebersteht.
 */

package de.tcmuckensturm.app.bildschirme.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.Kapsel
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.bildschirme.Hinweis
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.LeiserKnopf
import de.tcmuckensturm.app.daten.Abschluss
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Kontodaten
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.Onboardingdaten
import de.tcmuckensturm.app.daten.OnboardingZustand
import de.tcmuckensturm.app.push.PushSchalter
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.Sitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Onboarding
import de.tcmuckensturm.kern.OnboardingSchrittKey
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---- Was die Schritte brauchen ----------------------------------------------

/** Alles, was der Assistent liest und schreibt; im Test ohne Netz ersetzbar (wie KontoAktionen). */
interface OnboardingAktionen {
    /** Wirft eine Meldung; null ohne Mitglied. */
    suspend fun laden(): OnboardingZustand?
    suspend fun schliesseAb(): Abschluss
    suspend fun speichereStammdaten(werte: Map<String, String>): Ergebnis
    suspend fun akzeptiereDokumente(codes: List<String>): Ergebnis
    suspend fun speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Boolean): Ergebnis
    suspend fun speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String): Ergebnis
    suspend fun erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Boolean): Ergebnis
    suspend fun speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Boolean): Ergebnis
    suspend fun setzeMerkmal(code: String, option: String): Ergebnis
    suspend fun entferneMerkmal(code: String): Ergebnis

    /** null bei Erfolg, sonst der Text fuer die Anzeige. */
    suspend fun passwortSpeichern(neu: String): String?
}

/** Im Betrieb: Onboardingdaten, Merkmale ueber Kontodaten, das Passwort ueber die Sitzung. */
class SitzungsOnboarding(private val sitzung: Sitzung) : OnboardingAktionen {
    private val daten = Onboardingdaten(sitzung.client)
    private val konto = Kontodaten(sitzung.client)

    override suspend fun laden() = daten.laden()
    override suspend fun schliesseAb() = daten.schliesseAb()
    override suspend fun speichereStammdaten(werte: Map<String, String>) = daten.speichereStammdaten(werte)
    override suspend fun akzeptiereDokumente(codes: List<String>) = daten.akzeptiereDokumente(codes)
    override suspend fun speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Boolean) =
        daten.speichereErziehungsberechtigte(name, email, telefon, zustimmung)
    override suspend fun speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String) =
        daten.speichereNotfallkontakt(name, telefon, verhaeltnis)
    override suspend fun erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Boolean) =
        daten.erteileMandat(iban, kontoinhaber, bestaetigt)
    override suspend fun speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Boolean) =
        daten.speichereTennis(lk, nuligaId, mannschaftInteresse)
    override suspend fun setzeMerkmal(code: String, option: String) = konto.setzeMerkmal(code, option = option)
    override suspend fun entferneMerkmal(code: String) = konto.entferneMerkmal(code)
    override suspend fun passwortSpeichern(neu: String) = sitzung.passwortSpeichern(neu)
}

// ---- Stand und Ablauf -------------------------------------------------------

sealed interface OnboardingLaden {
    data object Laeuft : OnboardingLaden
    data class Fehler(val text: String) : OnboardingLaden
    data class Da(val zustand: OnboardingZustand) : OnboardingLaden
}

data class OnboardingStand(
    val laden: OnboardingLaden = OnboardingLaden.Laeuft,
    /** Der gewaehlte Schritt; null heisst: der erste offene Pflichtschritt. */
    val schritt: OnboardingSchrittKey? = null,
    /** In dieser Sitzung freigeschaltet: die freiwilligen Schritte folgen noch, obwohl abgeschlossen_am schon gesetzt ist. */
    val freigeschaltet: Boolean = false,
    val hinweis: Ergebnis? = null,
)

class OnboardingModell(
    private val aktionen: OnboardingAktionen,
    /** Fertig oder kein Mitglied: Sitzung.onboardingVerlassen(). */
    private val verlassen: () -> Unit,
) : ViewModel() {
    private val _stand = MutableStateFlow(OnboardingStand())
    val stand: StateFlow<OnboardingStand> = _stand.asStateFlow()
    private var gestartet = false

    /** Beim ersten Erscheinen; eine neu gebaute Activity laedt nicht noch einmal. */
    fun starten() {
        if (gestartet) return
        gestartet = true
        erstesLaden()
    }

    fun erstesLaden() {
        _stand.update { it.copy(laden = OnboardingLaden.Laeuft) }
        viewModelScope.launch {
            try {
                val zustand = aktionen.laden()
                // Kein Mitglied (etwa der Kiosk) oder schon fertig: in die Tabs.
                if (zustand == null || (zustand.abgeschlossenAm != null && !_stand.value.freigeschaltet)) {
                    verlassen()
                } else {
                    _stand.update { it.copy(laden = OnboardingLaden.Da(zustand)) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _stand.update { it.copy(laden = OnboardingLaden.Fehler(Meldung.aus(e).text)) }
            }
        }
    }

    fun zurueck(zu: OnboardingSchrittKey) {
        _stand.update { it.copy(schritt = zu, hinweis = null) }
    }

    /**
     * Nach dem Speichern eines Schritts: neu laden, beim Verlassen des Mandats
     * freischalten, dann zum naechsten Schritt. Der Zustand wird neu gelesen,
     * weil sich mit dem Geburtsdatum die Schritte aendern koennen. Laeuft im
     * Modell weiter, auch wenn der Schritt, der es ausloeste, schon weg ist.
     */
    suspend fun weiter(von: OnboardingSchrittKey): Ergebnis = viewModelScope.async { weiterIntern(von) }.await()

    private suspend fun weiterIntern(aktuell: OnboardingSchrittKey): Ergebnis {
        val neu = try {
            aktionen.laden()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return Ergebnis.fehler(Meldung.aus(e).text)
        }
        if (neu == null) {
            verlassen()
            return Ergebnis.erfolg("")
        }
        _stand.update { it.copy(laden = OnboardingLaden.Da(neu), hinweis = null) }

        val liste = neu.schritte
        val hier = liste.indexOfFirst { it.key == aktuell }.coerceAtLeast(0)
        val sepaHier = liste.indexOfFirst { it.key == Onboarding.letzterPflichtschritt }.coerceAtLeast(0)

        if (!_stand.value.freigeschaltet && hier >= sepaHier) {
            val abschluss = aktionen.schliesseAb()
            if (!abschluss.ergebnis.ok) {
                val ziel = abschluss.fehlt.firstOrNull() ?: return abschluss.ergebnis
                _stand.update { it.copy(schritt = ziel, hinweis = abschluss.ergebnis) }
                return Ergebnis.erfolg("")
            }
            _stand.update { it.copy(freigeschaltet = true, hinweis = Ergebnis.erfolg(OnboardingLogik.FREIGESCHALTET)) }
        }

        if (hier + 1 >= liste.size) {
            verlassen()
            return Ergebnis.erfolg("")
        }
        _stand.update { it.copy(schritt = liste[hier + 1].key) }
        return Ergebnis.erfolg("")
    }
}

/** Was jeder Schritt braucht (SchrittEigenschaften in onboarding.tsx). */
class OnboardingKontext(
    val zustand: OnboardingZustand,
    val aktionen: OnboardingAktionen,
    val weiter: suspend () -> Ergebnis,
    val zurueck: (() -> Unit)?,
    val ueberspringen: (suspend () -> Ergebnis)?,
    val letzter: Boolean,
    /** "/satzung" -> Adresse im Web; ohne Basisadresse (lokal) null. */
    val webLink: (String) -> String?,
    /** "Mitteilungen aufs Handy" mit Erklaerung; in den Screenshot-Tests ohne Geraet. */
    val pushSchalter: @Composable (beschreibung: String) -> Unit,
)

// ---- Bildschirm -------------------------------------------------------------

@Composable
fun OnboardingBildschirm() {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    val aktionen = remember(sitzung) { SitzungsOnboarding(sitzung) }
    val modell = viewModel { OnboardingModell(aktionen) { sitzung.onboardingVerlassen() } }
    val stand by modell.stand.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { modell.starten() }

    OnboardingAnsicht(
        stand = stand,
        aktionen = aktionen,
        weiter = modell::weiter,
        zurueck = modell::zurueck,
        erneut = modell::erstesLaden,
        webLink = sitzung.umgebung::webLink,
        // Sitzung.abmelden meldet vorher das Geraet fuer Push ab - wie im Konto.
        abmelden = { scope.launch { sitzung.abmelden() } },
        pushSchalter = { PushSchalter(beschreibung = it) },
    )
}

/** Der Assistent ohne Sitzung und Netz - so zeichnen ihn auch die Screenshot-Tests. */
@Composable
fun OnboardingAnsicht(
    stand: OnboardingStand,
    aktionen: OnboardingAktionen,
    weiter: suspend (OnboardingSchrittKey) -> Ergebnis,
    zurueck: (OnboardingSchrittKey) -> Unit,
    erneut: () -> Unit,
    webLink: (String) -> String?,
    abmelden: () -> Unit,
    pushSchalter: @Composable (String) -> Unit,
) {
    val fuss: @Composable () -> Unit = { OnboardingFusszeile(webLink, abmelden) }
    when (val laden = stand.laden) {
        OnboardingLaden.Laeuft -> Box(
            Modifier.fillMaxSize().background(TcmTheme.farben.bg),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = TcmTheme.farben.blue)
        }
        is OnboardingLaden.Fehler ->
            OnboardingRahmen(OnboardingLogik.KICKER, "Das hat nicht geklappt", fusszeile = fuss) {
                Fehlerzeile(laden.text, erneut = erneut)
            }
        is OnboardingLaden.Da -> {
            val zustand = laden.zustand
            val schritte = zustand.schritte
            val (aktuell, index) = OnboardingLogik.aktuell(stand.schritt, zustand)
            val info = schritte[index]
            val erster = OnboardingLogik.ersterErreichbarer(schritte, stand.freigeschaltet)
            val zurueckZu: (() -> Unit)? = if (index > erster) ({ zurueck(schritte[index - 1].key) }) else null
            val kontext = OnboardingKontext(
                zustand = zustand,
                aktionen = aktionen,
                weiter = { weiter(aktuell) },
                zurueck = zurueckZu,
                ueberspringen = if (info.pflicht) null else ({ weiter(aktuell) }),
                letzter = index == schritte.size - 1,
                webLink = webLink,
                pushSchalter = pushSchalter,
            )
            BackHandler(enabled = zurueckZu != null) { zurueckZu?.invoke() }

            OnboardingRahmen(
                kicker = OnboardingLogik.kopfKicker(index, schritte.size),
                titel = info.titel,
                fortschritt = OnboardingLogik.fortschritt(schritte, index),
                fusszeile = fuss,
            ) {
                Text(
                    OnboardingLogik.einleitung(aktuell, zustand.minderjaehrig),
                    style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal).copy(lineHeight = 22.sp),
                    color = TcmTheme.farben.ink,
                )
                stand.hinweis?.let { Hinweis(it.meldung, ok = it.ok) }
                // Je Schritt ein frisches Formular.
                key(aktuell) {
                    when (aktuell) {
                        OnboardingSchrittKey.PASSWORT -> SchrittPasswort(kontext)
                        OnboardingSchrittKey.STAMMDATEN -> SchrittStammdaten(kontext)
                        OnboardingSchrittKey.RECHTLICHES -> SchrittRechtliches(kontext)
                        OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE -> SchrittErziehungsberechtigte(kontext)
                        OnboardingSchrittKey.NOTFALLKONTAKT -> SchrittNotfallkontakt(kontext)
                        OnboardingSchrittKey.SEPA -> SchrittSepa(kontext)
                        OnboardingSchrittKey.EINWILLIGUNGEN -> SchrittEinwilligungen(kontext)
                        OnboardingSchrittKey.TENNIS -> SchrittTennis(kontext)
                        OnboardingSchrittKey.EINSTELLUNGEN -> SchrittEinstellungen(kontext)
                    }
                }
            }
        }
    }
}

// ---- Rahmen -----------------------------------------------------------------

/** Kopf mit Kicker, Titel und Fortschritt, darunter der Inhalt und die Fusszeile. */
@Composable
fun OnboardingRahmen(
    kicker: String,
    titel: String,
    fortschritt: List<OnboardingLogik.Fortschritt>? = null,
    fusszeile: @Composable () -> Unit = {},
    inhalt: @Composable ColumnScope.() -> Unit,
) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxSize()
            .background(f.bg)
            // Statusleiste, Navigationsleiste und Tastatur (adjustResize, Edge-to-Edge)
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = Abstand.rand, end = Abstand.rand, bottom = Abstand.abschnitt),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Kicker(kicker)
            Text(
                titel,
                style = TcmSchrift.text(Schrift.gewichtExtrafett, 30.sp, Schrift.laufweiteTitel).copy(lineHeight = 34.sp),
                color = f.ink,
                modifier = Modifier.semantics { heading() },
            )
            if (fortschritt != null) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 6.dp).clearAndSetSemantics {},
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    for (s in fortschritt) {
                        val farbe = when (s) {
                            OnboardingLogik.Fortschritt.JETZT -> f.blue
                            OnboardingLogik.Fortschritt.ERLEDIGT -> f.green
                            OnboardingLogik.Fortschritt.OFFEN -> f.surf3
                        }
                        Box(Modifier.weight(1f).height(5.dp).background(farbe, Kapsel))
                    }
                }
            }
        }
        inhalt()
        fusszeile()
    }
}

/** Datenschutz und Impressum, und vor allem: Abmelden. */
@Composable
private fun OnboardingFusszeile(webLink: (String) -> String?, abmelden: () -> Unit) {
    val links = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().padding(top = Abstand.l),
        horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
    ) {
        webLink("/datenschutz")?.let { Verweis("Datenschutz") { links.openUri(it) } }
        webLink("/impressum")?.let { Verweis("Impressum") { links.openUri(it) } }
        Verweis("Abmelden", rot = true, aktion = abmelden)
    }
}

@Composable
private fun Verweis(text: String, rot: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Box(
        Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = aktion).padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = if (rot) f.redInk else f.ink2)
    }
}

// ---- Bausteine --------------------------------------------------------------

/**
 * Weiter, Ueberspringen, Zurueck. Ein Fehler beim Speichern bleibt hier
 * stehen; geht es weiter, verschwindet der Schritt ohnehin.
 */
@Composable
fun OnboardingKnoepfe(
    k: OnboardingKontext,
    weiterText: String = "Weiter",
    gesperrt: Boolean = false,
    speichern: suspend () -> Ergebnis,
) {
    val scope = rememberCoroutineScope()
    var laeuft by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<String?>(null) }

    val los: (suspend () -> Ergebnis) -> Unit = los@{ tun ->
        if (laeuft) return@los
        laeuft = true
        meldung = null
        scope.launch {
            val r = tun()
            laeuft = false
            if (!r.ok) meldung = r.meldung
        }
    }

    Column(Modifier.padding(top = Abstand.s), verticalArrangement = Arrangement.spacedBy(Abstand.s)) {
        meldung?.let { Hinweis(it) }
        Hauptknopf(if (laeuft) "Wird gespeichert…" else weiterText, gesperrt = laeuft || gesperrt) { los(speichern) }
        val zurueck = k.zurueck
        val ueberspringen = k.ueberspringen
        if (zurueck != null || ueberspringen != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(Abstand.s)) {
                if (zurueck != null) {
                    Box(Modifier.weight(1f)) { LeiserKnopf("Zurück", gesperrt = laeuft, aktion = zurueck) }
                }
                if (ueberspringen != null) {
                    Box(Modifier.weight(1f)) { LeiserKnopf("Überspringen", gesperrt = laeuft) { los(ueberspringen) } }
                }
            }
        }
    }
}

/** Ein Schalter mit Beschriftung und Erklaerung darunter (FormSchalter). Die ganze Zeile schaltet. */
@Composable
fun OnboardingSchalter(
    label: String,
    an: Boolean,
    umschalten: (Boolean) -> Unit,
    beschreibung: String? = null,
    gesperrt: Boolean = false,
) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = an, enabled = !gesperrt, role = Role.Switch, onValueChange = umschalten)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp), color = f.ink)
            if (!beschreibung.isNullOrEmpty()) Leise(beschreibung)
        }
        Switch(
            checked = an,
            onCheckedChange = null,
            enabled = !gesperrt,
            colors = SwitchDefaults.colors(checkedTrackColor = f.green, checkedBorderColor = f.green),
        )
    }
}
