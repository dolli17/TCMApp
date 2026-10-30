/*
 * Die Blaetter des Kontos (Bottom Sheets)
 *
 * Wie Bildschirme/Konto/KontoBlaetter.swift der iOS-App: Meine Daten und
 * Notfallkontakt (Stammdatenformular.tsx), Einwilligungen
 * (MerkmaleKarte.tsx), Bankverbindung & Mandat (MandatAnsicht), Passwort
 * aendern und die Kuendigung (KontoloeschungFormular.tsx). "Passwort ändern"
 * ist neu gegenueber der Expo-App und nimmt dieselben Regeln wie "Passwort
 * festlegen" (PasswortRegeln).
 *
 * Geschrieben wird ueber KontoAktionen - im Betrieb Kontodaten und Sitzung,
 * in den Screenshot-Tests eine Attrappe ohne Netz.
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.anmeldung.AnmeldeFeld
import de.tcmuckensturm.app.bildschirme.anmeldung.GelberKnopf
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Kontodaten
import de.tcmuckensturm.app.daten.MeinMandat
import de.tcmuckensturm.app.start.PasswortRegeln
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.start.Sitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Kontoloeschung
import kotlinx.coroutines.launch

/** Was die Blaetter schreiben. */
interface KontoAktionen {
    suspend fun speichereProfil(neu: Map<String, String>, alt: Map<String, String>): Ergebnis
    suspend fun speichereNotfallkontakt(werte: Map<String, String>): Ergebnis
    suspend fun setzeMerkmal(code: String, option: String? = null, text: String? = null): Ergebnis
    suspend fun entferneMerkmal(code: String, option: String? = null): Ergebnis

    /** null bei Erfolg, sonst der Satz fuer die Anzeige. */
    suspend fun passwortSpeichern(neu: String): String?
    suspend fun beantrageKontoloeschung(nachricht: String): Ergebnis
}

/** Im Betrieb: Kontodaten fuer die RPCs, die Sitzung fuer das Passwort. */
class SitzungsAktionen(private val daten: Kontodaten, private val sitzung: Sitzung) : KontoAktionen {
    override suspend fun speichereProfil(neu: Map<String, String>, alt: Map<String, String>) = daten.speichereProfil(neu, alt)
    override suspend fun speichereNotfallkontakt(werte: Map<String, String>) = daten.speichereNotfallkontakt(werte)
    override suspend fun setzeMerkmal(code: String, option: String?, text: String?) = daten.setzeMerkmal(code, option, text)
    override suspend fun entferneMerkmal(code: String, option: String?) = daten.entferneMerkmal(code, option)

    // imKonto: ist die Sitzung weg (401, session_not_found), heisst es "neu anmelden" statt "Link abgelaufen".
    override suspend fun passwortSpeichern(neu: String) = sitzung.passwortSpeichern(neu, imKonto = true)
    override suspend fun beantrageKontoloeschung(nachricht: String) = daten.beantrageKontoloeschung(nachricht)
}

fun KontoBlatt.titel(): String = when (this) {
    KontoBlatt.DATEN -> "Meine Daten"
    KontoBlatt.NOTFALL -> "Notfallkontakt"
    KontoBlatt.EINWILLIGUNGEN -> "Einwilligungen"
    KontoBlatt.BANK -> "Bankverbindung & Mandat"
    KontoBlatt.PASSWORT -> "Passwort ändern"
    KontoBlatt.LOESCHEN -> Kontoloeschung.TITEL
}

/** Das Blatt als Bottom Sheet, ganz aufgezogen; die Zurueck-Geste schliesst es. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KontoBlattFenster(
    art: KontoBlatt,
    inhalt: KontoInhalt?,
    email: String?,
    aktionen: KontoAktionen,
    zu: () -> Unit,
    gespeichert: (String) -> Unit,
    geaendert: () -> Unit,
    erneut: () -> Unit,
) {
    val f = TcmTheme.farben
    val zustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    // Erst zuschieben, dann entfernen - sonst springt das Blatt weg.
    val schliessen: () -> Unit = { scope.launch { zustand.hide() }.invokeOnCompletion { zu() } }
    ModalBottomSheet(
        onDismissRequest = zu,
        sheetState = zustand,
        containerColor = f.bg,
        shape = RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt),
        dragHandle = { BottomSheetDefaults.DragHandle(color = f.line2) },
    ) {
        KontoBlattInhalt(art, inhalt, email, aktionen, schliessen, gespeichert, geaendert, erneut)
    }
}

/** Der Inhalt eines Blatts, ohne das Sheet drumherum (auch fuer die Screenshot-Tests). */
@Composable
fun KontoBlattInhalt(
    art: KontoBlatt,
    inhalt: KontoInhalt?,
    email: String?,
    aktionen: KontoAktionen,
    zu: () -> Unit,
    gespeichert: (String) -> Unit,
    geaendert: () -> Unit,
    erneut: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(TcmTheme.farben.bg).imePadding()) {
        when (art) {
            KontoBlatt.DATEN, KontoBlatt.NOTFALL -> {
                val p = inhalt?.profil?.wert
                if (p == null) {
                    Rollend(art.titel(), zu) {
                        Fehlerzeile(inhalt?.profil?.fehler ?: "Deine Daten konnten nicht geladen werden.", erneut = erneut)
                    }
                } else if (art == KontoBlatt.DATEN) {
                    Stammdatenformular(
                        titel = art.titel(),
                        erklaerung = "Änderungen sind sofort für den Verein sichtbar. E-Mail und Geburtsdatum ändert der Vorstand.",
                        felder = stammdatenFelder,
                        werte = p.werte,
                        zu = zu,
                        speichern = { neu -> aktionen.speichereProfil(neu, p.werte) },
                        gespeichert = gespeichert,
                    )
                } else {
                    Stammdatenformular(
                        titel = art.titel(),
                        erklaerung = "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?",
                        felder = notfallFelder,
                        werte = p.werte,
                        zu = zu,
                        speichern = { neu -> aktionen.speichereNotfallkontakt(neu) },
                        gespeichert = gespeichert,
                    )
                }
            }
            KontoBlatt.EINWILLIGUNGEN -> Rollend(art.titel(), zu) {
                val fehler = inhalt?.merkmale?.fehler
                if (fehler != null) {
                    Fehlerzeile(fehler, erneut = erneut)
                } else {
                    Einwilligungen(KontoLogik.merkmale(inhalt?.merkmale?.wert.orEmpty()), aktionen, geaendert)
                }
            }
            KontoBlatt.BANK -> Rollend(art.titel(), zu) {
                val fehler = inhalt?.mandat?.fehler
                if (fehler != null) Fehlerzeile(fehler, erneut = erneut) else Bank(inhalt?.mandat?.wert)
            }
            KontoBlatt.PASSWORT -> PasswortAendern(email, aktionen, zu, gespeichert)
            KontoBlatt.LOESCHEN -> Rollend(art.titel(), zu) { KuendigungFormular(aktionen) }
        }
    }
}

@Composable
private fun Rollend(titel: String, zu: () -> Unit, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(start = Abstand.rand, end = Abstand.rand, bottom = Abstand.rand)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        BlattKopf(titel, zu)
        inhalt()
    }
}

/** Felder untereinander, Speichern angeheftet darunter (U76). */
@Composable
private fun ColumnScope.MitKnopf(knopf: @Composable () -> Unit, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .weight(1f, fill = false)
            .verticalScroll(rememberScrollState())
            .padding(start = Abstand.rand, end = Abstand.rand, bottom = Abstand.s),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
        content = inhalt,
    )
    Box(Modifier.padding(horizontal = Abstand.rand, vertical = Abstand.s).navigationBarsPadding()) { knopf() }
}

// ---- Meine Daten und Notfallkontakt -----------------------------------------

private data class Feld(
    val name: String,
    val label: String,
    val inhalt: ContentType? = null,
    val tastatur: KeyboardType = KeyboardType.Text,
    val gross: KeyboardCapitalization = KeyboardCapitalization.Sentences,
)

private val stammdatenFelder = listOf(
    Feld("first_name", "Vorname", ContentType.PersonFirstName, gross = KeyboardCapitalization.Words),
    Feld("last_name", "Nachname", ContentType.PersonLastName, gross = KeyboardCapitalization.Words),
    Feld("title", "Titel", ContentType.PersonNamePrefix),
    Feld("phone", "Telefon", ContentType.PhoneNumber, KeyboardType.Phone),
    Feld("mobile", "Mobil", ContentType.PhoneNumber, KeyboardType.Phone),
    Feld("street", "Straße", ContentType.AddressStreet, gross = KeyboardCapitalization.Words),
    Feld("postcode", "PLZ", ContentType.PostalCode, KeyboardType.Number),
    Feld("city", "Ort", ContentType.AddressLocality, gross = KeyboardCapitalization.Words),
)

private val notfallFelder = listOf(
    Feld("emergency_contact_name", "Name", ContentType.PersonFullName, gross = KeyboardCapitalization.Words),
    Feld("emergency_contact_phone", "Telefon", ContentType.PhoneNumber, KeyboardType.Phone),
    Feld("emergency_contact_relation", "Verhältnis"),
)

/** Ein Fehler mit Feld steht am Feld, nicht noch einmal oben. */
@Composable
private fun ColumnScope.Stammdatenformular(
    titel: String,
    erklaerung: String,
    felder: List<Feld>,
    werte: Map<String, String>,
    zu: () -> Unit,
    speichern: suspend (Map<String, String>) -> Ergebnis,
    gespeichert: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    // Der Entwurf startet beim gespeicherten Stand.
    val entwurf = remember { mutableStateMapOf<String, String>().apply { putAll(werte) } }
    var fehlerFeld by remember { mutableStateOf<String?>(null) }
    var meldung by remember { mutableStateOf<Ergebnis?>(null) }
    var laeuft by remember { mutableStateOf(false) }

    val absenden: () -> Unit = absenden@{
        if (laeuft) return@absenden
        laeuft = true
        scope.launch {
            val r = speichern(entwurf.toMap())
            laeuft = false
            if (r.ok) {
                gespeichert(r.meldung)
            } else {
                meldung = r
                fehlerFeld = r.feld
            }
        }
    }

    Box(Modifier.padding(horizontal = Abstand.rand)) { BlattKopf(titel, zu) }
    Spacer(Modifier.size(Abstand.m))
    MitKnopf(knopf = { GelberKnopf(if (laeuft) "Speichert…" else "Speichern", gesperrt = laeuft, aktion = absenden) }) {
        Leise(erklaerung)
        val m = meldung
        if (m != null && fehlerFeld == null) KontoHinweis(m.meldung, m.ok)
        for (feld in felder) {
            KontoFeld(
                label = feld.label,
                wert = entwurf[feld.name] ?: "",
                aendern = {
                    if (fehlerFeld == feld.name) fehlerFeld = null
                    entwurf[feld.name] = it
                },
                fehler = if (fehlerFeld == feld.name) meldung?.meldung else null,
                inhaltsTyp = feld.inhalt,
                tastatur = feld.tastatur,
                gross = feld.gross,
            )
        }
    }
}

// ---- Einwilligungen ---------------------------------------------------------

/**
 * Nur Merkmale, die das Mitglied selbst setzen darf. Ob es sie aendern darf,
 * entscheidet die Datenbank - darf_ich kommt fertig aus der RPC.
 */
@Composable
private fun Einwilligungen(merkmale: List<Merkmal>, aktionen: KontoAktionen, geaendert: () -> Unit) {
    val scope = rememberCoroutineScope()
    var laeuft by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<Ergebnis?>(null) }
    val texte = remember { mutableStateMapOf<String, String>() }

    fun ausfuehren(tun: suspend () -> Ergebnis) {
        if (laeuft) return
        laeuft = true
        scope.launch {
            val r = tun()
            laeuft = false
            meldung = r
            if (r.ok) {
                texte.clear()
                geaendert()
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(Abstand.s)) {
        Leise("Was du hier setzt, kannst du jederzeit wieder zurücknehmen.")
        meldung?.let { KontoHinweis(it.meldung, it.ok) }
        for (m in merkmale) {
            Column(Modifier.padding(top = Abstand.m), verticalArrangement = Arrangement.spacedBy(Abstand.xs)) {
                Text(m.name, style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.normal), color = TcmTheme.farben.ink)
                if (m.beschreibung.isNotEmpty()) Leise(m.beschreibung)
                Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(Abstand.xs)) {
                    when (m.darstellung) {
                        Merkmal.Darstellung.NUR_LESEN -> Leise(KontoLogik.nurLesenText(m))
                        Merkmal.Darstellung.JA_NEIN -> {
                            KontoSegmente(listOf(true to "Ja", false to "Nein"), m.gesetzt, gesperrt = laeuft) { ja ->
                                if (ja != m.gesetzt) {
                                    ausfuehren {
                                        if (ja) aktionen.setzeMerkmal(m.code, option = "true") else aktionen.entferneMerkmal(m.code)
                                    }
                                }
                            }
                            val seit = m.werte.firstOrNull()?.seit
                            if (m.gesetzt && seit != null) Leise("erteilt am ${KontoLogik.tagDatum(seit)}")
                        }
                        Merkmal.Darstellung.EINZELWAHL -> KontoSegmente(
                            m.optionen.map { it.value to (it.label ?: it.value) },
                            m.werte.firstOrNull()?.option,
                            untereinander = true,
                            gesperrt = laeuft,
                        ) { wert ->
                            if (wert != m.werte.firstOrNull()?.option) ausfuehren { aktionen.setzeMerkmal(m.code, option = wert) }
                        }
                        Merkmal.Darstellung.LISTE -> Liste(m, laeuft, ::ausfuehren, aktionen)
                        Merkmal.Darstellung.EINGABE -> Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(Abstand.s),
                        ) {
                            val text = texte[m.code] ?: m.werte.firstOrNull()?.text ?: ""
                            KontoFeld(
                                label = m.name,
                                wert = text,
                                aendern = { texte[m.code] = it },
                                tastatur = if (m.art == "number") KeyboardType.Decimal else KeyboardType.Text,
                                modifier = Modifier.weight(1f),
                            )
                            BlauerKnopf("Speichern", gesperrt = laeuft) { ausfuehren { aktionen.setzeMerkmal(m.code, text = text) } }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Liste(m: Merkmal, laeuft: Boolean, ausfuehren: (suspend () -> Ergebnis) -> Unit, aktionen: KontoAktionen) {
    val f = TcmTheme.farben
    val frei = KontoLogik.freieOptionen(m)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (m.werte.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (w in m.werte) {
                    val label = w.label ?: w.text ?: ""
                    Marke(gesetzt = true, gesperrt = laeuft, bedienName = "$label entfernen", onClick = {
                        ausfuehren { aktionen.entferneMerkmal(m.code, option = w.option) }
                    }) {
                        Text(label, style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = f.ink)
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Outlined.Close, contentDescription = null, tint = f.ink, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
        if (frei.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (o in frei) {
                    val label = o.label ?: o.value
                    Marke(gesetzt = false, gesperrt = laeuft, bedienName = "$label setzen", onClick = {
                        ausfuehren { aktionen.setzeMerkmal(m.code, option = o.value) }
                    }) {
                        Text("+ $label", style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = f.ink2)
                    }
                }
            }
        }
    }
}

@Composable
private fun Marke(
    gesetzt: Boolean,
    gesperrt: Boolean,
    bedienName: String,
    onClick: () -> Unit,
    inhalt: @Composable () -> Unit,
) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .heightIn(min = 36.dp)
            .then(if (gesetzt) Modifier.background(f.surf2, CircleShape) else Modifier)
            .border(1.dp, f.line2, CircleShape)
            .clip(CircleShape)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = bedienName }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { inhalt() }
}

@Composable
private fun BlauerKnopf(text: String, gesperrt: Boolean, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.knopf)
    Box(
        Modifier
            .heightIn(min = 50.dp)
            .alpha(if (gesperrt) 0.5f else 1f)
            .background(f.blue, form)
            .clip(form)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = f.onBrand)
    }
}

// ---- Bankverbindung & Mandat ------------------------------------------------

/** Nur zum Lesen - geaendert wird es ueber den Vorstand. */
@Composable
private fun Bank(m: MeinMandat?) {
    val f = TcmTheme.farben
    if (m == null) {
        Text(
            "Es liegt noch kein SEPA-Mandat vor. Bitte wende dich an den Vorstand.",
            style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
            color = f.ink,
        )
        return
    }
    Column(Modifier.fillMaxWidth().background(f.surf2, RoundedCornerShape(Radius.karte))) {
        KontoLogik.mandatZeilen(m).forEachIndexed { i, (titel, wert) ->
            if (i > 0) KontoLinie()
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp, horizontal = 16.dp)
                    .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Leise(titel)
                Text(
                    wert,
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.normal),
                    color = f.ink,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
    Leise("Die Bankverbindung ändert der Vorstand – schreib ihm, wenn sich etwas geändert hat.")
}

// ---- Passwort aendern -------------------------------------------------------

/** Neues Passwort fuer das angemeldete Konto, ohne Link aus der E-Mail. */
@Composable
private fun ColumnScope.PasswortAendern(email: String?, aktionen: KontoAktionen, zu: () -> Unit, gespeichert: (String) -> Unit) {
    val f = TcmTheme.farben
    val scope = rememberCoroutineScope()
    val passwort = rememberTextFieldState()
    val wiederholung = rememberTextFieldState()
    var fehler by rememberSaveable { mutableStateOf<String?>(null) }
    var laeuft by remember { mutableStateOf(false) }

    val speichern: () -> Unit = speichern@{
        if (laeuft) return@speichern
        fehler = PasswortRegeln.pruefen(passwort.text.toString(), wiederholung.text.toString())
        if (fehler != null) return@speichern
        laeuft = true
        scope.launch {
            val meldung = aktionen.passwortSpeichern(passwort.text.toString())
            laeuft = false
            if (meldung != null) fehler = meldung else gespeichert("Passwort gespeichert.")
        }
    }

    Box(Modifier.padding(horizontal = Abstand.rand)) { BlattKopf("Passwort ändern", zu) }
    Spacer(Modifier.size(Abstand.m))
    MitKnopf(knopf = { GelberKnopf(if (laeuft) "Wird gespeichert…" else "Speichern", gesperrt = laeuft, aktion = speichern) }) {
        if (email != null) {
            Text(
                buildAnnotatedString {
                    append("Für das Konto ")
                    withStyle(SpanStyle(fontWeight = Schrift.gewichtFett)) { append(email) }
                },
                style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp),
                color = f.ink2,
            )
        }
        Leise(PasswortTexte.SETZEN_UNTERZEILE)
        AnmeldeFeld(
            beschriftung = "Neues Passwort",
            zustand = passwort,
            inhaltsTyp = ContentType.NewPassword,
            passwort = true,
        )
        AnmeldeFeld(
            beschriftung = "Noch einmal",
            bedienName = "Passwort wiederholen",
            zustand = wiederholung,
            inhaltsTyp = ContentType.NewPassword,
            passwort = true,
            absenden = ImeAction.Go,
            beimAbsenden = speichern,
        )
        fehler?.let { KontoHinweis(it) }
    }
}

// ---- Kuendigung -------------------------------------------------------------

/**
 * Erklaerung, freiwillige Nachricht, dann eine Rueckfrage im Blatt selbst.
 * Rot als Schrift und Rahmen, nicht als Flaeche (U44).
 */
@Composable
private fun KuendigungFormular(aktionen: KontoAktionen) {
    val scope = rememberCoroutineScope()
    var nachricht by rememberSaveable { mutableStateOf("") }
    var rueckfrage by rememberSaveable { mutableStateOf(false) }
    var laeuft by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<Ergebnis?>(null) }

    fun senden() {
        if (laeuft) return
        laeuft = true
        scope.launch {
            val r = aktionen.beantrageKontoloeschung(nachricht)
            laeuft = false
            rueckfrage = false
            meldung = r
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(Abstand.s)) {
        for (satz in Kontoloeschung.erklaerung) {
            Text(
                satz,
                style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal).copy(lineHeight = 22.sp),
                color = TcmTheme.farben.ink,
            )
        }
        meldung?.let { KontoHinweis(it.meldung, it.ok) }
        if (meldung?.ok == true) return@Column
        KontoFeld(
            label = Kontoloeschung.NACHRICHT_LABEL,
            wert = nachricht,
            aendern = { nachricht = it.take(Kontoloeschung.NACHRICHT_MAX) },
            mehrzeilig = true,
            gesperrt = laeuft,
            modifier = Modifier.padding(top = Abstand.s),
        )
        if (rueckfrage) {
            Text(
                Kontoloeschung.BESTAETIGUNG_FRAGE,
                style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal),
                color = TcmTheme.farben.ink,
                modifier = Modifier.padding(top = Abstand.s),
            )
            LeiserKnopf(if (laeuft) "Wird gesendet…" else Kontoloeschung.BESTAETIGEN, rot = true, gesperrt = laeuft, aktion = ::senden)
            LeiserKnopf(Kontoloeschung.ABBRECHEN, gesperrt = laeuft) { rueckfrage = false }
        } else {
            Box(Modifier.padding(top = Abstand.s)) {
                LeiserKnopf(Kontoloeschung.ABSENDEN, rot = true) {
                    meldung = null
                    rueckfrage = true
                }
            }
        }
    }
}
