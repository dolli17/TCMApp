/*
 * Die Benachrichtigungen (NachrichtenListe.tsx)
 *
 * Wie NachrichtenListe.swift der iOS-App: nach Tagen gruppiert
 * (groupNotifications), je Art ein Symbol (notificationSymbol), relative
 * Zeit, ungelesene auf goldSoft. Dieselbe Liste steht im Blatt hinter der
 * Glocke und auf dem Bildschirm Neuigkeiten.
 *
 * Gelesen markiert wird beim Oeffnen. Die Hervorhebung bleibt aber stehen,
 * bis "Alle als gelesen" sie wegnimmt - sonst saehe niemand, was neu war.
 */

package de.tcmuckensturm.app.bildschirme.nachrichten

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.bildschirme.grosseSchrift
import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.app.bildschirme.karte
import de.tcmuckensturm.app.bildschirme.mitTrennung
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.NotificationSymbol
import de.tcmuckensturm.kern.Startseite
import java.time.Instant

/** Symbol je Art der Nachricht (Grundsatz der Material-Symbole) */
fun symbolBild(symbol: NotificationSymbol): ImageVector = when (symbol) {
    NotificationSymbol.PLATZ -> Icons.Outlined.DateRange
    NotificationSymbol.STORNO -> Icons.Outlined.Close
    NotificationSymbol.GELD -> Icons.Outlined.ShoppingCart
    NotificationSymbol.PERSON -> Icons.Outlined.Person
    NotificationSymbol.GLOCKE -> Icons.Outlined.Notifications
}

/** "Alle als gelesen" - erscheint nur, solange etwas hervorgehoben ist. */
@Composable
fun AlleGelesenKnopf(aktion: () -> Unit) {
    TextButton(onClick = aktion) {
        Text("Alle als gelesen", style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = TcmTheme.farben.blueInk)
    }
}

/** Duenne Linie zwischen Zeilen einer Karte */
@Composable
fun Trennlinie() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(TcmTheme.farben.line),
    )
}

/**
 * @param zuVeranstaltung Nennt eine Nachricht eine Veranstaltung, fuehrt ein Tippen dorthin.
 */
@Composable
fun NachrichtenListe(
    liste: List<Benachrichtigung>,
    alleGesehen: Boolean,
    jetzt: Instant = Instant.now(),
    zuVeranstaltung: (String) -> Unit,
) {
    if (liste.isEmpty()) {
        // Derselbe Satz wie auf Start und im Web (U76).
        Leerzustand("Keine Neuigkeiten.")
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        for (gruppe in Startseite.groupNotifications(liste, jetzt)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Kicker(gruppe.label, Modifier.semantics { heading() })
                Column(
                    Modifier
                        .fillMaxWidth()
                        .karte(padding = 0.dp),
                ) {
                    gruppe.items.forEachIndexed { i, n ->
                        if (i > 0) Trennlinie()
                        NachrichtZeile(
                            n = n,
                            neu = n.readAt == null && !alleGesehen,
                            jetzt = jetzt,
                            hervorheben = true,
                            zuVeranstaltung = zuVeranstaltung,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Eine Nachricht: Symbol, Titel, Zeit, Text, ggf. "Zur Veranstaltung ›".
 *
 * @param hervorheben Auf der Liste liegt Neues auf goldSoft; auf Home nur das Symbol.
 */
@Composable
fun NachrichtZeile(
    n: Benachrichtigung,
    neu: Boolean,
    jetzt: Instant,
    hervorheben: Boolean = true,
    zeilen: Int? = null,
    zuVeranstaltung: (String) -> Unit,
) {
    val f = TcmTheme.farben
    val ziel = Startseite.notificationZiel(n.eventId)
    val label = HomeLogik.nachrichtLabel(n, neu, jetzt)
    val symbolGrund = when {
        hervorheben -> if (neu) f.surf else f.surf2
        else -> if (neu) f.goldSoft else f.surf2
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (hervorheben && neu) f.goldSoft else Color.Transparent)
            .then(if (ziel != null) Modifier.clickable(role = Role.Button) { zuVeranstaltung(ziel.eventId) } else Modifier)
            .clearAndSetSemantics {
                contentDescription = if (ziel != null) "$label. Öffnet die Veranstaltung" else label
                if (ziel != null) {
                    role = Role.Button
                    onClick { zuVeranstaltung(ziel.eventId); true }
                }
            }
            .padding(vertical = 14.dp, horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(symbolGrund),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                symbolBild(if (hervorheben) Startseite.notificationSymbol(n.kind ?: "") else NotificationSymbol.GLOCKE),
                contentDescription = null,
                tint = if (neu) f.ink else f.ink2,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val titel = @Composable { breite: Modifier ->
                Text(
                    n.title ?: "",
                    style = TcmSchrift.text(Schrift.gewichtFett, 15.sp).mitTrennung(),
                    color = f.ink,
                    maxLines = if (zeilen != null) 2 else Int.MAX_VALUE,
                    overflow = TextOverflow.Ellipsis,
                    modifier = breite,
                )
            }
            val zeit = @Composable {
                Text(
                    Startseite.relativeTimeLabel(n.createdAt, jetzt),
                    style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
                    color = f.muted,
                )
            }
            // Bei grosser Schrift steht die Zeit unter dem Titel, sonst bricht er mitten im Wort.
            if (grosseSchrift()) {
                titel(Modifier)
                zeit()
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    titel(Modifier.weight(1f))
                    zeit()
                }
            }
            Text(
                n.body ?: "",
                style = TcmSchrift.text(Schrift.gewichtNormal, 13.5.sp).copy(lineHeight = 19.sp),
                color = f.ink2,
                maxLines = zeilen ?: Int.MAX_VALUE,
                overflow = TextOverflow.Ellipsis,
            )
            if (ziel != null) {
                Text(
                    "Zur Veranstaltung ›",
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.5.sp),
                    color = f.blueInk,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
