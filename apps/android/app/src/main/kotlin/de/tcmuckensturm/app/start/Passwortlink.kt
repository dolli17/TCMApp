/*
 * Was der Link aus der E-Mail mitbringt
 *
 * Entspricht apps/mobile/src/lib/passwortlink.ts und App/Passwortlink.swift
 * der iOS-App. Einladung und "Passwort vergessen" kommen als
 * ?token_hash=…&type=… an (siehe supabase/templates). Die App loest den Hash
 * selbst mit verifyEmailOtp ein.
 *
 * Uebergang: Solange die Cloud-Vorlagen noch {{ .ConfirmationURL }} schicken,
 * kommt die fertige Sitzung im Fragment (#access_token=…&refresh_token=…).
 * Die nimmt die App vorerst weiter an, genau wie Expo-App, iOS und Web. Einen
 * solchen Link kann aber jeder mit seinem eigenen Konto bauen und einem
 * anderen unterschieben (Login-CSRF, Befund S20) - deshalb die Rueckfrage in
 * PasswortAblauf. Sobald die Cloud-Vorlagen umgestellt sind, faellt der Zweig
 * ueberall gemeinsam weg (docs/goLive.md).
 *
 * Der Link kommt als App Link (https://app.…/passwort-setzen,
 * https://dev.…/passwort-setzen) oder ueber das eigene Schema
 * (tcm://passwort-setzen, tcmdev://, tcmlokal://). Reines Kotlin mit
 * java.net.URI, damit es ohne Geraet testbar ist.
 */

package de.tcmuckensturm.app.start

import java.net.URI
import java.net.URLDecoder
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** Nur diese beiden Mails fuehren nach passwort-setzen. */
enum class LinkTyp(val wert: String) {
    INVITE("invite"),
    RECOVERY("recovery"),
}

sealed interface LinkInhalt {
    data class Token(val tokenHash: String, val typ: LinkTyp) : LinkInhalt
    data class Fragment(val accessToken: String, val refreshToken: String) : LinkInhalt
    data object Ungueltig : LinkInhalt
    data object Ohne : LinkInhalt
}

object Passwortlink {
    /** Die Webadressen, unter denen die App App Links annimmt (wie im Manifest). */
    val hosts = setOf("app.tennisclub-muckensturm.de", "dev.tennisclub-muckensturm.de")

    /** Die eigenen Schemata aller Varianten (prod, dev, lokal). */
    val schemata = setOf("tcm", "tcmdev", "tcmlokal")

    const val PFAD = "passwort-setzen"

    private fun uri(adresse: String): URI? = runCatching { URI(adresse.trim()) }.getOrNull()

    /**
     * Ist das ein Link nach passwort-setzen? Andere Adressen (spaeter etwa
     * Buchungen) gehen die Passwort-Behandlung nichts an.
     */
    fun istPasswortLink(adresse: String): Boolean = uri(adresse)?.let(::istPasswortLink) ?: false

    private fun istPasswortLink(uri: URI): Boolean {
        val schema = uri.scheme?.lowercase() ?: return false
        val teile = (uri.rawPath ?: "").split("/").filter { it.isNotEmpty() }
        if (schema == "https") {
            val host = uri.host?.lowercase() ?: return false
            return host in hosts && teile == listOf(PFAD)
        }
        if (schema !in schemata) return false
        // tcm://passwort-setzen (Host) oder tcm:///passwort-setzen (Pfad)
        val host = uri.host
        if (!host.isNullOrEmpty()) return host == PFAD && teile.isEmpty()
        return teile == listOf(PFAD)
    }

    /** Wertet einen Link aus. null, wenn er nicht nach passwort-setzen fuehrt. */
    fun auswerten(adresse: String): LinkInhalt? {
        val uri = uri(adresse) ?: return null
        if (!istPasswortLink(uri)) return null
        return auswerten(abfrage = parameter(uri.rawQuery), fragment = parameter(uri.rawFragment))
    }

    /** Der Kern, ohne Adresse - dieselben Faelle wie linkAuswerten in passwortlink.ts. */
    fun auswerten(abfrage: Map<String, String>, fragment: Map<String, String>): LinkInhalt {
        val tokenHash = abfrage["token_hash"]
        if (!tokenHash.isNullOrEmpty()) {
            val typ = LinkTyp.entries.firstOrNull { it.wert == abfrage["type"] } ?: return LinkInhalt.Ungueltig
            return LinkInhalt.Token(tokenHash, typ)
        }

        val access = fragment["access_token"]
        val refresh = fragment["refresh_token"]
        if (!access.isNullOrEmpty() && !refresh.isNullOrEmpty()) return LinkInhalt.Fragment(access, refresh)

        // Supabase meldet Fehler wie einen abgelaufenen Link als Abfrage oder im Fragment.
        if ("error" in abfrage || "error_code" in abfrage || "error" in fragment) return LinkInhalt.Ungueltig
        return LinkInhalt.Ohne
    }

    /**
     * Zerlegt "a=1&b=2" wie URLSearchParams: "+" ist ein Leerzeichen, %xx wird
     * dekodiert, bei doppelten Namen gilt der erste.
     */
    fun parameter(roh: String?): Map<String, String> {
        if (roh.isNullOrEmpty()) return emptyMap()
        val ergebnis = LinkedHashMap<String, String>()
        for (paar in roh.split("&")) {
            if (paar.isEmpty()) continue
            val teile = paar.split("=", limit = 2)
            val name = dekodiert(teile[0])
            val wert = if (teile.size > 1) dekodiert(teile[1]) else ""
            ergebnis.putIfAbsent(name, wert)
        }
        return ergebnis
    }

    private fun dekodiert(teil: String): String =
        runCatching { URLDecoder.decode(teil, "UTF-8") }.getOrElse { teil.replace('+', ' ') }

    /**
     * Die Nutzer-ID (sub) aus einem Access Token, ungeprueft - nur um zu
     * sehen, ob ein Fragment-Link zum schon angemeldeten Konto gehoert. Ob das
     * Token gilt, entscheidet erst Supabase beim Einloesen.
     */
    fun nutzerIdAusToken(token: String): String? {
        val teile = token.split(".")
        if (teile.size != 3) return null
        return runCatching {
            val inhalt = String(Base64.getUrlDecoder().decode(teile[1]), Charsets.UTF_8)
            val sub = Json.parseToJsonElement(inhalt).jsonObject["sub"] as? JsonPrimitive
            sub?.takeIf { it.isString && it.content.isNotEmpty() }?.content?.lowercase()
        }.getOrNull()
    }
}
