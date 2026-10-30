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
 * Oben eine feste Leiste in brand mit Zurueck-Pfeil (die Zurueck-Geste geht
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
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

    Column(Modifier.fillMaxSize().background(f.bg)) {
        // Die Leiste: brand bis unter die Statusleiste, Zurueck weiss auf brand (5,9:1).
        Row(
            Modifier
                .fillMaxWidth()
                .background(f.brand)
                .statusBarsPadding()
                .height(56.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = aktionen.zurueck) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück", tint = f.onBrand)
            }
            Text(
                titel ?: "",
                style = TcmSchrift.display(Schrift.gewichtFett, 18.sp),
                color = f.onBrand,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(end = 16.dp).alpha(titelSichtbar),
            )
        }
        PullToRefreshBox(isRefreshing = stand.aktualisiert, onRefresh = aktionen.nachladen, modifier = Modifier.weight(1f)) {
            Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
                Kopf(titel, Modifier.onSizeChanged { kopfHoehe = it.height })
                Column(
                    Modifier
                        .padding(horizontal = Abstand.rand)
                        .padding(top = Abstand.rand, bottom = Abstand.abschnitt * 2),
                    verticalArrangement = Arrangement.spacedBy(Abstand.m),
                ) {
                    val d = stand.detail
                    stand.fehler?.let { Fehlerzeile(it, stand.aktualisiert, aktionen.nachladen) }
                    when {
                        stand.laedt && d == null -> Box(
                            Modifier.fillMaxWidth().padding(top = 40.dp),
                            contentAlignment = Alignment.Center,
                        ) { CircularProgressIndicator(color = f.muted) }
                        d != null -> Inhalt(d, jetzt, stand, aktionen)
                        stand.fehler == null -> Leise("Diese Veranstaltung gibt es nicht (mehr).")
                    }
                }
            }
        }
    }
}

/** Der blaue Kopf unter der Leiste, die ebenfalls blau ist. */
@Composable
private fun Kopf(titel: String?, modifier: Modifier) {
    val f = TcmTheme.farben
    Box(modifier.fillMaxWidth().background(f.brand)) {
        Platzlinien(Modifier.matchParentSize())
        Text(
            titel ?: " ",
            style = TcmSchrift.display(Schrift.gewichtFett, 28.sp),
            color = f.onBrand,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Abstand.rand)
                .padding(top = 6.dp, bottom = 18.dp)
                .semantics { heading() },
        )
    }
}

@Composable
private fun ColumnScope.Inhalt(d: VeranstaltungDetail, jetzt: Instant, stand: VeranstaltungStand, aktionen: VeranstaltungAktionen) {
    val f = TcmTheme.farben
    val e = d.event
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (m in VereinLogik.marken(e, jetzt)) MarkeKlein(m.text, m.ton)
    }
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

    // Neu aufgebaut, wenn sich der eigene Stand aendert: das Formular startet mit dem neuen Stand.
    key(e.meinStatus, e.meineBegleitpersonen, e.meineBemerkung, e.status) {
        AnmeldungKarte(d, jetzt, stand, aktionen)
    }
}

// ---- Eckdaten ------------------------------------------------------------------

@Composable
private fun Eckdaten(e: MitgliedEvent) {
    val f = TcmTheme.farben
    Column(Modifier.fillMaxWidth().karte(padding = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Eckdatum("Wann", Veranstaltungen.eventZeitText(e.startsAt, e.endsAt))
        val ort = e.location
        if (!ort.isNullOrEmpty()) Eckdatum("Ort", ort)
        val fee = e.feeCents
        if (fee != null && fee != 0) {
            Eckdatum("Preis", "${Geld.formatCents(fee)} pro Person", VereinLogik.preisHinweis(e))
        }
        val h = e.workHours
        if (e.kind == "arbeitsdienst" && h != null) {
            Eckdatum(
                "Stunden",
                "${Veranstaltungen.stundenText(h)} Std. Arbeitsdienst",
                "Werden nach dem Termin für alle Anwesenden gutgeschrieben.",
            )
        }
        if (e.registrationEnabled == true) {
            Eckdatum(
                "Anmeldeschluss",
                Veranstaltungen.eventTagKurz(Veranstaltungen.eventSchluss(e)),
                if ((e.feeCents ?: 0) != 0) "Wer sich danach abmeldet, zahlt trotzdem." else null,
            )
            Eckdatum("Belegung", Veranstaltungen.eventBelegungText(e)) {
                Veranstaltungen.eventBelegungAnteil(e)?.let { anteil ->
                    Box(
                        Modifier
                            .padding(top = 6.dp)
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(CircleShape)
                            .background(f.surf2),
                    ) {
                        Box(Modifier.fillMaxWidth(anteil.toFloat()).height(8.dp).clip(CircleShape).background(f.green))
                    }
                }
            }
        }
    }
}

@Composable
private fun Eckdatum(label: String, wert: String, klein: String? = null, zusatz: @Composable () -> Unit = {}) {
    val f = TcmTheme.farben
    // Bei grosser Schrift steht das Label ueber dem Wert.
    val gross = LocalDensity.current.fontScale >= 1.5f
    val werte: @Composable () -> Unit = {
        Text(wert, style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal), color = f.ink)
        klein?.let {
            Text(it, style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp).copy(lineHeight = 17.sp), color = f.muted)
        }
        zusatz()
    }
    if (gross) {
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Leise(label)
            werte()
        }
    } else {
        Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Leise(label, Modifier.width(112.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) { werte() }
        }
    }
}

// ---- Die eigene Anmeldung ------------------------------------------------------

private const val MAX_BEGLEITUNG = 20
private const val MAX_BEMERKUNG = 500

@Composable
private fun AnmeldungKarte(d: VeranstaltungDetail, jetzt: Instant, stand: VeranstaltungStand, aktionen: VeranstaltungAktionen) {
    val e = d.event
    val dabei = VereinLogik.dabei(e)
    var begleitung by rememberSaveable { mutableIntStateOf(if (dabei) e.meineBegleitpersonen ?: 0 else 0) }
    var bemerkung by rememberSaveable { mutableStateOf(if (dabei) e.meineBemerkung ?: "" else "") }
    var bearbeiten by rememberSaveable { mutableStateOf(false) }
    var frage by rememberSaveable { mutableStateOf(false) }

    val formular: @Composable (Boolean) -> Unit = { aendern ->
        Formular(
            e = e,
            aendern = aendern,
            begleitung = begleitung,
            begleitungAendern = { begleitung = it },
            bemerkung = bemerkung,
            bemerkungAendern = { bemerkung = it.take(MAX_BEMERKUNG) },
            laeuft = stand.laeuft,
            absenden = {
                if (aendern) aktionen.aendere(begleitung, bemerkung) { bearbeiten = false }
                else aktionen.meldeAn(begleitung, bemerkung) {}
            },
            abbrechen = { bearbeiten = false },
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
            .background(if (wartet) f.goldSoft else f.green.copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.1f))
            .border(1.dp, if (wartet) f.goldLine else f.green.copy(alpha = 0.35f), form)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(Abstand.s),
    ) {
        Abschnitt(if (wartet) "Du stehst auf der Warteliste" else "Du bist angemeldet")
        hinweis()
        if (bearbeiten) {
            formular()
            return@Column
        }
        Text(
            Veranstaltungen.eventPersonenText(e.meineBegleitpersonen ?: 0),
            style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal),
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
                if (Veranstaltungen.eventAenderbar(e, jetzt)) LeiserKnopf("Anmeldung ändern", aktion = aendern)
                if (Veranstaltungen.eventAbmeldbar(e, jetzt)) {
                    LeiserKnopf(Veranstaltungen.eventAbmeldenKnopf(e, jetzt), rot = true) { fragen(true) }
                }
            }
        }
    }
}

// ---- Formular ------------------------------------------------------------------

@Composable
private fun Formular(
    e: MitgliedEvent,
    aendern: Boolean,
    begleitung: Int,
    begleitungAendern: (Int) -> Unit,
    bemerkung: String,
    bemerkungAendern: (String) -> Unit,
    laeuft: Boolean,
    absenden: () -> Unit,
    abbrechen: () -> Unit,
) {
    val f = TcmTheme.farben
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (e.companionsAllowed == true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Begleitpersonen", style = TcmSchrift.text(Schrift.gewichtFett, Schrift.normal), color = f.ink)
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
                        gelb = begleitung > 0,
                        aus = begleitung >= MAX_BEGLEITUNG,
                    ) { begleitungAendern(minOf(MAX_BEGLEITUNG, begleitung + 1)) }
                }
            }
        }
        OutlinedTextField(
            value = bemerkung,
            onValueChange = bemerkungAendern,
            label = { Text("Bemerkung") },
            placeholder = { Text("z. B. vegetarisch", color = f.muted) },
            singleLine = true,
            textStyle = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
            shape = RoundedCornerShape(Radius.feld),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = f.surf,
                unfocusedContainerColor = f.surf,
                focusedBorderColor = f.blue,
                unfocusedBorderColor = f.rahmen,
                focusedLabelColor = f.blueInk,
                unfocusedLabelColor = f.ink2,
                focusedTextColor = f.ink,
                unfocusedTextColor = f.ink,
                cursorColor = f.blue,
            ),
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        )
        if (!aendern && Veranstaltungen.eventNurWarteliste(e, begleitung)) {
            Leise(VereinLogik.wartelisteVorab(begleitung))
        }
        Hauptknopf(
            text = if (aendern) {
                VereinLogik.aenderungKnopf(e, begleitung)
            } else {
                Veranstaltungen.eventAnmeldenKnopf(e, begleitung)
            },
            gesperrt = laeuft,
            aktion = absenden,
        )
        if (aendern) LeiserKnopf("Abbrechen", aktion = abbrechen)
    }
}
