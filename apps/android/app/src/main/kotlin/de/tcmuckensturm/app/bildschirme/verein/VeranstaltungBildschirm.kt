/*
 * Eine Veranstaltung (apps/mobile/app/(tabs)/verein/veranstaltung/[id].tsx)
 *
 * Wie Bildschirme/Verein/VeranstaltungBildschirm.swift der iOS-App: blauer
 * Kopf mit Titel, Eckdaten mit Belegung als Zahl (keine Namen), Beschreibung
 * und darunter die eigene Anmeldung: mit Begleitpersonen und Bemerkung
 * anmelden, aendern, abmelden, Stand auf der Warteliste.
 *
 * Ob es klappt, entscheiden die RPCs; die Knoepfe zeigen nur, was gerade
 * geht. Der Betrag kommt aus der eigenen Forderung (meine_forderung_* in
 * events_fuer_mitglied) - so steht hier dasselbe wie im Konto.
 *
 * Oben eine feste, helle Leiste mit Zurueck-Pfeil (die Zurueck-Geste geht
 * ueber den NavHost). Ist der grosse Titel hinausgescrollt, steht er klein in
 * der Leiste (useKompakterTitel in der Expo-App).
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.Fehlerzustand
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.bildschirme.Hinweis
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.LeiserKnopf
import de.tcmuckensturm.app.bildschirme.Zweitknopf
import de.tcmuckensturm.app.bildschirme.grosseSchrift
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.VeranstaltungDetail
import de.tcmuckensturm.app.daten.Vereinsdaten
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Veranstaltungen
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

data class VeranstaltungStand(
    val detail: VeranstaltungDetail? = null,
    val fehler: String? = null,
    val laedt: Boolean = true,
    val aktualisiert: Boolean = false,
    /** Hier statt in der Anmeldung: die baut sich nach einer Aenderung neu auf, die Meldung bleibt. */
    val meldung: Vereinsdaten.Ergebnis? = null,
    val laeuft: Boolean = false,
)

class VeranstaltungModell(private val daten: Vereinsdaten, private val id: String) : ViewModel() {
    var stand by mutableStateOf(VeranstaltungStand())
        private set

    init {
        laden(nachladen = false)
    }

    fun laden(nachladen: Boolean) {
        viewModelScope.launch { ladenUndWarten(nachladen) }
    }

    private suspend fun ladenUndWarten(nachladen: Boolean) {
        if (nachladen) stand = stand.copy(aktualisiert = true)
        stand = try {
            stand.copy(detail = daten.veranstaltung(id), fehler = null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            stand.copy(fehler = Meldung.aus(e).text)
        }
        stand = stand.copy(laedt = false, aktualisiert = false)
    }

    fun meldungWeg() {
        stand = stand.copy(meldung = null)
    }

    /** Eine Handlung; klappt sie, laeuft `danach` und der Stand wird neu geladen. */
    fun tue(arbeit: suspend (Vereinsdaten) -> Vereinsdaten.Ergebnis, danach: () -> Unit) {
        if (stand.laeuft) return
        stand = stand.copy(laeuft = true)
        viewModelScope.launch {
            val r = arbeit(daten)
            stand = stand.copy(laeuft = false, meldung = r)
            if (r.ok) {
                danach()
                ladenUndWarten(nachladen = false)
            }
        }
    }

    fun meldeAn(begleitpersonen: Int, bemerkung: String, danach: () -> Unit) =
        tue({ it.meldeAn(id, begleitpersonen, bemerkung) }, danach)

    fun aendere(begleitpersonen: Int, bemerkung: String, danach: () -> Unit) =
        tue({ it.aendereAnmeldung(id, begleitpersonen, bemerkung) }, danach)

    fun meldeAb(danach: () -> Unit) = tue({ it.meldeAb(id) }, danach)
}

/** Was die Seite bei einer Handlung aufruft. */
class VeranstaltungAktionen(
    val zurueck: () -> Unit = {},
    val nachladen: () -> Unit = {},
    val meldungWeg: () -> Unit = {},
    val meldeAn: (Int, String, () -> Unit) -> Unit = { _, _, _ -> },
    val aendere: (Int, String, () -> Unit) -> Unit = { _, _, _ -> },
    val meldeAb: (() -> Unit) -> Unit = {},
)

@Composable
fun VeranstaltungBildschirm(id: String, zurueck: () -> Unit) {
    val client = LocalSitzung.current.client
    val modell = viewModel(key = "veranstaltung-$id") { VeranstaltungModell(Vereinsdaten(client), id) }
    VeranstaltungSeite(
        stand = modell.stand,
        jetzt = Instant.now(),
        aktionen = VeranstaltungAktionen(
            zurueck = zurueck,
            nachladen = { modell.laden(nachladen = true) },
            meldungWeg = modell::meldungWeg,
            meldeAn = modell::meldeAn,
            aendere = modell::aendere,
            meldeAb = modell::meldeAb,
        ),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VeranstaltungSeite(stand: VeranstaltungStand, jetzt: Instant, aktionen: VeranstaltungAktionen) {
    val f = TcmTheme.farben
    val scroll = rememberScrollState()
    var kopfHoehe by remember { mutableIntStateOf(0) }
    // Kompakt, sobald der Kopf zu zwei Dritteln unter der Leiste liegt.
    val kompakt by remember { derivedStateOf { kopfHoehe > 0 && scroll.value > kopfHoehe * 2 / 3 } }
    val titelSichtbar by animateFloatAsState(if (kompakt) 1f else 0f, label = "titel")
    val titel = stand.detail?.event?.title
    val ereignis = stand.detail?.event
    // Neu aufgebaut, wenn sich der eigene Stand aendert: das Formular startet mit dem neuen Stand.
    val form = key(ereignis?.meinStatus, ereignis?.meineBegleitpersonen, ereignis?.meineBemerkung, ereignis?.status) {
        val dabei = ereignis != null && VereinLogik.dabei(ereignis)
        Anmeldeform(
            begleitung = rememberSaveable { mutableIntStateOf(if (dabei) ereignis?.meineBegleitpersonen ?: 0 else 0) },
            bemerkung = rememberSaveable { mutableStateOf(if (dabei) ereignis?.meineBemerkung ?: "" else "") },
            bearbeiten = rememberSaveable { mutableStateOf(false) },
            frage = rememberSaveable { mutableStateOf(false) },
        )
    }

    Column(Modifier.fillMaxSize().background(f.bg).imePadding()) {
        // Die Leiste: hell wie die Seite, Zurueck als runder Knopf; der Titel erscheint beim Rollen.
        Row(
            Modifier
                .fillMaxWidth()
                .background(f.bg)
                .statusBarsPadding()
                .height(60.dp)
                .padding(horizontal = Abstand.rand - 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(
                onClick = aktionen.zurueck,
                colors = IconButtonDefaults.iconButtonColors(containerColor = f.surf2),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück", tint = f.ink)
            }
            Text(
                titel ?: "",
                style = TcmSchrift.display(Schrift.gewichtHalbfett, 18.sp),
                color = f.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(end = 16.dp).alpha(titelSichtbar),
            )
        }
        PullToRefreshBox(isRefreshing = stand.aktualisiert, onRefresh = aktionen.nachladen, modifier = Modifier.weight(1f)) {
            Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
                // Die Art steht als Marke ueber dem Titel.
                ereignis?.let { e ->
                    FlowRow(
                        Modifier.padding(horizontal = Abstand.rand).padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        for (m in VereinLogik.marken(e, jetzt)) MarkeKlein(m.text, m.ton)
                    }
                }
                Kopf(titel, Modifier.onSizeChanged { kopfHoehe = it.height })
                Column(
                    Modifier
                        .padding(horizontal = Abstand.rand)
                        .padding(top = Abstand.s, bottom = Abstand.abschnitt * 2),
                    verticalArrangement = Arrangement.spacedBy(Abstand.m),
                ) {
                    val d = stand.detail
                    stand.fehler?.let {
                        if (d == null) Fehlerzustand(it, stand.aktualisiert, erneut = aktionen.nachladen) else Fehlerzeile(it, stand.aktualisiert, aktionen.nachladen)
                    }
                    when {
                        stand.laedt && d == null -> Box(
                            Modifier.fillMaxWidth().padding(top = 40.dp),
                            contentAlignment = Alignment.Center,
                        ) { CircularProgressIndicator(color = f.muted) }
                        d != null -> Inhalt(d, jetzt, stand, aktionen, form)
                        stand.fehler == null -> Leise("Diese Veranstaltung gibt es nicht (mehr).")
                    }
                }
            }
        }
        // Unten fest: die eine Hauptaktion - anmelden oder die Aenderung speichern.
        stand.detail?.let { d -> AnmeldeFuss(d.event, jetzt, stand, aktionen, form) }
    }
}

/** Was das Formular gerade haelt; lebt ueber Karte und Fuss hinweg. */
private class Anmeldeform(
    val begleitung: MutableIntState,
    val bemerkung: MutableState<String>,
    val bearbeiten: MutableState<Boolean>,
    val frage: MutableState<Boolean>,
)

@Composable
private fun AnmeldeFuss(e: MitgliedEvent, jetzt: Instant, stand: VeranstaltungStand, aktionen: VeranstaltungAktionen, form: Anmeldeform) {
    val f = TcmTheme.farben
    val dabei = VereinLogik.dabei(e)
    val aendern = dabei && form.bearbeiten.value
    val anmelden = !dabei && Veranstaltungen.eventAnmeldbar(e, jetzt)
    if (!aendern && !anmelden) return
    val begleitung = form.begleitung.intValue
    Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
    Column(
        Modifier.fillMaxWidth().background(f.bg).navigationBarsPadding().padding(horizontal = Abstand.rand).padding(top = 14.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!aendern && Veranstaltungen.eventNurWarteliste(e, begleitung)) Leise(VereinLogik.wartelisteVorab(begleitung))
        Hauptknopf(
            text = if (aendern) VereinLogik.aenderungKnopf(e, begleitung) else Veranstaltungen.eventAnmeldenKnopf(e, begleitung),
            gesperrt = stand.laeuft,
        ) {
            if (aendern) {
                aktionen.aendere(begleitung, form.bemerkung.value) { form.bearbeiten.value = false }
            } else {
                aktionen.meldeAn(begleitung, form.bemerkung.value) {}
            }
        }
        if (aendern) LeiserKnopf("Abbrechen") { form.bearbeiten.value = false }
    }
}

/** Der Titel der Veranstaltung, gross unter der Leiste. */
@Composable
private fun Kopf(titel: String?, modifier: Modifier) {
    Text(
        titel ?: " ",
        style = TcmSchrift.display(Schrift.gewichtFett, 28.sp, (-0.4).sp),
        color = TcmTheme.farben.ink,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Abstand.rand)
            .padding(top = 6.dp, bottom = 4.dp)
            .semantics { heading() },
    )
}

@Composable
private fun ColumnScope.Inhalt(
    d: VeranstaltungDetail,
    jetzt: Instant,
    stand: VeranstaltungStand,
    aktionen: VeranstaltungAktionen,
    form: Anmeldeform,
) {
    val f = TcmTheme.farben
    val e = d.event
    Text(
        Veranstaltungen.eventLangeZeit(e.startsAt, e.endsAt),
        style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp),
        color = f.muted,
    )

    Eckdaten(e)

    val beschreibung = e.description
    if (!beschreibung.isNullOrEmpty()) {
        Text(
            beschreibung,
            style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal).copy(lineHeight = 23.sp),
            color = f.ink,
            modifier = Modifier.fillMaxWidth().karte(padding = 16.dp),
        )
    }

    AnmeldungKarte(d, jetzt, stand, aktionen, form)
}

// ---- Eckdaten ------------------------------------------------------------------

/** Die Eckdaten als Karte: je Zeile links der Kicker, rechts der Wert; Linien dazwischen. */
@Composable
private fun Eckdaten(e: MitgliedEvent) {
    val f = TcmTheme.farben
    val zeilen = buildList<@Composable () -> Unit> {
        add { Eckdatum("Wann", Veranstaltungen.eventZeitText(e.startsAt, e.endsAt)) }
        val ort = e.location
        if (!ort.isNullOrEmpty()) add { Eckdatum("Ort", ort) }
        val fee = e.feeCents
        if (fee != null && fee != 0) {
            add { Eckdatum("Preis", "${Geld.formatCents(fee)} pro Person", VereinLogik.preisHinweis(e)) }
        }
        val h = e.workHours
        if (e.kind == "arbeitsdienst" && h != null) {
            add {
                Eckdatum(
                    "Stunden",
                    "${Veranstaltungen.stundenText(h)} Std. Arbeitsdienst",
                    "Werden nach dem Termin für alle Anwesenden gutgeschrieben.",
                )
            }
        }
        if (e.registrationEnabled == true) {
            add {
                Eckdatum(
                    "Anmeldeschluss",
                    Veranstaltungen.eventTagKurz(Veranstaltungen.eventSchluss(e)),
                    if ((e.feeCents ?: 0) != 0) "Wer sich danach abmeldet, zahlt trotzdem." else null,
                )
            }
            add {
                Eckdatum("Belegung", Veranstaltungen.eventBelegungText(e)) {
                    // Der Fortschrittsbalken in kraeftigem Blau, ueber die ganze Breite.
                    Veranstaltungen.eventBelegungAnteil(e)?.let { anteil ->
                        Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(6.dp).clip(CircleShape).background(f.surf2)) {
                            Box(Modifier.fillMaxWidth(anteil.toFloat()).height(6.dp).clip(CircleShape).background(f.blue))
                        }
                    }
                }
            }
        }
    }
    Column(Modifier.fillMaxWidth().karte(padding = 0.dp)) {
        zeilen.forEachIndexed { i, zeile ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
            zeile()
        }
    }
}

@Composable
private fun Eckdatum(label: String, wert: String, klein: String? = null, zusatz: @Composable () -> Unit = {}) {
    val f = TcmTheme.farben
    // Bei grosser Schrift steht das Label ueber dem Wert.
    val gross = grosseSchrift(1.5f)
    Column(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (gross) {
            Kicker(label)
            Text(wert, style = TcmSchrift.display(Schrift.gewichtHalbfett, Schrift.normal), color = f.ink)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Kicker(label)
                Text(
                    wert,
                    style = TcmSchrift.display(Schrift.gewichtHalbfett, Schrift.normal),
                    color = f.ink,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        klein?.let {
            Text(
                it,
                style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp).copy(lineHeight = 17.sp),
                color = f.muted,
                textAlign = if (gross) TextAlign.Start else TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        zusatz()
    }
}

// ---- Die eigene Anmeldung ------------------------------------------------------

private const val MAX_BEGLEITUNG = 20
private const val MAX_BEMERKUNG = 500

@Composable
private fun AnmeldungKarte(
    d: VeranstaltungDetail,
    jetzt: Instant,
    stand: VeranstaltungStand,
    aktionen: VeranstaltungAktionen,
    form: Anmeldeform,
) {
    val e = d.event
    val dabei = VereinLogik.dabei(e)
    var begleitung by form.begleitung
    var bemerkung by form.bemerkung
    var bearbeiten by form.bearbeiten
    var frage by form.frage

    val formular: @Composable (Boolean) -> Unit = { _ ->
        Formular(
            e = e,
            begleitung = begleitung,
            begleitungAendern = { begleitung = it },
            bemerkung = bemerkung,
            bemerkungAendern = { bemerkung = it.take(MAX_BEMERKUNG) },
        )
    }
    val hinweis: @Composable () -> Unit = { stand.meldung?.let { Hinweis(it.meldung, it.ok) } }

    when {
        dabei -> DabeiKarte(
            d = d,
            jetzt = jetzt,
            bearbeiten = bearbeiten,
            frage = frage,
            laeuft = stand.laeuft,
            hinweis = hinweis,
            formular = { formular(true) },
            aendern = {
                aktionen.meldungWeg()
                bearbeiten = true
            },
            fragen = { frage = it },
            abmelden = { aktionen.meldeAb { frage = false } },
        )
        Veranstaltungen.eventAnmeldbar(e, jetzt) -> Column(
            Modifier.fillMaxWidth().karte(padding = 16.dp),
            verticalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            Abschnitt("Anmelden")
            hinweis()
            formular(false)
            Veranstaltungen.eventGebuehrHinweis(e)?.let {
                Text(
                    it,
                    style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp).copy(lineHeight = 18.sp),
                    color = TcmTheme.farben.muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        else -> Column(Modifier.fillMaxWidth().karte(padding = 16.dp), verticalArrangement = Arrangement.spacedBy(Abstand.m)) {
            hinweis()
            Leise(VereinLogik.nichtsZuTun(e, jetzt))
        }
    }
}

@Composable
private fun DabeiKarte(
    d: VeranstaltungDetail,
    jetzt: Instant,
    bearbeiten: Boolean,
    frage: Boolean,
    laeuft: Boolean,
    hinweis: @Composable () -> Unit,
    formular: @Composable () -> Unit,
    aendern: () -> Unit,
    fragen: (Boolean) -> Unit,
    abmelden: () -> Unit,
) {
    val f = TcmTheme.farben
    val e = d.event
    val wartet = e.meinStatus == "waitlisted"
    val form = RoundedCornerShape(Radius.karte)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(form)
            .background(f.blueSoft)
            .border(1.dp, f.blue.copy(alpha = 0.22f), form)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(Abstand.s),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // Gelb heisst "deins": der Haken an der eigenen Anmeldung.
            if (!wartet) {
                Box(Modifier.size(32.dp).background(f.gold, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Check, contentDescription = null, tint = f.onGold, modifier = Modifier.size(18.dp))
                }
            }
            Abschnitt(if (wartet) "Du stehst auf der Warteliste" else "Du bist angemeldet")
        }
        hinweis()
        if (bearbeiten) {
            formular()
            return@Column
        }
        Text(
            Veranstaltungen.eventPersonenText(e.meineBegleitpersonen ?: 0),
            style = TcmSchrift.display(Schrift.gewichtHalbfett, Schrift.normal),
            color = f.ink,
        )
        val cents = e.meineForderungCents
        if (wartet) {
            Leise(Veranstaltungen.eventWartelisteText(d.wartePlatz, e.warteliste ?: 0))
        } else if (cents != null) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontFamily = TcmSchrift.display, fontWeight = Schrift.gewichtFett, fontSize = 20.sp)) {
                        append(Geld.formatCents(cents))
                    }
                    append(" ${VereinLogik.forderungText(e.meineForderungStatus)}")
                },
                style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
                color = f.ink,
            )
        }
        val b = e.meineBemerkung
        if (!b.isNullOrEmpty()) Leise("Bemerkung: $b")
        Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (frage) {
                Text(
                    VereinLogik.abmeldenFrage(e, jetzt),
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.normal),
                    color = f.ink,
                )
                Hauptknopf("Ja, abmelden", rot = true, gesperrt = laeuft, aktion = abmelden)
                LeiserKnopf("Nein") { fragen(false) }
            } else {
                if (Veranstaltungen.eventAenderbar(e, jetzt)) Zweitknopf("Anmeldung ändern", aktion = aendern)
                if (Veranstaltungen.eventAbmeldbar(e, jetzt)) {
                    // Rot als Text, nicht als Flaeche: erst die Rueckfrage bestaetigt.
                    TextButton(onClick = { fragen(true) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text(
                            Veranstaltungen.eventAbmeldenKnopf(e, jetzt),
                            style = TcmSchrift.display(Schrift.gewichtHalbfett, 16.sp),
                            color = f.redInk,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

// ---- Formular ------------------------------------------------------------------

/** Begleitpersonen und Bemerkung; abgeschickt wird im Fuss der Seite. */
@Composable
private fun Formular(
    e: MitgliedEvent,
    begleitung: Int,
    begleitungAendern: (Int) -> Unit,
    bemerkung: String,
    bemerkungAendern: (String) -> Unit,
) {
    val f = TcmTheme.farben
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (e.companionsAllowed == true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Begleitpersonen", style = TcmSchrift.display(Schrift.gewichtHalbfett, Schrift.normal), color = f.ink)
                    Leise(VereinLogik.begleitHinweis(e))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Zaehlknopf(plus = false, beschriftung = "Eine Begleitperson weniger", aus = begleitung <= 0) {
                        begleitungAendern(maxOf(0, begleitung - 1))
                    }
                    Zaehlerstand(begleitung, "$begleitung ${if (begleitung == 1) "Begleitperson" else "Begleitpersonen"}")
                    Zaehlknopf(
                        plus = true,
                        beschriftung = "Eine Begleitperson mehr",
                        betont = true,
                        aus = begleitung >= MAX_BEGLEITUNG,
                    ) { begleitungAendern(minOf(MAX_BEGLEITUNG, begleitung + 1)) }
                }
            }
        }
        Column {
            Kicker("Bemerkung", Modifier.padding(bottom = 8.dp))
            BasicTextField(
                value = bemerkung,
                onValueChange = bemerkungAendern,
                singleLine = true,
                textStyle = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal).copy(color = f.ink),
                cursorBrush = SolidColor(f.blue),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .background(f.surf2, RoundedCornerShape(Radius.feld))
                    .border(1.dp, f.line2, RoundedCornerShape(Radius.feld))
                    .semantics { contentDescription = "Bemerkung" },
                decorationBox = { feld ->
                    Box(Modifier.padding(horizontal = 20.dp, vertical = 14.dp), contentAlignment = Alignment.CenterStart) {
                        if (bemerkung.isEmpty()) {
                            Text("z. B. vegetarisch", style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal), color = f.muted)
                        }
                        feld()
                    }
                },
            )
        }
    }
}
