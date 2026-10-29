/**
 * Belegungsplan und Buchungsblatt
 *
 * Portierung aus packages/core/src: courtStatus.ts (courtStatusAt),
 * freeSlots.ts (freeSlotsOfDay, freeGaps, startInGap, occupancyLabel),
 * home.ts (blockingLabel) und booking.ts (bookingActions, checkPlayers,
 * missingPlayers, otherPlayersLabel, umsetzZiele). Gerechnet wird in
 * Europe/Berlin (Zeit). Gepruefte Faelle: packages/core/golden/<funktion>.json
 * (KernGoldenTests).
 *
 * Wie ueberall gilt: Durchgesetzt werden die Regeln nur in den RPCs. Die App
 * blendet nur aus, was die Datenbank ohnehin ablehnen wuerde.
 */

import Foundation

/// Eine Belegung mit allem, was Status und Beschriftung brauchen (CourtSlot).
protocol PlanSlot: BelegterSlot, Belegungsmerkmale {
    var title: String? { get }
    var typeName: String? { get }
    var ownerName: String? { get }
}

/// Eine Belegung mit Kennung - fuers Umsetzen (UmsetzBuchung).
protocol BuchungsSlot: BelegterSlot {
    var bookingId: String { get }
}

enum CourtStatusKind: String, Sendable, Codable {
    case frei, eigen, sucht, belegt, serie, gesperrt
    /// Um diese Zeit ist nichts, aber eine volle Stunde passt nicht mehr hinein.
    case knapp
    /// Die Zeit ist schon vorbei.
    case vorbei
    /// Eine volle Stunde endete nach Schluss.
    case schluss
    /// Liegt hinter dem Buchungsvorlauf, ist also noch nicht buchbar.
    case vorlauf
}

struct CourtStatus<T> {
    let art: CourtStatusKind
    let text: String
    /// Die Belegung, um die es geht - zum Oeffnen im Blatt.
    var belegung: T?
}

struct FreeSlotRow<T> {
    /// Startzeit in Minuten seit Mitternacht
    let minute: Int
    /// Ein Eintrag je Platz, in der Reihenfolge der courtIds
    let courts: [(courtId: String, status: CourtStatus<T>)]
    /// Wie viele Plaetze zu dieser Zeit frei sind
    let free: Int
}

struct FreeGap: Equatable, Sendable {
    let courtId: String
    /// Fruehester Beginn im Raster, der canStartAt besteht
    var from: Int
    /// Beginn der naechsten Belegung, sonst Schluss
    var until: Int
}

struct OccupancyLabel: Equatable, Sendable {
    let art: TimelineKind
    /// Erste Zeile im Block, fett
    let title: String
    /// Zweite Zeile
    let detail: String
    /// Fuer VoiceOver, ohne Platz
    let spoken: String
}

/// Was der Betrachter an einer Buchung tun darf.
struct BookingActions: Equatable, Sendable {
    /// Stornieren (cancel_booking)
    let cancel: Bool
    /// Mitspieler aendern (update_booking_players)
    let editPlayers: Bool
    /// Sich als Mitspieler austragen (leave_booking)
    let leave: Bool
    /// Sich als Mitspieler eintragen (join_booking)
    let join: Bool
}

/// Eine Spielform, wie die Besetzungsregeln sie brauchen (BookingTypeInfo).
struct BookingTypeInfo: Equatable, Sendable {
    let code: String
    let name: String
    let durationMinutes: Int
    let minPlayers: Int
    let maxPlayers: Int
    let requiresPartner: Bool
}

struct UmsetzZiel: Equatable, Sendable {
    let courtId: String
    /// Startzeit in Minuten seit Mitternacht (Berlin)
    let minute: Int
}

enum Platzplan {
    // MARK: - courtStatus.ts

    /// Was ist auf einem Platz zu dieser Minute los? Die Statuszeile der Freien Zeiten.
    static func courtStatusAt<T: PlanSlot>(
        day: String,
        courtId: String,
        minute: Int,
        durationMinutes: Int,
        closingMinutes: Int,
        occupied: [T],
        leadDays: Int? = nil,
        now: Date = Date()
    ) -> CourtStatus<T> {
        let eigene = occupied
            .filter { $0.courtId == courtId }
            .enumerated()
            .sorted { $0.element.startsAt != $1.element.startsAt ? $0.element.startsAt < $1.element.startsAt : $0.offset < $1.offset }
            .map(\.element)

        // Liegt zu dieser Minute etwas auf dem Platz?
        if let da = eigene.first(where: { Zeit.minutesOf($0.startsAt) <= minute && Zeit.minutesOf($0.endsAt) > minute }) {
            return beschreibe(da)
        }

        let frei = Belegung.canStartAt(
            day: day, courtId: courtId, minute: minute, durationMinutes: durationMinutes,
            closingMinutes: closingMinutes, occupied: occupied, leadDays: leadDays, now: now
        )
        if frei {
            let naechste = eigene.first { Zeit.minutesOf($0.startsAt) >= minute }
            let bis = naechste.map { Zeit.minutesOf($0.startsAt) } ?? closingMinutes
            return CourtStatus(
                art: .frei,
                text: bis >= closingMinutes
                    ? "frei bis \(Zeit.minutesToTime(closingMinutes))"
                    : "frei \(Zeit.minutesToTime(minute)) – \(Zeit.minutesToTime(bis))"
            )
        }

        let beginn = Zeit.berlinTime(day: day, minutes: minute)
        if beginn < now { return CourtStatus(art: .vorbei, text: "vorbei") }
        if minute + durationMinutes > closingMinutes {
            return CourtStatus(art: .schluss, text: "Schluss um \(Zeit.minutesToTime(closingMinutes))")
        }
        if let leadDays, beginn > Belegung.latestStart(leadDays: leadDays, now: now) {
            // Frei wird die Zeit, sobald sie in den Vorlauf rutscht - am letzten
            // Vorlauftag also heute zur genannten Uhrzeit.
            let ab = beginn.addingTimeInterval(TimeInterval(-leadDays * 86_400))
            return CourtStatus(
                art: .vorlauf,
                text: Zeit.berlinDay(ab) == Zeit.berlinDay(now)
                    ? "buchbar ab \(Zeit.minutesToTime(Zeit.localMinutes(ab)))"
                    : "noch nicht buchbar"
            )
        }
        let gleichDanach = eigene.first {
            Zeit.minutesOf($0.startsAt) > minute && Zeit.minutesOf($0.startsAt) < minute + durationMinutes
        }
        guard let gleichDanach else { return CourtStatus(art: .knapp, text: "nicht frei") }
        return CourtStatus(
            art: .knapp,
            text: "belegt ab \(Zeit.minutesToTime(Zeit.minutesOf(gleichDanach.startsAt)))",
            belegung: gleichDanach
        )
    }

    private static func beschreibe<T: PlanSlot>(_ b: T) -> CourtStatus<T> {
        let von = Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))
        let bis = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
        switch Startseite.occupancyKind(b) {
        case .gesperrt:
            let l = blockingLabel(title: b.title, typeName: b.typeName)
            return CourtStatus(art: .gesperrt, text: "gesperrt · \(l.grund.map { "\(l.kategorie), \($0)" } ?? l.kategorie)", belegung: b)
        case .serie:
            return CourtStatus(art: .serie, text: "\(nichtLeer(b.title) ?? b.typeName ?? "Serie") bis \(bis)", belegung: b)
        case .eigen:
            return CourtStatus(art: .eigen, text: "Deine Buchung · \(von)", belegung: b)
        case .sucht:
            return CourtStatus(art: .sucht, text: "\(b.typeName ?? "Spiel") sucht \(b.frei ?? 1) · \(von)", belegung: b)
        case .belegt:
            return CourtStatus(art: .belegt, text: "belegt bis \(bis)", belegung: b)
        }
    }

    // MARK: - freeSlots.ts

    /**
     * Die Startzeiten eines Tages mit dem Status jedes Platzes (Freie Zeiten).
     * Heute zuerst die naechste Startzeit im Raster, danach volle Stunden bis
     * Schluss minus Dauer; an einem kommenden Tag ab der Oeffnung.
     */
    static func freeSlotsOfDay<T: PlanSlot>(
        day: String,
        courtIds: [String],
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: [T],
        stepMinutes: Int = 60,
        leadDays: Int? = nil,
        now: Date = Date()
    ) -> [FreeSlotRow<T>] {
        let letzte = closingMinutes - durationMinutes

        // Liegt der Schluss schon hinter uns, gibt es nichts mehr zu buchen.
        if Zeit.berlinTime(day: day, minutes: closingMinutes) <= now { return [] }

        let heute = Zeit.berlinTime(day: day, minutes: 0) <= now
        let erste = heute
            ? Belegung.nextSlotMinute(openingMinutes: openingMinutes, slotMinutes: slotMinutes, now: now)
            : openingMinutes

        var minuten: [Int] = []
        if erste <= letzte { minuten.append(erste) }
        var m = Int((Double(erste) / Double(stepMinutes)).rounded(.down)) * stepMinutes + stepMinutes
        while m <= letzte {
            minuten.append(m)
            m += stepMinutes
        }

        return minuten.map { minute in
            let courts = courtIds.map { courtId in
                (courtId: courtId, status: courtStatusAt(
                    day: day, courtId: courtId, minute: minute, durationMinutes: durationMinutes,
                    closingMinutes: closingMinutes, occupied: occupied, leadDays: leadDays, now: now
                ))
            }
            return FreeSlotRow(minute: minute, courts: courts, free: courts.filter { $0.status.art == .frei }.count)
        }
    }

    /**
     * Die freien Flaechen eines Platzes, in die eine volle Buchung passt - im
     * Raster die Stellen, die sich antippen lassen.
     */
    static func freeGaps<T: BelegterSlot>(
        day: String,
        courtId: String,
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: [T],
        leadDays: Int? = nil,
        now: Date = Date()
    ) -> [FreeGap] {
        var out: [FreeGap] = []
        var m = openingMinutes
        while m + durationMinutes <= closingMinutes {
            let frei = Belegung.canStartAt(
                day: day, courtId: courtId, minute: m, durationMinutes: durationMinutes,
                closingMinutes: closingMinutes, occupied: occupied, leadDays: leadDays, now: now
            )
            if frei {
                if let letzte = out.last, m <= letzte.until - durationMinutes + slotMinutes {
                    out[out.count - 1].until = max(letzte.until, m + durationMinutes)
                } else {
                    out.append(FreeGap(courtId: courtId, from: m, until: m + durationMinutes))
                }
            }
            m += slotMinutes
        }

        // Bis zur naechsten Belegung oder zum Schluss verlaengern - nicht aber
        // ueber den Vorlauf hinaus: dahinter laesst sich nichts antippen.
        let grenze = leadDays.map { Belegung.latestStart(leadDays: $0, now: now) }
        for i in out.indices {
            if let grenze, Zeit.berlinTime(day: day, minutes: out[i].until - durationMinutes + slotMinutes) > grenze {
                continue
            }
            let naechste = occupied
                .filter { $0.courtId == courtId && Zeit.minutesOf($0.startsAt) >= out[i].until }
                .map { Zeit.minutesOf($0.startsAt) }
            out[i].until = ([closingMinutes] + naechste).min()!
        }
        return out
    }

    /// Die Startzeit fuer eine angetippte Minute: aufs Raster abgerundet, mit Platz fuer die volle Dauer.
    static func startInGap(_ gap: FreeGap, minute: Int, slotMinutes: Int, durationMinutes: Int) -> Int {
        let spaetestens = gap.from + abrunden(gap.until - durationMinutes - gap.from, slotMinutes) * slotMinutes
        let gerastert = gap.from + abrunden(minute - gap.from, slotMinutes) * slotMinutes
        return min(spaetestens, max(gap.from, gerastert))
    }

    /// Math.floor(a / b) - auch fuer negative a.
    private static func abrunden(_ a: Int, _ b: Int) -> Int {
        Int((Double(a) / Double(b)).rounded(.down))
    }

    /**
     * Wie eine Belegung im Raster beschriftet ist: "Du / Einzel",
     * "[Name] / Doppel", "sucht 2 / Doppel", "Training / bis 19:00",
     * "Platzpflege / Grund".
     */
    static func occupancyLabel(_ b: some PlanSlot) -> OccupancyLabel {
        let von = Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))
        let bis = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
        let art = Startseite.occupancyKind(b)
        let typ = b.typeName ?? "Spiel"
        let zeit = "\(von) bis \(bis) Uhr"

        switch art {
        case .eigen:
            return OccupancyLabel(art: art, title: "Du", detail: typ, spoken: "\(zeit), deine Buchung, \(typ)")
        case .sucht:
            let frei = b.frei ?? 1
            return OccupancyLabel(art: art, title: "sucht \(frei)", detail: typ, spoken: "\(zeit), \(typ) sucht noch \(frei) Mitspieler")
        case .serie:
            let name = nichtLeer(b.title) ?? b.typeName ?? "Serie"
            return OccupancyLabel(art: art, title: name, detail: "bis \(bis)", spoken: "\(zeit), \(name)")
        case .gesperrt:
            let l = blockingLabel(title: b.title, typeName: b.typeName)
            return OccupancyLabel(
                art: art, title: l.kategorie, detail: l.grund ?? "",
                spoken: "\(zeit), gesperrt, \(l.kategorie)\(l.grund.map { ", \($0)" } ?? "")"
            )
        case .belegt:
            let wer = nichtLeer(b.ownerName) ?? "belegt"
            return OccupancyLabel(art: art, title: wer, detail: typ, spoken: "\(zeit), belegt von \(wer), \(typ)")
        }
    }

    // MARK: - home.ts

    /// Kategorie und Grund einer Sperrung; der Grund ist freiwillig.
    static func blockingLabel(title: String?, typeName: String?) -> (kategorie: String, grund: String?) {
        (kategorie: nichtLeer(typeName) ?? "Gesperrt", grund: nichtLeer(title))
    }

    /// Getrimmt, leer wird nil (wie `x?.trim() || …` in TypeScript).
    static func nichtLeer(_ text: String?) -> String? {
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }

    // MARK: - booking.ts

    /**
     * Welche Knoepfe eine Buchung bekommt - abgelesen aus den RPCs. Begonnen
     * ist eine Buchung ab ihrem Beginn; danach duerfen nur noch Platzrechte
     * stornieren und die Besetzung aendern.
     */
    static func bookingActions(
        startsAt: String,
        own: Bool,
        joined: Bool? = nil,
        partnerWanted: Bool? = nil,
        free: Int? = nil,
        managesCourts: Bool? = nil,
        now: Date = Date()
    ) -> BookingActions {
        let beginn = Zeit.datum(startsAt) ?? .distantPast
        let begonnen = beginn <= now
        let platzrechte = managesCourts == true
        let verwalten = (own || platzrechte) && (!begonnen || platzrechte)
        return BookingActions(
            cancel: verwalten,
            editPlayers: verwalten,
            leave: !own && joined == true && !begonnen,
            join: !own && joined != true && partnerWanted == true && (free ?? 0) > 0 && !begonnen
        )
    }

    /// Wie viele Mitspieler fehlen noch bis zur Untergrenze? Der Bucher zaehlt mit.
    static func missingPlayers(_ type: BookingTypeInfo, memberCount: Int, guestCount: Int) -> Int {
        let gesamt = 1 + memberCount + guestCount
        return max(mindestens(type) - gesamt, 0)
    }

    private static func mindestens(_ type: BookingTypeInfo) -> Int {
        max(type.minPlayers, type.requiresPartner ? 2 : 1)
    }

    /// "1 weitere Person", "2–3 weitere Personen", "bis zu 3 weitere Personen"
    static func otherPlayersLabel(_ type: BookingTypeInfo) -> String {
        let bis = type.maxPlayers - 1
        guard bis > 0 else { return "" }
        let von = min(mindestens(type) - 1, bis)
        let zahl = von == bis ? "\(bis)" : von == 0 ? "bis zu \(bis)" : "\(von)–\(bis)"
        return "\(zahl) \(bis == 1 ? "weitere Person" : "weitere Personen")"
    }

    /**
     * Passt die Besetzung zur Spielform? Dieselben Grenzen wie create_booking:
     * wer Mitspieler sucht, darf unterbesetzt buchen. nil heisst: passt.
     */
    static func checkPlayers(_ type: BookingTypeInfo, memberCount: Int, guestCount: Int, partnerWanted: Bool = false) -> String? {
        let gesamt = 1 + memberCount + guestCount
        let fehlen = partnerWanted ? 0 : missingPlayers(type, memberCount: memberCount, guestCount: guestCount)
        if fehlen > 0 {
            let rest = fehlen == 1 ? "es fehlt noch ein Mitspieler" : "es fehlen noch \(fehlen) Mitspieler"
            return "„\(type.name)“ braucht mindestens \(mindestens(type)) Spieler – \(rest)."
        }
        if gesamt > type.maxPlayers {
            return "„\(type.name)“ erlaubt höchstens \(type.maxPlayers) Spieler."
        }
        return nil
    }

    /**
     * Wohin laesst sich eine Buchung umsetzen? Dieselbe Frei-Regel wie
     * canStartAt, ohne die Buchung selbst; die Dauer bleibt. Eine laufende
     * Buchung wechselt nur den Platz, eine vergangene hat keine Ziele. Den
     * Buchungsvorlauf gibt es beim Umsetzen nicht.
     */
    static func umsetzZiele<B: BuchungsSlot, T: BuchungsSlot>(
        booking: B,
        day: String,
        courtIds: [String],
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        occupied: [T],
        now: Date = Date()
    ) -> [UmsetzZiel] {
        guard let beginn = Zeit.datum(booking.startsAt), let ende = Zeit.datum(booking.endsAt), ende > now else { return [] }

        let dauer = jsRound(ende.timeIntervalSince(beginn) / 60)
        let andere = occupied.filter { $0.bookingId != booking.bookingId }
        var out: [UmsetzZiel] = []

        if beginn <= now {
            guard day == Zeit.berlinDay(beginn) else { return [] }
            let minute = Zeit.minutesOf(booking.startsAt)
            for courtId in courtIds where courtId != booking.courtId {
                // Die Zeit steht schon fest: nur ob der Platz frei ist.
                let frei = Belegung.canStartAt(
                    day: day, courtId: courtId, minute: minute, durationMinutes: dauer,
                    closingMinutes: Int.max / 2, occupied: andere, now: beginn
                )
                if frei { out.append(UmsetzZiel(courtId: courtId, minute: minute)) }
            }
            return out
        }

        // Das Raster zaehlt wie in der Datenbank ab Mitternacht, nicht ab Oeffnung.
        let erste = Int((Double(openingMinutes) / Double(slotMinutes)).rounded(.up)) * slotMinutes
        for courtId in courtIds {
            var minute = erste
            while minute + dauer <= closingMinutes {
                let dortSchon = courtId == booking.courtId && Zeit.berlinTime(day: day, minutes: minute) == beginn
                if !dortSchon {
                    let frei = Belegung.canStartAt(
                        day: day, courtId: courtId, minute: minute, durationMinutes: dauer,
                        closingMinutes: closingMinutes, occupied: andere, now: now
                    )
                    if frei { out.append(UmsetzZiel(courtId: courtId, minute: minute)) }
                }
                minute += slotMinutes
            }
        }
        return out
    }

    // MARK: - apps/mobile/src/lib/plan.ts

    /**
     * Beginn und Ende einer Sperrung in Minuten des Tages, an dem sie beginnt.
     * Endet sie um Mitternacht oder spaeter, steht das Ende auf 24:00.
     */
    static func sperrZeit(_ b: some Zeitraum) -> (von: Int, bis: Int) {
        let von = Zeit.minutesOf(b.startsAt)
        let dauer = (Zeit.datum(b.endsAt) ?? .distantPast).timeIntervalSince(Zeit.datum(b.startsAt) ?? .distantPast) / 60
        return (von, min(von + jsRound(dauer), 24 * 60))
    }
}
