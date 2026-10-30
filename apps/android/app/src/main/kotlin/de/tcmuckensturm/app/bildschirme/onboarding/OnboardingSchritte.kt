/*
 * Die Schritte des Onboardings (die Schritt-Komponenten in onboarding.tsx,
 * Bildschirme/Onboarding/OnboardingSchritte.swift der iOS-App)
 *
 * Jeder Schritt haelt sein Formular selbst und ruft beim Weiter erst seine
 * RPC, dann `k.weiter`. Ein Fehler mit Feld steht rot am Feld; sobald man
 * dort tippt, verschwindet er (useFeldfehler).
 */

package de.tcmuckensturm.app.bildschirme.onboarding

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.anmeldung.AnmeldeFeld
import de.tcmuckensturm.app.bildschirme.konto.KontoFeld
import de.tcmuckensturm.app.bildschirme.konto.KontoGruppe
import de.tcmuckensturm.app.bildschirme.Hinweis
import de.tcmuckensturm.app.bildschirme.konto.KontoLinie
import de.tcmuckensturm.app.bildschirme.konto.KontoSegmente
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.start.PasswortRegeln
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.OnboardingSchrittKey
import de.tcmuckensturm.kern.Profil
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

// ---- Passwort ---------------------------------------------------------------

@Composable
fun SchrittPasswort(k: OnboardingKontext) {
    if (k.zustand.status[OnboardingSchrittKey.PASSWORT.wert] == true) {
        Hinweis("Dein Passwort ist gesetzt.", ok = true)
        OnboardingKnoepfe(k, speichern = k.weiter)
        return
    }
    val passwort = rememberTextFieldState()
    val wiederholung = rememberTextFieldState()
    var fehler by remember { mutableStateOf<Profil.Fehler?>(null) }

    val speichern: suspend () -> Ergebnis = speichern@{
        // Dieselben Regeln wie "Passwort festlegen".
        val p = passwort.text.toString()
        PasswortRegeln.pruefen(p, wiederholung.text.toString())?.let { text ->
            fehler = Profil.Fehler(if (text == PasswortTexte.ZU_KURZ) "passwort" else "wiederholung", text)
            return@speichern Ergebnis.erfolg("")
        }
        k.aktionen.passwortSpeichern(p)?.let { text ->
            fehler = Profil.Fehler("passwort", text)
            return@speichern Ergebnis.erfolg("")
        }
        k.weiter()
    }

    AnmeldeFeld(beschriftung = "Passwort", zustand = passwort, inhaltsTyp = ContentType.NewPassword, passwort = true)
    fehler?.takeIf { it.feld == "passwort" }?.let { Hinweis(it.meldung) }
    AnmeldeFeld(
        beschriftung = "Noch einmal",
        bedienName = "Passwort wiederholen",
        zustand = wiederholung,
        inhaltsTyp = ContentType.NewPassword,
        passwort = true,
        absenden = ImeAction.Done,
    )
    fehler?.takeIf { it.feld == "wiederholung" }?.let { Hinweis(it.meldung) }
    OnboardingKnoepfe(k, speichern = speichern)
}

// ---- Stammdaten -------------------------------------------------------------

@Composable
fun SchrittStammdaten(k: OnboardingKontext) {
    val werte = remember { mutableStateMapOf<String, String>().apply { putAll(OnboardingLogik.stammdatenWerte(k.zustand.stammdaten)) } }
    var fehler by remember { mutableStateOf<Profil.Fehler?>(null) }

    val setzen: (String, String) -> Unit = { name, wert ->
        if (fehler?.feld == name) fehler = null
        werte[name] = wert
    }
    val fehlerText = { name: String -> fehler?.takeIf { it.feld == name }?.meldung }

    @Composable
    fun Feld(
        name: String,
        label: String,
        inhalt: ContentType? = null,
        tastatur: KeyboardType = KeyboardType.Text,
        gross: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    ) = KontoFeld(
        label = label,
        wert = werte[name] ?: "",
        aendern = { setzen(name, it) },
        fehler = fehlerText(name),
        inhaltsTyp = inhalt,
        tastatur = tastatur,
        gross = gross,
    )

    Gruppe("Person") {
        Feld("first_name", "Vorname", ContentType.PersonFirstName, gross = KeyboardCapitalization.Words)
        Feld("last_name", "Nachname", ContentType.PersonLastName, gross = KeyboardCapitalization.Words)
        Feld("title", "Titel", ContentType.PersonNamePrefix)
        Geburtstag(werte["birthday"] ?: "", fehlerText("birthday")) { setzen("birthday", it) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Beschriftung("Geschlecht", fehler = fehler?.feld == "gender")
        KontoSegmente(OnboardingLogik.geschlechter, werte["gender"], beschriftung = "Geschlecht") { setzen("gender", it) }
        fehlerText("gender")?.let { Hinweis(it) }
    }
    Gruppe("Adresse") {
        Feld("street", "Straße", ContentType.AddressStreet, gross = KeyboardCapitalization.Words)
        Feld("postcode", "PLZ", ContentType.PostalCode, KeyboardType.Number)
        Feld("city", "Ort", ContentType.AddressLocality, gross = KeyboardCapitalization.Words)
    }
    Gruppe("Kontakt") {
        Feld("phone", "Telefon", ContentType.PhoneNumber, KeyboardType.Phone)
        Feld("mobile", "Mobil", ContentType.PhoneNumber, KeyboardType.Phone)
        Leise("Telefon oder Mobil genügt.")
        KontoFeld(label = "E-Mail", wert = k.zustand.stammdaten.email ?: "", aendern = {}, gesperrt = true)
    }
    Leise("Die E-Mail-Adresse ist dein Login. Ändern kann sie der Vorstand.")
    OnboardingKnoepfe(k) {
        val r = k.aktionen.speichereStammdaten(werte.toMap())
        fehler = r.feld?.let { Profil.Fehler(it, r.meldung) }
        when {
            r.ok -> k.weiter()
            // Ein Fehler mit Feld steht am Feld, nicht noch einmal am Knopf.
            fehler != null -> Ergebnis.erfolg("")
            else -> r
        }
    }
}

/** Abschnitt mit kleinem Titel (FormGruppe titel=…) */
@Composable
private fun Gruppe(titel: String, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(top = Abstand.s), verticalArrangement = Arrangement.spacedBy(Abstand.s), content = {
        Kicker(titel)
        inhalt()
    })
}

@Composable
private fun Beschriftung(text: String, fehler: Boolean = false) {
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein),
        color = if (fehler) TcmTheme.farben.red else TcmTheme.farben.ink2,
    )
}

/**
 * Das Geburtsdatum mit Datumswaehler (FormDatum, 1900 bis heute). Der Wert
 * bleibt TT.MM.JJJJ wie in der Expo-App; ohne Wert beginnt die Auswahl 1970.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Geburtstag(text: String, fehler: String?, setzen: (String) -> Unit) {
    val f = TcmTheme.farben
    var offen by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Beschriftung("Geburtsdatum", fehler = fehler != null) }
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .background(f.surf2, RoundedCornerShape(Radius.feld))
                    .clickable(role = Role.Button) { offen = true }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text.ifEmpty { "Datum wählen" },
                    style = TcmSchrift.text(Schrift.gewichtFett, 15.sp).copy(fontFeatureSettings = "tnum"),
                    color = if (text.isEmpty()) f.blueInk else f.ink,
                )
            }
        }
        fehler?.let { Hinweis(it) }
    }
    if (!offen) return

    val heute = LocalDate.now(ZoneOffset.UTC)
    val bis = heute.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    val von = OnboardingLogik.millis("01.01.1900") ?: 0L
    val zustand = rememberDatePickerState(
        initialSelectedDateMillis = OnboardingLogik.millis(text) ?: OnboardingLogik.millis("01.01.1970"),
        yearRange = 1900..heute.year,
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis in von..bis
            override fun isSelectableYear(year: Int) = year in 1900..heute.year
        },
    )
    // Die App spricht Deutsch, auch wenn das Telefon englisch eingestellt ist: Monate und Tage auf Deutsch.
    val konfiguration = LocalConfiguration.current
    val deutsch = remember(konfiguration) { Configuration(konfiguration).apply { setLocale(Locale.GERMANY) } }
    DatePickerDialog(
        onDismissRequest = { offen = false },
        confirmButton = {
            TextButton(onClick = {
                zustand.selectedDateMillis?.let { setzen(OnboardingLogik.deutsch(it)) }
                offen = false
            }) { Text("Übernehmen") }
        },
        dismissButton = { TextButton(onClick = { offen = false }) { Text("Abbrechen") } },
    ) {
        CompositionLocalProvider(LocalConfiguration provides deutsch) {
            DatePicker(
                state = zustand,
                title = { Text("Geburtsdatum", Modifier.padding(start = 24.dp, top = 16.dp)) },
                dateFormatter = remember { DatePickerDefaults.dateFormatter(selectedDateSkeleton = "dd.MM.yyyy") },
            )
        }
    }
}

// ---- Rechtliches ------------------------------------------------------------

@Composable
fun SchrittRechtliches(k: OnboardingKontext) {
    val links = LocalUriHandler.current
    val haken = remember { mutableStateMapOf<String, Boolean>() }
    val dokumente = k.zustand.dokumente
    KontoGruppe {
        dokumente.forEachIndexed { i, d ->
            if (i > 0) KontoLinie()
            Column {
                OnboardingSchalter(
                    label = OnboardingLogik.zustimmungstext(d.code, d.title),
                    beschreibung = OnboardingLogik.fassung(d),
                    an = haken[d.code] ?: (d.zugestimmtAm != null),
                    umschalten = { haken[d.code] = it },
                    gesperrt = d.zugestimmtAm != null,
                )
                // Dieselben Adressen wie im Web: /satzung, /beitragsordnung, /datenschutz.
                k.webLink("/${d.code}")?.let { link ->
                    Box(
                        Modifier
                            .padding(start = 8.dp, bottom = 6.dp)
                            .heightIn(min = 40.dp)
                            .clickable(role = Role.Button) { links.openUri(link) }
                            .padding(horizontal = 8.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text("${d.title} lesen ›", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = TcmTheme.farben.blueInk)
                    }
                }
            }
        }
    }
    OnboardingKnoepfe(k) {
        if (dokumente.any { !(haken[it.code] ?: (it.zugestimmtAm != null)) }) {
            Ergebnis.fehler(OnboardingLogik.ALLE_ZUSTIMMEN)
        } else {
            val r = k.aktionen.akzeptiereDokumente(dokumente.filter { it.zugestimmtAm == null }.map { it.code })
            if (r.ok) k.weiter() else r
        }
    }
}

// ---- Erziehungsberechtigte --------------------------------------------------

@Composable
fun SchrittErziehungsberechtigte(k: OnboardingKontext) {
    val e = k.zustand.erziehungsberechtigte
    var name by remember { mutableStateOf(e.name ?: "") }
    var email by remember { mutableStateOf(e.email ?: "") }
    var telefon by remember { mutableStateOf(e.phone ?: "") }
    var zustimmung by remember { mutableStateOf(e.zustimmungAm != null) }
    var fehler by remember { mutableStateOf<Profil.Fehler?>(null) }
    val fehlerText = { feld: String -> fehler?.takeIf { it.feld == feld }?.meldung }
    val weg = { feld: String -> if (fehler?.feld == feld) fehler = null }

    KontoFeld("Name", name, { weg("name"); name = it }, fehler = fehlerText("name"),
        inhaltsTyp = ContentType.PersonFullName, gross = KeyboardCapitalization.Words)
    KontoFeld("E-Mail", email, { weg("email"); email = it }, fehler = fehlerText("email"),
        inhaltsTyp = ContentType.EmailAddress, tastatur = KeyboardType.Email, gross = KeyboardCapitalization.None)
    // Der Fehler "E-Mail oder Telefon" steht an der E-Mail; Tippen hier nimmt ihn auch weg.
    KontoFeld("Telefon", telefon, { weg("email"); telefon = it }, inhaltsTyp = ContentType.PhoneNumber, tastatur = KeyboardType.Phone)
    Leise("E-Mail oder Telefon genügt.")
    KontoGruppe {
        OnboardingSchalter(
            label = "Zustimmung zur Mitgliedschaft",
            beschreibung = "Die erziehungsberechtigte Person ist damit einverstanden, dass ${k.zustand.stammdaten.firstName ?: ""} Mitglied im Verein ist.",
            an = zustimmung,
            umschalten = { zustimmung = it },
        )
    }
    OnboardingKnoepfe(k) {
        val r = k.aktionen.speichereErziehungsberechtigte(name, email, telefon, zustimmung)
        fehler = r.feld?.let { Profil.Fehler(it, r.meldung) }
        when {
            r.ok -> k.weiter()
            fehler != null -> Ergebnis.erfolg("")
            else -> r
        }
    }
}

// ---- Notfallkontakt ---------------------------------------------------------

@Composable
fun SchrittNotfallkontakt(k: OnboardingKontext) {
    val vorbelegt = remember { OnboardingLogik.notfallVorbelegung(k.zustand) }
    var name by remember { mutableStateOf(vorbelegt.name) }
    var telefon by remember { mutableStateOf(vorbelegt.telefon) }
    var verhaeltnis by remember { mutableStateOf(vorbelegt.verhaeltnis) }
    var fehler by remember { mutableStateOf<String?>(null) }

    KontoFeld("Name", name, { fehler = null; name = it }, fehler = fehler,
        inhaltsTyp = ContentType.PersonFullName, gross = KeyboardCapitalization.Words)
    KontoFeld("Telefon", telefon, { telefon = it }, inhaltsTyp = ContentType.PhoneNumber, tastatur = KeyboardType.Phone)
    KontoFeld("Verhältnis (etwa Mutter, Partner)", verhaeltnis, { verhaeltnis = it })
    OnboardingKnoepfe(k) {
        val r = k.aktionen.speichereNotfallkontakt(name, telefon, verhaeltnis)
        when {
            r.feld != null -> {
                fehler = r.meldung
                Ergebnis.erfolg("")
            }
            r.ok -> k.weiter()
            else -> r
        }
    }
}

// ---- SEPA -------------------------------------------------------------------

@Composable
fun SchrittSepa(k: OnboardingKontext) {
    val m = k.zustand.mandat
    when {
        m.vorhanden -> {
            Hinweis("Für dich liegt ein SEPA-Mandat vor (Mandatsreferenz ${m.referenz ?: "–"}). Ändern kann es der Vorstand.", ok = true)
            OnboardingKnoepfe(k, weiterText = "Konto freischalten", speichern = k.weiter)
        }
        !m.moeglich -> {
            Hinweis(
                "Die Gläubigerdaten des Vereins fehlen noch, deshalb lässt sich das Mandat gerade nicht erteilen. Bitte wende dich an den Vorstand.",
            )
            OnboardingKnoepfe(k, gesperrt = true, speichern = k.weiter)
        }
        else -> SepaFormular(k)
    }
}

@Composable
private fun SepaFormular(k: OnboardingKontext) {
    val f = TcmTheme.farben
    val m = k.zustand.mandat
    var kontoinhaber by remember { mutableStateOf(m.kontoinhaberVorschlag ?: "") }
    var iban by remember { mutableStateOf("") }
    var bestaetigt by remember { mutableStateOf(false) }

    SelectionContainer {
        Text(
            OnboardingLogik.mandatstext(m),
            style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp).copy(lineHeight = 20.sp),
            color = f.ink,
            modifier = Modifier
                .fillMaxWidth()
                .background(f.surf2, RoundedCornerShape(Radius.karte))
                .padding(16.dp),
        )
    }
    KontoFeld("Kontoinhaber", kontoinhaber, { kontoinhaber = it },
        inhaltsTyp = ContentType.PersonFullName, gross = KeyboardCapitalization.Words)
    if (k.zustand.minderjaehrig) Leise("Bei Kindern ist der Kontoinhaber ein Elternteil.")
    KontoFeld("IBAN", iban, { iban = it }, tastatur = KeyboardType.Ascii, gross = KeyboardCapitalization.Characters)
    KontoGruppe {
        OnboardingSchalter(
            label = "Ich erteile dieses Mandat",
            beschreibung = "Als Kontoinhaber oder mit dessen Einverständnis.",
            an = bestaetigt,
            umschalten = { bestaetigt = it },
        )
    }
    OnboardingKnoepfe(k, weiterText = "Mandat erteilen") {
        val r = k.aktionen.erteileMandat(iban, kontoinhaber, bestaetigt)
        if (r.ok) k.weiter() else r
    }
}

// ---- Einwilligungen ---------------------------------------------------------

@Composable
fun SchrittEinwilligungen(k: OnboardingKontext) {
    val merkmale = k.zustand.merkmale
    val wahl = remember { mutableStateMapOf<String, Boolean>() }
    if (merkmale.isEmpty()) {
        Leise("Der Verein fragt gerade keine Einwilligungen ab.")
    } else {
        KontoGruppe {
            merkmale.forEachIndexed { i, m ->
                if (i > 0) KontoLinie()
                OnboardingSchalter(
                    label = m.name,
                    beschreibung = m.description,
                    an = wahl[m.code] ?: m.gesetzt,
                    umschalten = { wahl[m.code] = it },
                )
            }
        }
    }
    OnboardingKnoepfe(k) knoepfe@{
        // Nur was sich geaendert hat; ein boolesches Merkmal ist "ja", sobald die Zeile existiert.
        for (m in merkmale) {
            val neu = wahl[m.code] ?: m.gesetzt
            if (neu == m.gesetzt) continue
            val r = if (neu) k.aktionen.setzeMerkmal(m.code, "true") else k.aktionen.entferneMerkmal(m.code)
            if (!r.ok) return@knoepfe r
        }
        k.weiter()
    }
}

// ---- Tennis -----------------------------------------------------------------

@Composable
fun SchrittTennis(k: OnboardingKontext) {
    val t = k.zustand.tennis
    var lk by remember { mutableStateOf(t.tennisLk ?: "") }
    var nuliga by remember { mutableStateOf(t.nuligaId ?: "") }
    var interesse by remember { mutableStateOf(t.mannschaftInteresse) }

    KontoFeld("LK (etwa 18,4)", lk, { lk = it }, tastatur = KeyboardType.Decimal)
    KontoFeld("nuLiga-ID", nuliga, { nuliga = it }, gross = KeyboardCapitalization.None)
    KontoGruppe {
        OnboardingSchalter(label = "Interesse an einer Mannschaft", an = interesse, umschalten = { interesse = it })
    }
    OnboardingKnoepfe(k) {
        val r = k.aktionen.speichereTennis(lk, nuliga, interesse)
        if (r.ok) k.weiter() else r
    }
}

// ---- App-Einstellungen ------------------------------------------------------

@Composable
fun SchrittEinstellungen(k: OnboardingKontext) {
    val gespeichert = k.zustand.einstellungen.bookingMail
    var mails by remember { mutableStateOf(OnboardingLogik.buchungsmail(gespeichert)) }

    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Beschriftung("E-Mails zu deinen Buchungen")
        KontoSegmente(OnboardingLogik.buchungsmails, mails, beschriftung = "E-Mails zu deinen Buchungen") { mails = it }
    }
    Leise("In der App siehst du Änderungen an deinen Buchungen in jedem Fall.")
    KontoGruppe { k.pushSchalter("Das Gerät fragt einmal nach deiner Erlaubnis.") }
    OnboardingKnoepfe(k, weiterText = if (k.letzter) "Fertig" else "Weiter") knoepfe@{
        if (OnboardingLogik.buchungsmailSpeichern(mails, gespeichert)) {
            val r = k.aktionen.setzeMerkmal("booking_mail", mails)
            if (!r.ok) return@knoepfe r
        }
        k.weiter()
    }
}
