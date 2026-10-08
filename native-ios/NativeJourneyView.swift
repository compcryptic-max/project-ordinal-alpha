import SwiftUI
import UIKit

struct NativeJourneyView: View {
    @ObservedObject var world: WorldStore

    private var journey: OrdinalAPI.Journey? { world.state?.journey }
    private var path: OrdinalAPI.CombatPath? { world.state?.path }
    private var testerReport: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
        return "Project Ordinal tester report\nVersion: \(version) (\(build))\niOS: \(UIDevice.current.systemVersion)\nCharacter loaded: \(world.state != nil)\nCombat active: \(world.state?.combat != nil)\nResync required: \(world.requiresResync)\n\nBug title:\nSteps to reproduce:\nExpected:\nActual:\nFrequency:\nDevice model:\nAttachments:"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                DisclosureGroup("First journey · how to play") {
                    Text("Meet Sera in Guild → Sanctuary. Track a signal, inspect the creature, then fight. Guard heavy attacks, build Focus and use your skill. Recover loot, resolve its shrine and equip the weapon in Gear. Follow the next objective for your archive investigation.")
                    Text("Home play works without GPS. Veil is optional: allow Camera, scan a well-lit floor, then aim and hold. Use standard combat if tracking or gestures are unreliable. Permission settings can be changed in iPhone Settings. Reconnect after a lost response before repeating an action.")
                }.padding()
                if let objective = world.state?.nextObjective {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("NEXT OBJECTIVE").font(.caption.monospaced())
                        Text(objective.title).font(.headline)
                        Text(objective.detail)
                        if objective.action == "investigate" {
                            Button("Track signal") { Task { await world.act("investigate") } }
                        } else if objective.action == "home" {
                            Button("Trace archive signal") { Task { await world.act("home", type: "investigate") } }
                        }
                    }
                    .padding()
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                }
                storyCard
                if world.state?.storyDecision != nil {
                    storyDecisionCard
                }
                directiveCard
                callingCard
                specializationCard
                contracts
                recentBeats
                VStack(alignment: .leading, spacing: 8) {
                    Text("Tester report").font(.headline)
                    Text("Share build details and gameplay flags. Add steps and a recording. Credentials and location are excluded.").font(.caption)
                    ShareLink(item: testerReport) { Label("Share bug report template", systemImage: "square.and.arrow.up") }
                }.padding()
            }
            .padding()
        }
        .background(
            LinearGradient(
                colors: [Color(red: 0.025, green: 0.055, blue: 0.05), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .navigationTitle("Journey")
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private var directiveCard: some View {
        if let directive = world.state?.directive {
            VStack(alignment: .leading, spacing: 10) {
                Text("QUEST DIRECTOR · " + directive.regionName.uppercased())
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.cyan)
                Text(directive.title)
                    .font(.headline)
                Text(directive.desc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ProgressView(value: Double(directive.progress), total: Double(max(1, directive.target)))
                    .tint(.cyan)
                Text("\(directive.progress) / \(directive.target) · \(directive.reward)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                HStack {
                    Button(directive.progress >= directive.target ? "Claim directive" : "In progress") {
                        Task { await world.act("directive", choice: "claim") }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan.opacity(0.45))
                    .disabled(directive.progress < directive.target || world.busy)
                    Button(directive.canReroute ? "Reroute" : "Reroute used") {
                        Task { await world.act("directive", choice: "reroute") }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!directive.canReroute || world.busy)
                }
            }
            .padding(14)
            .background(.cyan.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).stroke(.cyan.opacity(0.18)) }
        }
    }

    private var storyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("STORY THREAD")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                        .foregroundStyle(.cyan)
                    Text(journey?.title ?? "Unknown Thread")
                        .font(.title3.bold())
                }
                Spacer()
                Text("CH \(journey?.chapter ?? 1)")
                    .font(.caption.monospaced().bold())
            }

            Text(journey?.hook ?? "")
                .font(.caption)
                .foregroundStyle(.secondary)

            ProgressView(
                value: Double(journey?.progress ?? 0),
                total: Double(max(1, journey?.next ?? 1))
            )
            .tint(.cyan)
        }
        .padding(14)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(.cyan.opacity(0.12))
        }
    }

    @ViewBuilder
    private var storyDecisionCard: some View {
        if let decision = world.state?.storyDecision {
            VStack(alignment: .leading, spacing: 11) {
                Text("THREAD FRACTURE · PERSISTENT CHOICE")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.purple)
                Text(decision.title)
                    .font(.headline)
                Text(decision.prompt)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    ForEach(decision.options) { option in
                        Button {
                            Task { await world.act("story", choice: option.id) }
                        } label: {
                            Text(option.label)
                                .font(.system(size: 8, weight: .bold, design: .monospaced))
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .frame(minHeight: 48)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.purple.opacity(0.38))
                        .disabled(world.busy)
                    }
                }
            }
            .padding(14)
            .background(.purple.opacity(0.055), in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(.purple.opacity(0.20))
            }
        }
    }

    @ViewBuilder
    private var callingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("CALLING")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.purple)
                Spacer()
                Text("TIER \(journey?.callingTier ?? 1)")
                    .font(.caption2.monospaced().bold())
                    .foregroundStyle(.secondary)
            }

            if let id = journey?.calling,
               let calling = world.state?.callingOptions[id] {
                Text(calling.name)
                    .font(.headline)
                Text(calling.desc)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                let target = 8 + (journey?.callingTier ?? 1) * 7
                ProgressView(
                    value: Double(journey?.callingProgress ?? 0),
                    total: Double(max(1, target))
                )
                .tint(.purple)
            } else {
                Text("Choose how the world will learn your name.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Array((world.state?.callingOptions ?? [:]).keys.sorted()), id: \.self) { id in
                    if let option = world.state?.callingOptions[id] {
                        Button {
                            Task { await world.act("calling", id: id) }
                        } label: {
                            VStack(spacing: 3) {
                                Text(option.name.uppercased())
                                    .font(.caption2.monospaced().bold())
                                Text(callingSymbol(id))
                                    .font(.title3)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                        }
                        .buttonStyle(.bordered)
                        .tint(journey?.calling == id ? .purple : .white.opacity(0.18))
                        .disabled(world.busy)
                    }
                }
            }
        }
        .padding(14)
        .background(.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 16))
    }

    private var specializationCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("HIDDEN COMBAT PATH")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.orange)
                Spacer()
                if let spec = path?.specialization {
                    Text(spec.uppercased())
                        .font(.caption.monospaced().bold())
                        .foregroundStyle(.orange)
                } else {
                    Text("UNREAD")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 8) {
                pathBar("STRIKE", path?.attack ?? 0)
                pathBar("GUARD", path?.guardCount ?? 0)
                pathBar("EVADE", path?.evade ?? 0)
                pathBar("SKILL", path?.skill ?? 0)
            }

            if path?.specialization == nil {
                let total = (path?.attack ?? 0) + (path?.guardCount ?? 0) + (path?.evade ?? 0) + (path?.skill ?? 0)
                Text("\(min(total, 25))/25 combat decisions observed")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.orange.opacity(0.035), in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(.orange.opacity(0.12))
        }
    }

    private var contracts: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("FIELD CONTRACTS")
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .foregroundStyle(.cyan)

            ForEach(world.state?.contractList ?? []) { contract in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(contract.name)
                            .font(.subheadline.bold())
                        Text(contract.reward)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 5) {
                        Text("\(min(contract.value, contract.target))/\(contract.target)")
                            .font(.caption.monospaced().bold())
                        if contract.value >= contract.target {
                            Button("CLAIM") {
                                Task { await world.act("contract", id: contract.id) }
                            }
                            .font(.caption2.bold())
                            .buttonStyle(.borderedProminent)
                            .tint(.cyan.opacity(0.55))
                            .disabled(world.busy)
                        }
                    }
                }
                .padding(11)
                .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    @ViewBuilder
    private var recentBeats: some View {
        if let beats = journey?.beats, !beats.isEmpty {
            VStack(alignment: .leading, spacing: 9) {
                Text("THREAD MEMORY")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)

                ForEach(Array(beats.prefix(5).enumerated()), id: \.offset) { _, beat in
                    Text(beat)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func pathBar(_ name: String, _ value: Int) -> some View {
        VStack(spacing: 5) {
            GeometryReader { proxy in
                VStack {
                    Spacer()
                    RoundedRectangle(cornerRadius: 3)
                        .fill(.white.opacity(0.07))
                        .frame(height: max(5, proxy.size.height * min(1, Double(value) / 25)))
                        .overlay(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(.orange.opacity(0.65))
                        }
                }
            }
            .frame(height: 54)

            Text(name)
                .font(.system(size: 6, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func callingSymbol(_ id: String) -> String {
        switch id {
        case "hunter": return "⌖"
        case "seeker": return "◇"
        case "warden": return "△"
        default: return "◎"
        }
    }
}
