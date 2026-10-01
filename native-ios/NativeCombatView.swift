import SwiftUI
import UIKit

struct NativeCombatView: View {
    @ObservedObject var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService

    private var combat: OrdinalAPI.Combat? { world.state?.combat }
    private var isHeavy: Bool { combat?.intent.localizedCaseInsensitiveContains("HEAVY") == true }
    private var reactionSeconds: Double { isHeavy ? 3.4 : 4.8 }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.black, Color(red: 0.12, green: 0.025, blue: 0.03)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                header
                Spacer()
                enemy
                Spacer()
                resources
                abilities
            }
            .padding()
        }
        .foregroundStyle(.white)
        .task(id: "\(combat?.turn ?? -1)-\(location.rapidTravel)") {
            guard !location.rapidTravel, let turn = combat?.turn else { return }
            try? await Task.sleep(for: .seconds(reactionSeconds))
            guard !Task.isCancelled,
                  world.state?.combat?.turn == turn,
                  !location.rapidTravel else { return }
            await world.act("combat", type: "idle")
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack {
                Text(combat?.rift == true ? "RIFT RUN \(combat?.riftWave ?? 1)/3" : "LIVE ENCOUNTER")
                    .font(.caption.monospaced().bold())
                Spacer()
                Text("PHASE \(combat?.phase ?? 1)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }

            ReactionBar(seconds: reactionSeconds, urgent: isHeavy)
                .id(combat?.turn)

            Text(reactionPrompt)
                .font(.caption.monospaced().bold())
                .foregroundStyle(isHeavy ? .red : .secondary)
        }
    }

    private var reactionPrompt: String {
        let intent = combat?.intent ?? ""
        if intent.localizedCaseInsensitiveContains("EVADE") { return "↔  SWIPE" }
        if intent.localizedCaseInsensitiveContains("GUARD") { return "◇  HOLD" }
        return isHeavy ? "!  REACT" : intent
    }

    private var enemy: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(isHeavy ? .red.opacity(0.5) : .white.opacity(0.18), lineWidth: 1)
                    .frame(width: 235, height: 235)
                Circle()
                    .fill(.black.opacity(0.42))
                    .frame(width: 192, height: 192)
                Image(systemName: isHeavy ? "exclamationmark.triangle.fill" : "eye.fill")
                    .font(.system(size: 70, weight: .thin))
                    .foregroundStyle(isHeavy ? .red : .white.opacity(0.84))

                VStack {
                    Spacer()
                    HStack(spacing: 18) {
                        Text("TAP · STRIKE")
                        Text("SWIPE · EVADE")
                        Text("HOLD · GUARD")
                    }
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
                }
                .frame(height: 270)
            }
            .contentShape(Circle())
            .gesture(
                LongPressGesture(minimumDuration: 0.45)
                    .exclusively(before: TapGesture())
                    .onEnded { result in
                        switch result {
                        case .first:
                            combatAction("guard", impact: .rigid)
                        case .second:
                            combatAction("attack", impact: .medium)
                        }
                    }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 36)
                    .onEnded { value in
                        if hypot(value.translation.width, value.translation.height) > 52 {
                            combatAction("dodge", impact: .light)
                        }
                    }
            )

            Text(combat?.name.uppercased() ?? "HOSTILE")
                .font(.title3.monospaced().bold())

            ProgressView(value: Double(combat?.hp ?? 0), total: Double(max(1, combat?.maxHp ?? 1)))
                .tint(.red)

            if let result = combat?.lastResult, !result.isEmpty {
                Text(result)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var resources: some View {
        HStack {
            Label("\(world.state?.hp ?? 0) HP", systemImage: "heart.fill")
            Spacer()
            Text("STA \(combat?.stamina ?? 0)")
            Spacer()
            Text("FOC \(combat?.focus ?? 0)")
        }
        .font(.caption.monospaced().bold())
    }

    private var abilities: some View {
        HStack(spacing: 12) {
            abilityButton("SKILL", "sparkles", "skill")
            abilityButton("TONIC", "cross.case.fill", "potion")
            abilityButton("WITHDRAW", "figure.run", "retreat")
        }
    }

    private func abilityButton(_ label: String, _ icon: String, _ type: String) -> some View {
        Button {
            combatAction(type, impact: type == "skill" ? .heavy : .soft)
        } label: {
            VStack(spacing: 5) {
                Image(systemName: icon)
                Text(label)
                    .font(.caption2.bold())
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
        }
        .buttonStyle(.bordered)
        .disabled(world.busy || location.rapidTravel)
    }

    private func combatAction(_ type: String, impact: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard !world.busy, !location.rapidTravel else { return }
        UIImpactFeedbackGenerator(style: impact).impactOccurred()
        Task { await world.act("combat", type: type) }
    }
}

private struct ReactionBar: View {
    let seconds: Double
    let urgent: Bool
    @State private var remaining = 1.0

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.08))
                Capsule()
                    .fill(urgent ? .red : .cyan)
                    .frame(width: proxy.size.width * remaining)
            }
        }
        .frame(height: 4)
        .task {
            remaining = 1
            withAnimation(.linear(duration: seconds)) {
                remaining = 0
            }
        }
    }
}
