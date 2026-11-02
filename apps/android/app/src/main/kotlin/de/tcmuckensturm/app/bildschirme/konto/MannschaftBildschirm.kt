/*
 * Konto -> Mannschaft
 *
 * Oben offene Einladungen an mich (Annehmen mit Telefon-Freigabe, Ablehnen),
 * darunter der Kader. Der Mannschaftsfuehrer laedt hier Spieler ein (Blatt
 * "Spieler hinzufügen" mit Suche), zieht offene Einladungen zurueck und
 * traegt Spieler aus; ein Spieler kann selbst austreten. Vertrag:
 * "Mannschaftsfuehrer laedt in seine Mannschaft ein", Texte in MannschaftLogik.
 *
 * Ein eigenes Ziel im Tab Konto (KontoMannschaft), kein Blatt: Push-Nachrichten
 * und die Glocke fuehren direkt hierher, und die Zurueck-Geste fuehrt ins Konto.
 * Rueckfragen sind Dialoge, Ergebnisse eine Snackbar.
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.bildschirme.Hinweis
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.LeiserKnopf
import de.tcmuckensturm.app.bildschirme.NebeneinanderOderUntereinander
import de.tcmuckensturm.app.bildschirme.home.Abschnitt
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.leise
import de.tcmuckensturm.app.bildschirme.onboarding.OnboardingSchalter
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Initialen
import de.tcmuckensturm.app.daten.Kandidat
import de.tcmuckensturm.app.daten.Kontodaten
import de.tcmuckensturm.app.daten.Mannschaftsdaten
import de.tcmuckensturm.app.daten.MeineEinladung
import de.tcmuckensturm.app.daten.MeineMannschaft
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---- Laden ------------------------------------------------------------------

data class MannschaftZustand(
    val mannschaft: Abschnitt<MeineMannschaft?>? = null,
    val einladungen: Abschnitt<List<MeineEinladung>>? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
    /** Eine Handlung laeuft; die Knoepfe sind so lange gesperrt. */
    val laeuft: Boolean = false,
)

class MannschaftModell(private val daten: Mannschaftsdaten, private val konto: Kontodaten) : ViewModel() {
    private val _zustand = MutableStateFlow(MannschaftZustand())
    val zustand: StateFlow<MannschaftZustand> = _zustand.asStateFlow()

    fun laden(nachladen: Boolean = false) {
        if (nachladen) _zustand.update { it.copy(aktualisiert = true) }
        viewModelScope.launch { neuLaden() }
    }

    private suspend fun neuLaden() = coroutineScope {
        val m = async { Abschnitt.von { daten.meineMannschaft() } }
        val e = async { Abschnitt.von { daten.einladungen() } }
        val mannschaft = m.await()
        val einladungen = e.await()
        _zustand.update { it.copy(mannschaft = mannschaft, einladungen = einladungen, laedt = false, aktualisiert = false) }
    }

    /** Fuehrt aus, laedt danach neu und meldet das Ergebnis. */
    fun ausfuehren(melden: (Ergebnis) -> Unit, tun: suspend () -> Ergebnis) {
        if (_zustand.value.laeuft) return
        _zustand.update { it.copy(laeuft = true) }
        viewModelScope.launch {
            val r = tun()
            if (r.ok) neuLaden()
            _zustand.update { it.copy(laeuft = false) }
            melden(r)
        }
    }

    suspend fun kandidaten(suche: String): List<Kandidat> = daten.kandidaten(suche)

    fun einladen(k: Kandidat, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) { daten.einladen(k.memberId, MannschaftLogik.eingeladen(k)) }

    fun zurueckziehen(e: MeineMannschaft.OffeneEinladung, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) { daten.zurueckziehen(e.id, MannschaftLogik.zurueckgezogen(e)) }

    fun annehmen(e: MeineEinladung, telefon: Boolean, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) { daten.beantworten(e.id, annehmen = true, telefonSichtbar = telefon, MannschaftLogik.angenommen(e)) }

    fun ablehnen(e: MeineEinladung, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) { daten.beantworten(e.id, annehmen = false, telefonSichtbar = false, MannschaftLogik.ABGELEHNT) }

    fun austragen(s: MeineMannschaft.Spieler, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) { daten.austragen(s.memberId, MannschaftLogik.ausgetragen(s)) }

    fun austreten(m: MeineMannschaft, melden: (Ergebnis) -> Unit) =
        ausfuehren(melden) {
            val ich = try {
                konto.meineId()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            if (ich == null) Ergebnis.fehler("Das hat nicht geklappt. Bitte versuche es erneut.") else daten.austragen(ich, MannschaftLogik.ausgetreten(m))
        }
}

/** Was der Bildschirm ausloesen kann; in den Screenshot-Tests leer. */
data class MannschaftHandlungen(
    val zurueck: () -> Unit = {},
    val nachladen: () -> Unit = {},
    val annehmen: (MeineEinladung, Boolean) -> Unit = { _, _ -> },
    val ablehnen: (MeineEinladung) -> Unit = {},
    val hinzufuegen: () -> Unit = {},
    val zurueckziehen: (MeineMannschaft.OffeneEinladung) -> Unit = {},
    val austragen: (MeineMannschaft.Spieler) -> Unit = {},
    val austreten: (MeineMannschaft) -> Unit = {},
    val anrufen: (String) -> Unit = {},
)

// ---- Bildschirm -------------------------------------------------------------

@Composable
fun MannschaftBildschirm(zurueck: () -> Unit) {
    val sitzung = LocalSitzung.current
    val links = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val modell = viewModel { MannschaftModell(Mannschaftsdaten(sitzung.client), Kontodaten(sitzung.client)) }
    val zustand by modell.zustand.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var suche by rememberSaveable { mutableStateOf(false) }
    val melden: (Ergebnis) -> Unit = { r -> scope.launch { snackbar.showSnackbar(r.meldung) } }

    LaunchedEffect(Unit) { modell.laden() }

    Box(Modifier.fillMaxSize()) {
        MannschaftAnsicht(
            zustand = zustand,
            handlungen = MannschaftHandlungen(
                zurueck = zurueck,
                nachladen = { modell.laden(nachladen = true) },
                annehmen = { e, telefon -> modell.annehmen(e, telefon, melden) },
                ablehnen = { modell.ablehnen(it, melden) },
                hinzufuegen = { suche = true },
                zurueckziehen = { modell.zurueckziehen(it, melden) },
                austragen = { modell.austragen(it, melden) },
                austreten = { modell.austreten(it, melden) },
                anrufen = { link -> runCatching { links.openUri(link) } },
            ),
        )
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(Abstand.rand))
    }

    if (suche) {
        SpielerHinzufuegenFenster(
            laden = modell::kandidaten,
            gesperrt = zustand.laeuft,
            einladen = { k -> modell.einladen(k, melden) },
            zu = { suche = false },
        )
    }
}

/** Die Seite ohne Netz - so zeichnen sie auch die Screenshot-Tests. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MannschaftAnsicht(
    zustand: MannschaftZustand,
    handlungen: MannschaftHandlungen,
    /** Fuer die Screenshot-Tests: diese Einladung steht schon im Schritt "Annehmen". */
    annehmenOffen: String? = null,
) {
    val f = TcmTheme.farben
    var frage by remember { mutableStateOf<Rueckfrage?>(null) }

    PullToRefreshBox(
        isRefreshing = zustand.aktualisiert,
        onRefresh = handlungen.nachladen,
        modifier = Modifier.fillMaxSize().background(f.bg),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(horizontal = Abstand.rand)
                .padding(bottom = Abstand.abschnitt * 2),
            verticalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            IconButton(onClick = handlungen.zurueck, modifier = Modifier.padding(top = 4.dp)) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Zurück", tint = f.ink)
            }
            Text(
                MannschaftLogik.TITEL,
                style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.seitentitel, Schrift.laufweiteTitel),
                color = f.ink,
                modifier = Modifier.semantics { heading() },
            )
            if (zustand.laedt) {
                Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = f.muted)
                }
                return@Column
            }
            val einladungen = zustand.einladungen?.wert.orEmpty()
            val m = zustand.mannschaft?.wert
            zustand.einladungen?.fehler?.let { Fehlerzeile("Einladungen: $it", zustand.aktualisiert, handlungen.nachladen) }
            zustand.mannschaft?.fehler?.let { Fehlerzeile(it, zustand.aktualisiert, handlungen.nachladen) }

            if (einladungen.isNotEmpty()) {
                KontoAbschnitt(if (einladungen.size == 1) "Einladung" else "Einladungen")
                for (e in einladungen) {
                    EinladungKarte(e, zustand.laeuft, anfangsOffen = e.id == annehmenOffen, handlungen)
                }
            }

            if (m != null) {
                Kader(m, zustand.laeuft, handlungen) { frage = it }
            } else if (einladungen.isEmpty() && zustand.mannschaft?.fehler == null && zustand.einladungen?.fehler == null) {
                Leerzustand(MannschaftLogik.LEER)
            }
        }
    }

    frage?.let { q ->
        AlertDialog(
            onDismissRequest = { frage = null },
            title = { Text(q.titel) },
            text = { Text(q.text) },
            dismissButton = { TextButton(onClick = { frage = null }) { Text("Abbrechen") } },
            confirmButton = {
                TextButton(onClick = {
                    frage = null
                    q.ja()
                }) { Text(q.knopf, color = f.redInk) }
            },
        )
    }
}

private data class Rueckfrage(val titel: String, val text: String, val knopf: String, val ja: () -> Unit)

// ---- Einladung an mich ------------------------------------------------------

@Composable
private fun EinladungKarte(e: MeineEinladung, laeuft: Boolean, anfangsOffen: Boolean, h: MannschaftHandlungen) {
    val f = TcmTheme.farben
    var offen by rememberSaveable(e.id) { mutableStateOf(anfangsOffen) }
    var telefon by rememberSaveable(e.id) { mutableStateOf(false) }
    val hinweis = MannschaftLogik.einladungHinweis(e)
    Column(Modifier.fillMaxWidth().karte(padding = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(e.teamName, style = TcmSchrift.text(Schrift.gewichtExtrafett, 19.sp), color = f.ink)
            val zeile = MannschaftLogik.einladungZeile(e)
            if (zeile.isNotEmpty()) Leise(zeile)
        }
        if (hinweis != null) {
            if (e.annehmenMoeglich) Merkzettel(hinweis) else Hinweis(hinweis)
        }
        if (offen && e.annehmenMoeglich) {
            Column(Modifier.fillMaxWidth().background(f.surf2, RoundedCornerShape(Radius.feld))) {
                OnboardingSchalter(
                    label = MannschaftLogik.TELEFON_SCHALTER,
                    beschreibung = "Das kannst du später unter Konto → Tennis ändern.",
                    an = telefon,
                    umschalten = { telefon = it },
                    gesperrt = laeuft,
                )
            }
            Hauptknopf(if (laeuft) "Wird gespeichert…" else "Beitreten", kompakt = true, gesperrt = laeuft) {
                h.annehmen(e, telefon)
            }
            LeiserKnopf("Abbrechen", gesperrt = laeuft) { offen = false }
        } else {
            NebeneinanderOderUntereinander { breite ->
                Hauptknopf(
                    "Annehmen",
                    modifier = breite,
                    kompakt = true,
                    gesperrt = laeuft || !e.annehmenMoeglich,
                    grund = hinweis.takeIf { !e.annehmenMoeglich },
                ) { offen = true }
                LeiserKnopf("Ablehnen", modifier = breite, gesperrt = laeuft) { h.ablehnen(e) }
            }
        }
    }
}

/** Ein Hinweis, der nichts verbietet (der Wechsel aus der alten Mannschaft). */
@Composable
private fun Merkzettel(text: String) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
        color = f.goldInk,
        modifier = Modifier
            .fillMaxWidth()
            .background(f.goldSoft, RoundedCornerShape(Radius.feld))
            .padding(12.dp),
    )
}

// ---- Kader --------------------------------------------------------------------

@Composable
private fun Kader(m: MeineMannschaft, laeuft: Boolean, h: MannschaftHandlungen, fragen: (Rueckfrage) -> Unit) {
    KontoAbschnitt(m.name)
    Leise(
        if (m.ichBinMf) {
            "Du bist Mannschaftsführer. Du kannst Spieler einladen und austragen."
        } else {
            "Ob der Mannschaftsführer deine Nummer sieht, stellst du unter Konto → Tennis ein."
        },
    )
    if (m.ichBinMf) {
        Hauptknopf(MannschaftLogik.HINZUFUEGEN, kompakt = true, gesperrt = laeuft, aktion = h.hinzufuegen)
    }
    KontoGruppe {
        m.kader.forEachIndexed { i, s ->
            if (i > 0) KontoLinie()
            SpielerZeile(
                s = s,
                telefon = s.telefon.takeIf { m.ichBinMf },
                anrufen = h.anrufen,
                austragen = if (MannschaftLogik.darfAustragen(m, s)) {
                    {
                        fragen(
                            Rueckfrage(MannschaftLogik.austragenFrage(s, m), MannschaftLogik.AUSTRAGEN_ERKLAERUNG, "Austragen") {
                                h.austragen(s)
                            },
                        )
                    }
                } else {
                    null
                },
                gesperrt = laeuft,
            )
        }
    }
    if (m.ichBinMf && m.offeneEinladungen.isNotEmpty()) {
        KontoAbschnitt("Offene Einladungen")
        KontoGruppe {
            m.offeneEinladungen.forEachIndexed { i, e ->
                if (i > 0) KontoLinie()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(MannschaftLogik.name(e.firstName, e.lastName), style = zeilenSchrift(), color = TcmTheme.farben.ink)
                        Leise(MannschaftLogik.offeneEinladungZeile(e))
                    }
                    TextButton(onClick = { h.zurueckziehen(e) }, enabled = !laeuft) {
                        Text("Zurückziehen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = TcmTheme.farben.redInk)
                    }
                }
            }
        }
    }
    if (MannschaftLogik.darfAustreten(m)) {
        KontoGruppe(Modifier.padding(top = Abstand.s)) {
            KontoVerweis(MannschaftLogik.AUSTRETEN, rot = true) {
                fragen(Rueckfrage(MannschaftLogik.austretenFrage(m), MannschaftLogik.AUSTRETEN_ERKLAERUNG, "Austreten") { h.austreten(m) })
            }
        }
    }
}

@Composable
private fun zeilenSchrift() = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp)

@Composable
private fun SpielerZeile(
    s: MeineMannschaft.Spieler,
    telefon: String?,
    anrufen: (String) -> Unit,
    austragen: (() -> Unit)?,
    gesperrt: Boolean,
) {
    val f = TcmTheme.farben
    val name = MannschaftLogik.name(s.firstName, s.lastName)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(38.dp).background(if (s.isTeamCaptain) f.goldSoft else f.surf2, CircleShape).clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            Text(
                Initialen.von(s.firstName, s.lastName),
                style = TcmSchrift.text(Schrift.gewichtFett, 14.sp),
                color = if (s.isTeamCaptain) f.goldInk else f.ink2,
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Column(Modifier.semantics(mergeDescendants = true) {}) {
                Text(name, style = zeilenSchrift(), color = f.ink)
                MannschaftLogik.spielerZeile(s)?.let { Leise(it) }
            }
            val link = MannschaftLogik.telefonLink(telefon)
            if (telefon != null && link != null) {
                Text(
                    telefon,
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp),
                    color = f.blueInk,
                    modifier = Modifier
                        .clickable(role = Role.Button) { anrufen(link) }
                        .semantics { contentDescription = "$name anrufen: $telefon" },
                )
            }
        }
        if (austragen != null) {
            TextButton(onClick = austragen, enabled = !gesperrt) {
                Text("Austragen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = f.redInk)
            }
        }
    }
}

// ---- Spieler hinzufuegen ------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SpielerHinzufuegenFenster(
    laden: suspend (String) -> List<Kandidat>,
    gesperrt: Boolean,
    einladen: (Kandidat) -> Unit,
    zu: () -> Unit,
) {
    val f = TcmTheme.farben
    val zustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var suche by rememberSaveable { mutableStateOf("") }
    var liste by remember { mutableStateOf<List<Kandidat>?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }

    // Erst tippen lassen, dann suchen; ein neuer Buchstabe bricht die alte Suche ab.
    // Nach einer Einladung (gesperrt wird wieder false) laedt dieselbe Suche neu - dann ausgegraut.
    LaunchedEffect(suche, gesperrt) {
        if (gesperrt) return@LaunchedEffect
        if (liste != null) delay(300)
        try {
            liste = laden(suche)
            fehler = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fehler = Meldung.aus(e).text
        }
    }

    ModalBottomSheet(
        onDismissRequest = zu,
        sheetState = zustand,
        containerColor = f.bg,
        shape = RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt),
        dragHandle = { BottomSheetDefaults.DragHandle(color = f.line2) },
    ) {
        SpielerSucheInhalt(
            suche = suche,
            sucheAendern = { suche = it },
            liste = liste,
            fehler = fehler,
            gesperrt = gesperrt,
            einladen = einladen,
            zu = { scope.launch { zustand.hide() }.invokeOnCompletion { zu() } },
        )
    }
}

/** Suchfeld und Treffer, ohne das Blatt drumherum (auch fuer die Screenshot-Tests). */
@Composable
fun SpielerSucheInhalt(
    suche: String,
    sucheAendern: (String) -> Unit,
    liste: List<Kandidat>?,
    fehler: String?,
    gesperrt: Boolean,
    einladen: (Kandidat) -> Unit,
    zu: () -> Unit,
) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .background(f.bg)
            .verticalScroll(rememberScrollState())
            .padding(start = Abstand.rand, end = Abstand.rand, bottom = Abstand.rand)
            .navigationBarsPadding()
            .imePadding(),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        BlattKopf(MannschaftLogik.HINZUFUEGEN, zu)
        Leise("Die Person bekommt eine Einladung und ist erst nach dem Annehmen im Kader. Einladungen verfallen nach 30 Tagen.")
        KontoFeld(label = MannschaftLogik.SUCHE_LABEL, wert = suche, aendern = sucheAendern)
        fehler?.let { Fehlerzeile(it) }
        when {
            liste == null && fehler == null -> Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = f.muted)
            }
            liste.isNullOrEmpty() -> if (fehler == null) Leise(MannschaftLogik.KEINE_KANDIDATEN)
            else -> KontoGruppe {
                liste.forEachIndexed { i, k ->
                    if (i > 0) KontoLinie()
                    KandidatZeile(k, gesperrt, einladen)
                }
            }
        }
    }
}

@Composable
private fun KandidatZeile(k: Kandidat, gesperrt: Boolean, einladen: (Kandidat) -> Unit) {
    val f = TcmTheme.farben
    val name = MannschaftLogik.name(k.firstName, k.lastName)
    val aus = k.eingeladen
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(
            Modifier.weight(1f).semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(name, style = zeilenSchrift(), color = if (aus) f.muted else f.ink)
            MannschaftLogik.kandidatZeile(k)?.let { Text(it, style = leise, color = f.muted) }
            val marken = MannschaftLogik.kandidatMarken(k)
            if (marken.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (mk in marken) KandidatMarke(mk, hervor = mk == "Interesse" && !aus)
                }
            }
        }
        TextButton(onClick = { einladen(k) }, enabled = !aus && !gesperrt) {
            Text(
                if (aus) "Eingeladen" else "Einladen",
                style = TcmSchrift.text(Schrift.gewichtFett, 14.sp),
                color = if (aus) f.muted else f.blueInk,
            )
        }
    }
}

@Composable
private fun KandidatMarke(text: String, hervor: Boolean) {
    val f = TcmTheme.farben
    Box(
        Modifier
            .heightIn(min = 22.dp)
            .background(if (hervor) f.goldSoft else f.surf2, CircleShape)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtFett, Schrift.klein), color = if (hervor) f.goldInk else f.ink2)
    }
}
