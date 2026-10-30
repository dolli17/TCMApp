/*
 * Konto (apps/mobile/app/(tabs)/konto.tsx, Bildschirme/Konto/KontoBildschirm.swift)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Meine Daten, Notfallkontakt,
 * Einwilligungen, Mandat, Passwort und die Kuendigung oeffnen je ein Bottom
 * Sheet (KontoBlaetter.kt), statt als lange Formulare die Seite zu fuellen.
 *
 * Jede Quelle laedt fuer sich: schlaegt eine fehl (etwa das Mandat), zeigt
 * nur ihr Abschnitt den Fehler, und der Rest der Seite bleibt gefuellt.
 * Gespeichert meldet eine Snackbar (in iOS ein Hinweis auf der Seite).
 *
 * Der Inhalt lebt im KontoModell (ViewModel am Eintrag des Tabs): Beim
 * Wechsel des Tabs bleibt er stehen und wird still nachgeladen (B19).
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Forderung
import de.tcmuckensturm.app.daten.Kontodaten
import de.tcmuckensturm.app.daten.MeinProfil
import de.tcmuckensturm.app.daten.Startdaten
import io.github.jan.supabase.auth.auth
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.Erscheinungsbild
import de.tcmuckensturm.app.theme.ErscheinungsbildSpeicher
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Kontoloeschung
import de.tcmuckensturm.kern.Startseite
import java.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Die Blaetter des Kontos. */
enum class KontoBlatt { DATEN, NOTFALL, EINWILLIGUNGEN, BANK, PASSWORT, LOESCHEN }

// ---- Laden ------------------------------------------------------------------

data class KontoZustand(
    val inhalt: KontoInhalt? = null,
    val laedt: Boolean = true,
    /** Ziehen zum Aktualisieren oder "Erneut versuchen" laeuft. */
    val aktualisiert: Boolean = false,
)

class KontoModell(private val konto: Kontodaten, private val start: Startdaten) : ViewModel() {
    private val _zustand = MutableStateFlow(KontoZustand())
    val zustand: StateFlow<KontoZustand> = _zustand.asStateFlow()

    enum class Art { ERSTES, NACHLADEN, STILL }

    /** Beim Erscheinen: erst laden, danach still nachladen - etwa nach einem Getraenk (B19). */
    fun erscheinen() = laden(if (_zustand.value.inhalt == null) Art.ERSTES else Art.STILL)

    fun laden(art: Art) {
        if (art == Art.NACHLADEN) _zustand.update { it.copy(aktualisiert = true) }
        viewModelScope.launch {
            val neu = lade(konto, start)
            _zustand.update { KontoZustand(inhalt = neu, laedt = false, aktualisiert = false) }
        }
    }

    companion object {
        suspend fun lade(k: Kontodaten, s: Startdaten): KontoInhalt = coroutineScope {
            val profil = async { Abschnitt.von { k.profil() } }
            val forderungen = async { Abschnitt.von { k.forderungen() } }
            val getraenke = async { Abschnitt.von { s.eigeneGetraenke() } }
            val dienst = async { Abschnitt.von { s.arbeitsdienst() } }
            val mandat = async { Abschnitt.von { k.mandat() } }
            val merkmale = async { Abschnitt.von { k.merkmale() } }
            KontoInhalt(
                profil = profil.await(),
                forderungen = forderungen.await(),
                getraenke = getraenke.await(),
                dienst = dienst.await(),
                mandat = mandat.await(),
                merkmale = merkmale.await(),
            )
        }
    }
}

// ---- Bildschirm -------------------------------------------------------------

@Composable
fun KontoBildschirm() {
    val sitzung = LocalSitzung.current
    val context = LocalContext.current
    val links = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val kontodaten = remember(sitzung) { Kontodaten(sitzung.client) }
    val modell = viewModel { KontoModell(kontodaten, Startdaten(sitzung.client)) }
    val zustand by modell.zustand.collectAsStateWithLifecycle()
    val speicher = remember { ErscheinungsbildSpeicher.fuer(context) }
    val erscheinungsbild by speicher.wahl.collectAsStateWithLifecycle(Erscheinungsbild.SYSTEM)
    val snackbar = remember { SnackbarHostState() }
    var blatt by rememberSaveable { mutableStateOf<KontoBlatt?>(null) }
    var abmeldenFragen by rememberSaveable { mutableStateOf(false) }
    val aktionen = remember(sitzung) { SitzungsAktionen(kontodaten, sitzung) }

    LaunchedEffect(Unit) { modell.erscheinen() }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(
            isRefreshing = zustand.aktualisiert,
            onRefresh = { modell.laden(KontoModell.Art.NACHLADEN) },
            modifier = Modifier.fillMaxSize(),
        ) {
            KontoAnsicht(
                zustand = zustand,
                erscheinungsbild = erscheinungsbild,
                datenschutz = sitzung.umgebung.webLink("/datenschutz"),
                impressum = sitzung.umgebung.webLink("/impressum"),
                oeffnen = { blatt = it },
                erneut = { modell.laden(KontoModell.Art.NACHLADEN) },
                erscheinungsbildWaehlen = { neu -> scope.launch { speicher.setzen(neu) } },
                link = { links.openUri(it) },
                abmelden = { abmeldenFragen = true },
            )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(Abstand.rand))
    }

    blatt?.let { art ->
        KontoBlattFenster(
            art = art,
            inhalt = zustand.inhalt,
            email = sitzung.client.auth.currentUserOrNull()?.email,
            aktionen = aktionen,
            zu = { blatt = null },
            gespeichert = { text ->
                blatt = null
                scope.launch { snackbar.showSnackbar(text) }
                modell.laden(KontoModell.Art.STILL)
            },
            geaendert = { modell.laden(KontoModell.Art.STILL) },
            erneut = { modell.laden(KontoModell.Art.NACHLADEN) },
        )
    }

    // Ein Fehltipp am Ende der Liste meldete sofort ab (U28).
    if (abmeldenFragen) {
        AlertDialog(
            onDismissRequest = { abmeldenFragen = false },
            title = { Text("Wirklich abmelden?") },
            dismissButton = { TextButton(onClick = { abmeldenFragen = false }) { Text("Abbrechen") } },
            confirmButton = {
                TextButton(onClick = {
                    abmeldenFragen = false
                    // Sitzung.abmelden ist die eine Stelle (dort spaeter auch das Abmelden fuer Push).
                    scope.launch { sitzung.abmelden() }
                }) { Text("Abmelden", color = TcmTheme.farben.redInk) }
            },
        )
    }
}

/** Die Seite ohne Sitzung und Netz - so zeichnen sie auch die Screenshot-Tests. */
@Composable
fun KontoAnsicht(
    zustand: KontoZustand,
    erscheinungsbild: Erscheinungsbild,
    datenschutz: String?,
    impressum: String?,
    oeffnen: (KontoBlatt) -> Unit,
    erneut: () -> Unit,
    erscheinungsbildWaehlen: (Erscheinungsbild) -> Unit,
    link: (String) -> Unit,
    abmelden: () -> Unit,
    jetzt: Instant = Instant.now(),
) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxSize()
            .background(f.bg)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(start = Abstand.rand, end = Abstand.rand, top = Abstand.abschnitt, bottom = Abstand.abschnitt * 2),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        // TODO (Home-Spur): die Glocke rechts oben (Glocke.swift), sobald es sie gibt.
        val d = zustand.inhalt
        if (d == null) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = f.muted)
            }
            return@Column
        }
        val nochmal = Erneut(zustand.aktualisiert, erneut)
        Profilkopf(d.profil, nochmal)
        Abrechnung(d.forderungen, d.getraenke, nochmal, jetzt)
        ArbeitsdienstKarte(d.dienst, nochmal)
        Einstellungen(d, erscheinungsbild, oeffnen, erscheinungsbildWaehlen)
        KontoGruppe(Modifier.padding(top = Abstand.s)) {
            // Datenschutz und Impressum liegen im Web; ohne Basisadresse (lokal) fehlen die Zeilen.
            if (datenschutz != null && impressum != null) {
                KontoVerweis("Datenschutz") { link(datenschutz) }
                KontoLinie()
                KontoVerweis("Impressum") { link(impressum) }
                KontoLinie()
            }
            KontoVerweis("Abmelden", rot = true, aktion = abmelden)
        }
        // Abgesetzt, damit niemand sie beim Abmelden streift (U44).
        KontoGruppe(Modifier.padding(top = Abstand.abschnitt - Abstand.m)) {
            KontoVerweis(Kontoloeschung.TITEL, pfeil = true) { oeffnen(KontoBlatt.LOESCHEN) }
        }
    }
}

// ---- Profilkopf -------------------------------------------------------------

@Composable
private fun Profilkopf(profil: Abschnitt<MeinProfil?>, erneut: Erneut) {
    val f = TcmTheme.farben
    val p = profil.wert
    val vorname = p?.firstName ?: ""
    val nachname = p?.lastName ?: ""
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(88.dp).background(f.brand, CircleShape).clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            Text(
                KontoLogik.initialen(vorname, nachname),
                style = TcmSchrift.text(Schrift.gewichtExtrafett, 30.sp),
                color = f.onBrand,
            )
        }
        Text(
            "$vorname $nachname",
            style = TcmSchrift.text(Schrift.gewichtExtrafett, 28.sp),
            color = f.ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 14.dp).semantics { heading() },
        )
        val marken = KontoLogik.marken(p)
        if (marken.isNotEmpty()) {
            FlowRow(
                Modifier.padding(top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (m in marken) KontoMarke(m)
            }
        }
        profil.fehler?.let {
            Spacer(Modifier.height(10.dp))
            Fehlerzeile(it, erneut.laeuft, erneut.aktion)
        }
    }
}

// ---- Abrechnung -------------------------------------------------------------

/**
 * "Abrechnung" statt "Offene Forderungen" wie im Web: der laufende
 * Getraenkemonat steht hier als Normalfall ("läuft noch") und ist keine
 * Schuld (U76).
 */
@Composable
private fun Abrechnung(
    forderungen: Abschnitt<List<Forderung>>,
    getraenke: Abschnitt<List<EigenesGetraenk>>,
    erneut: Erneut,
    jetzt: Instant,
) {
    val f = TcmTheme.farben
    val fehler = forderungen.fehler ?: getraenke.fehler
    val offen = KontoLogik.offen(forderungen.wert.orEmpty())
    val zurueck = offen.count { it.status == "returned" }
    // Die Getraenke des laufenden Monats sind noch keine Forderung - sie stehen trotzdem da.
    val laufend = Startseite.sumOpenDrinks(getraenke.wert.orEmpty())
    val summe = KontoLogik.summe(offen, laufend)

    KontoAbschnitt("Abrechnung")
    if (fehler != null) Fehlerzeile(fehler, erneut.laeuft, erneut.aktion)
    KontoLogik.zurueckText(zurueck)?.let { KontoHinweis(it) }
    // Nach einem Ladefehler waere "Nichts offen" falsch beruhigend.
    if (fehler != null && offen.isEmpty() && laufend == 0) return
    KontoGruppe {
        offen.forEachIndexed { i, forderung ->
            if (i > 0) KontoLinie()
            AbrechnungsZeile(
                titel = KontoLogik.forderungTitel(forderung),
                beschreibung = forderung.description,
                marke = KontoLogik.statusmarke(forderung.status ?: "", forderung.dueDate),
                betrag = forderung.amountCents ?: 0,
            )
        }
        if (laufend > 0) {
            if (offen.isNotEmpty()) KontoLinie()
            AbrechnungsZeile(
                titel = KontoLogik.getraenkeTitel(jetzt),
                beschreibung = null,
                marke = KontoLogik.statusmarke("laufend", null),
                betrag = laufend,
            )
        }
        if (offen.isEmpty() && laufend == 0) {
            Leise("Nichts offen.", Modifier.heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 17.dp))
        } else {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(f.surf2)
                    .padding(vertical = 14.dp, horizontal = 16.dp)
                    .semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Zusammen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = f.ink2, modifier = Modifier.weight(1f))
                Betrag(Geld.formatCents(summe), groesse = 21f)
            }
        }
    }
}

@Composable
private fun AbrechnungsZeile(titel: String, beschreibung: String?, marke: Statusmarke, betrag: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .padding(vertical = 12.dp, horizontal = 16.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(titel, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp), color = TcmTheme.farben.ink, maxLines = 1)
            if (!beschreibung.isNullOrEmpty()) {
                Text(beschreibung, style = leiseSchrift(), maxLines = 2, modifier = Modifier.padding(top = 2.dp))
            }
            StatusmarkeAnsicht(marke)
        }
        Betrag(Geld.formatCents(betrag))
    }
}

// ---- Arbeitsdienst ----------------------------------------------------------

@Composable
private fun ArbeitsdienstKarte(dienst: Abschnitt<Arbeitsdienst?>, erneut: Erneut) {
    val f = TcmTheme.farben
    dienst.fehler?.let { Fehlerzeile("Arbeitsdienst: $it", erneut.laeuft, erneut.aktion) }
    val d = dienst.wert ?: return
    val soll = d.requiredHours ?: 0.0
    Column(Modifier.fillMaxWidth().karte(innen = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Arbeitsdienst ${d.year ?: ""}",
                style = TcmSchrift.text(Schrift.gewichtFett, 15.5.sp),
                color = f.ink,
                modifier = Modifier.weight(1f),
            )
            Betrag(KontoLogik.dienstWert(d))
        }
        if (soll > 0) {
            LinearProgressIndicator(
                progress = { KontoLogik.dienstAnteil(d).toFloat() },
                color = f.green,
                trackColor = f.surf2,
                gapSize = 0.dp,
                drawStopIndicator = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .height(8.dp)
                    .clearAndSetSemantics { contentDescription = KontoLogik.dienstBedienText(d) },
            )
        }
        Text(
            KontoLogik.dienstText(d),
            style = leiseSchrift().copy(lineHeight = 19.sp),
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

// ---- Einstellungen ----------------------------------------------------------

@Composable
private fun Einstellungen(
    d: KontoInhalt,
    erscheinungsbild: Erscheinungsbild,
    oeffnen: (KontoBlatt) -> Unit,
    erscheinungsbildWaehlen: (Erscheinungsbild) -> Unit,
) {
    KontoAbschnitt("Einstellungen")
    KontoGruppe {
        KontoEintrag("Meine Daten", Icons.Outlined.Person) { oeffnen(KontoBlatt.DATEN) }
        KontoLinie()
        KontoEintrag("Notfallkontakt", Icons.Outlined.Phone) { oeffnen(KontoBlatt.NOTFALL) }
        if (KontoLogik.zeigeEinwilligungen(d.merkmale.wert)) {
            KontoLinie()
            KontoEintrag("Einwilligungen", Icons.Outlined.CheckCircle) { oeffnen(KontoBlatt.EINWILLIGUNGEN) }
        }
        KontoLinie()
        KontoEintrag("Bankverbindung & Mandat", BankSymbol) { oeffnen(KontoBlatt.BANK) }
        KontoLinie()
        PushZeile()
        KontoLinie()
        KontoEintrag("Passwort ändern", Icons.Outlined.Lock) { oeffnen(KontoBlatt.PASSWORT) }
        KontoLinie()
        Column(
            Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Erscheinungsbild", style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp), color = TcmTheme.farben.ink)
            KontoSegmente(
                optionen = Erscheinungsbild.entries.map { it to it.titel },
                gewaehlt = erscheinungsbild,
                wahl = erscheinungsbildWaehlen,
            )
        }
    }
}

/**
 * "Mitteilungen aufs Handy" - noch ohne Funktion.
 *
 * TODO (Spur A6, Push): hier den Schalter einbauen wie App/PushSchalter.swift
 * der iOS-App (FCM-Token anmelden/abmelden, Erlaubnis POST_NOTIFICATIONS erst
 * beim Einschalten, Fehler als Satz darunter). Bis dahin steht die Zeile
 * gesperrt da, damit die Einstellungen schon ihre endgueltige Ordnung haben.
 */
@Composable
private fun PushZeile() {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Symbolkachel(Icons.Outlined.Notifications)
        Column(Modifier.weight(1f)) {
            Text("Mitteilungen aufs Handy", style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp), color = TcmTheme.farben.ink)
            Leise("Kommt bald.")
        }
        Switch(checked = false, onCheckedChange = null, enabled = false)
    }
}
