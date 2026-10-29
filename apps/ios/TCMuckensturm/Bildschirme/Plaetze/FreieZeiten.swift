/**
 * Freie Zeiten (apps/mobile/src/components/plaetze/FreieZeiten.tsx)
 *
 * Eine Zeile je Startzeit mit einem Kaestchen je Platz und "n frei".
 * Antippen klappt die Zeile auf: freie Plaetze als grosse Knoepfe, Spiele,
 * die Mitspieler suchen, die eigene Buchung und - mit Platzrechten -
 * Sperrungen. Immer nur eine Zeile offen. Die Zeilen rechnet der Kern
 * (freeSlotsOfDay, also courtStatusAt und canStartAt).
 *
 * Grosse Systemschrift (U52): ab Accessibility-Groessen fallen die Kaestchen
 * weg und es bleibt "n frei".
 */

import SwiftUI

struct FreieZeiten: View {
    @Environment(\.dynamicTypeSize) private var schriftgroesse
    let modell: PlaetzeModell
    @State private var offen: Int?

    var body: some View {
        let m = modell
        TimelineView(.everyMinute) { kontext in
            let zeilen = Platzplan.freeSlotsOfDay(
                day: m.datum, courtIds: m.plaetze.map(\.id), openingMinutes: m.oeffnung, closingMinutes: m.schluss,
                slotMinutes: m.raster, durationMinutes: m.dauer, occupied: m.belegung, leadDays: m.vorlauf, now: kontext.date
            )
            // Ohne Plaetze (noch nicht geladen) stuende ueberall "voll".
            if m.plaetze.isEmpty {
                EmptyView()
            } else if zeilen.isEmpty {
                let tage = m.tage
                let i = tage.firstIndex(of: m.datum) ?? -1
                Leerzustand(
                    text: "An diesem Tag lässt sich keine Stunde mehr buchen.",
                    handlung: i >= 0 && i < tage.count - 1 ? ("Nächster Tag", { m.waehleTag(tage[i + 1]) }) : nil
                )
            } else {
                tabelle(m, zeilen: zeilen)
            }
        }
        // Nach dem Buchen klappt die Zeile zu; die neue Buchung leuchtet in ihr kurz auf.
        .onChange(of: m.markiert) { _, neu in if neu != nil { offen = nil } }
        .onChange(of: m.datum) { offen = nil }
    }

    private var gross: Bool { schriftgroesse.isAccessibilitySize }

    private func tabelle(_ m: PlaetzeModell, zeilen: [FreeSlotRow<TagesBelegung>]) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text("BEGINN").modifier(KopfStil()).frame(minWidth: 64, alignment: .leading)
                if !gross {
                    HStack(spacing: 4) {
                        ForEach(m.plaetze) { p in
                            Text(PlaetzeLogik.platzNummer(name: p.name, kurz: p.shortName))
                                .modifier(KopfStil())
                                .dynamicTypeSize(.large)
                                .frame(width: 18)
                        }
                    }
                }
                Spacer(minLength: 8)
                Text("FREI").modifier(KopfStil())
            }
            .padding(.leading, 16)
            .padding(.trailing, 12)
            .frame(minHeight: 40)
            .accessibilityHidden(true)
            Farbe.line2.frame(height: 1)

            ForEach(Array(zeilen.enumerated()), id: \.element.minute) { i, z in
                zeile(m, z)
                if i < zeilen.count - 1 { Farbe.line.frame(height: 1) }
            }
        }
        .background(Farbe.surf)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Farbe.line, lineWidth: 1))
    }

    private func zeile(_ m: PlaetzeModell, _ z: FreeSlotRow<TagesBelegung>) -> some View {
        let istOffen = offen == z.minute
        let sucht = z.courts.filter { $0.status.art == .sucht && $0.status.belegung?.binDabei != true }
        let eigen = z.courts.filter { $0.status.art == .eigen }
        let frei = z.courts.filter { $0.status.art == .frei }
        let gesperrt = z.courts.filter { c in
            c.status.art == .gesperrt && c.status.belegung.map { m.oeffnebar($0) } == true
        }
        let name = { (id: String) in m.platz(id)?.name ?? "" }
        let label = (
            ["\(Zeit.minutesToTime(z.minute)) Uhr", PlaetzeLogik.freiLabel(z.free)]
                + sucht.map { "\(name($0.courtId)) sucht Mitspieler" }
                + eigen.map { "du spielst auf \(name($0.courtId))" }
        ).joined(separator: ", ")
        // Die Zeile, in der die gerade gebuchte oder geaenderte Belegung beginnt
        let neu = z.courts.contains { c in
            guard let b = c.status.belegung else { return false }
            return m.markiert?.trifft(b) == true && Zeit.minutesOf(b.startsAt) == z.minute
        }

        return VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.snappy) { offen = istOffen ? nil : z.minute } } label: {
                HStack(spacing: 0) {
                    Text(Zeit.minutesToTime(z.minute))
                        .font(Schrift.display(.fett, 22))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink)
                        .padding(.trailing, 8)
                        .frame(minWidth: 64, alignment: .leading)
                    if !gross {
                        HStack(spacing: 4) {
                            ForEach(z.courts, id: \.courtId) { c in Kaestchen(art: c.status.art) }
                        }
                    }
                    Spacer(minLength: 8)
                    Text(PlaetzeLogik.freiText(z.free))
                        .font(Schrift.text(.fett, 14))
                        .foregroundStyle(z.free >= 3 ? Farbe.greenInk : z.free > 0 ? Farbe.ink : Farbe.muted)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Farbe.muted)
                        .rotationEffect(.degrees(istOffen ? 90 : 0))
                        .padding(.leading, 6)
                }
                .padding(.leading, 16)
                .padding(.trailing, 12)
                .frame(minHeight: 60)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityValue(istOffen ? "aufgeklappt" : "zugeklappt")

            if istOffen {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(Zeit.minutesToTime(z.minute)) – \(Zeit.minutesToTime(z.minute + m.dauer)) · \(frei.isEmpty ? "Kein Platz frei" : "Welcher Platz?")")
                        .font(Schrift.text(.mittel, 13))
                        .foregroundStyle(Farbe.ink2)
                        .padding(.bottom, 2)

                    if !frei.isEmpty {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                            ForEach(frei, id: \.courtId) { c in
                                if let p = m.platz(c.courtId) {
                                    Button { m.buchenAuf(p, minute: z.minute) } label: {
                                        Text(p.name ?? "")
                                            .font(Schrift.text(.extrafett, 15))
                                            // greenInk: bg auf green hielt hell nur 3,1:1 (U15)
                                            .foregroundStyle(Farbe.bg)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                            .frame(maxWidth: .infinity, minHeight: 48)
                                            .background(Farbe.greenInk, in: RoundedRectangle(cornerRadius: 14))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("\(p.name ?? "") um \(Zeit.minutesToTime(z.minute)) Uhr buchen")
                                }
                            }
                        }
                    }

                    ForEach(sucht, id: \.courtId) { c in
                        if let b = c.status.belegung {
                            let typ = b.typeName ?? "Spiel"
                            Button { m.oeffne(b) } label: {
                                HStack {
                                    Text("\(name(c.courtId)) · \(typ) sucht noch \(b.frei ?? 1)")
                                    Spacer(minLength: 8)
                                    Text("Mitspielen")
                                }
                                .font(Schrift.text(.fett, 14.5))
                                .foregroundStyle(Farbe.goldInk)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 48)
                                .background { BelegungsStil(.sucht).flaeche(RoundedRectangle(cornerRadius: 14)) }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(name(c.courtId)), \(typ) sucht noch \(b.frei ?? 1), mitspielen")
                        }
                    }

                    ForEach(gesperrt, id: \.courtId) { c in
                        if let b = c.status.belegung {
                            Button { m.oeffne(b) } label: {
                                HStack(spacing: 10) {
                                    Text("\(name(c.courtId)) · \(c.status.text)")
                                        .foregroundStyle(Farbe.ink2)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Text("Öffnen").foregroundStyle(Farbe.ink)
                                }
                                .font(Schrift.text(.fett, 14.5))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .frame(minHeight: 48)
                                .background(Farbe.surf3, in: RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(name(c.courtId)), \(c.status.text), öffnen")
                            .accessibilityHint("Sperrung bearbeiten oder aufheben")
                        }
                    }

                    ForEach(eigen, id: \.courtId) { c in
                        if let b = c.status.belegung {
                            Button { m.oeffne(b) } label: {
                                HStack(spacing: 8) {
                                    RoundedRectangle(cornerRadius: 3).fill(Farbe.gold).frame(width: 10, height: 10)
                                    Text("Du spielst um \(Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))) auf \(name(c.courtId))")
                                        .font(Schrift.text(.mittel, 13))
                                        .foregroundStyle(Farbe.ink2)
                                }
                                .frame(minHeight: 32)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Öffnet die Buchung")
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .background(neu ? Farbe.goldSoft : istOffen ? Farbe.surf2 : .clear)
    }
}

private struct KopfStil: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(Schrift.text(.fett, 11))
            .tracking(1.1)
            .foregroundStyle(Farbe.muted)
    }
}

/// Ein Kaestchen je Platz: frei die volle gruene Flaeche, belegt blau mit Rand, alles nicht Buchbare surf3 mit Rand (U74).
private struct Kaestchen: View {
    let art: CourtStatusKind

    var body: some View {
        let form = RoundedRectangle(cornerRadius: 5)
        Group {
            switch art {
            case .frei: form.fill(Farbe.green)
            case .eigen: form.fill(Farbe.gold).overlay(form.strokeBorder(Farbe.goldLine, lineWidth: 1))
            case .belegt: BelegungsStil(.belegt).flaeche(form)
            case .sucht: BelegungsStil(.sucht).flaeche(form)
            default: form.fill(Farbe.surf3).overlay(form.strokeBorder(Farbe.rahmen, lineWidth: 1))
            }
        }
        .frame(width: 18, height: 24)
    }
}

/// Die Legende als eine Zeile unter der Karte; ohne Kaestchen (grosse Schrift) entfaellt sie.
struct FreieZeitenLegende: View {
    @Environment(\.dynamicTypeSize) private var schriftgroesse

    var body: some View {
        if !schriftgroesse.isAccessibilitySize {
            let form = RoundedRectangle(cornerRadius: 3)
            Legende(eintraege: [
                ("frei", AnyView(form.fill(Farbe.green))),
                ("belegt", AnyView(BelegungsStil(.belegt).flaeche(form))),
                ("sucht Mitspieler", AnyView(BelegungsStil(.sucht).flaeche(form))),
                ("du", AnyView(form.fill(Farbe.gold))),
                ("Training, gesperrt", AnyView(form.fill(Farbe.surf3).overlay(form.strokeBorder(Farbe.rahmen, lineWidth: 1)))),
            ], groesse: CGSize(width: 10, height: 14))
        }
    }
}
