/*
 * Platzhalter fuer Bildschirme, die ihre Spur noch baut
 *
 * Grosser Titel wie auf iOS (Seitentitel aus den Tokens), darunter ein Satz.
 * Zeichnet unter der Statusleiste hindurch und haelt Abstand zu ihr
 * (Edge-to-Edge); die Tab-Leiste haelt HauptTabs frei.
 */

package de.tcmuckensturm.app.bildschirme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift

@Composable
fun Platzhalter(titel: String, text: String, mehr: @Composable ColumnScope.() -> Unit = {}) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxSize()
            .background(f.bg)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(horizontal = Abstand.rand, vertical = Abstand.abschnitt),
        verticalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Text(
            titel,
            style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.seitentitel, Schrift.laufweiteTitel),
            color = f.ink,
            modifier = Modifier.semantics { heading() },
        )
        Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp), color = f.ink2)
        mehr()
    }
}
