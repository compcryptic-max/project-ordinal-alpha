import SwiftUI
import UIKit

struct NativeFieldInteractionView: View {
    @ObservedObject var world: WorldStore
    let node: OrdinalAPI.FieldNode
    let onComplete: () -> Void
    let onCancel: () -> Void

    @State private var attempts = 0
    @State private var stabilizations = 0
    @State private var held = false

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [accent.opacity(0.18), .black],
                center: .center,
                startRadius: 25,
                endRadius: 430
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                header
                Spacer()
                contactCore
                interaction
                Spacer()
                Button("DISENGAGE", action: onCancel)
                    .font(.caption.monospaced().bold())
                    .foregroundStyle(.secondary)
            }
            .padding(20)
        }
        .foregroundStyle(.white)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("FIELD CONTACT")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(accent)
                Text(node.kind.uppercased())
                    .font(.caption.monospaced().bold())
            }
            Spacer()
            Text("F-\(node.distance)")
                .font(.caption2.monospaced().bold())
                .foregroundStyle(.secondary)
        }
    }

    private var contactCore: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { ring in
                Circle()
                    .stroke(accent.opacity(0.34 - Double(ring) * 0.07), lineWidth: 1)
                    .frame(width: CGFloat(110 + ring * 44), height: CGFloat(110 + ring * 44))
                    .rotationEffect(.degrees(Double(ring * 18)))
            }

            Circle()
                .fill(accent.opacity(0.12))
                .frame(width: 92, height: 92)

            Image(systemName: symbol)
                .font(.system(size: 38, weight: .thin))
                .foregroundStyle(accent)
                .shadow(color: accent.opacity(0.55), radius: 18)
        }
    }

    @ViewBuilder
    private var interaction: some View {
        switch node.kind {
        case "cache":
            phaseLock
        case "echo":
            resonanceHold
        case "resource":
            stabilization
        default:
            pulseAnchor
        }
    }

    private var phaseLock: some View {
        VStack(spacing: 12) {
            Text("MATCH THE LOCK PHASE")
                .font(.caption.monospaced().bold())
            Text(attempts > 0 ? "CHANNEL REJECTED · recalibrate" : "One phase matches the live cache resonance.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                ForEach(0..<3) { index in
                    Button {
                        if index == targetPhase {
                            complete(style: .success)
                        } else {
                            attempts += 1
                            UINotificationFeedbackGenerator().notificationOccurred(.warning)
                        }
                    } label: {
                        Text(["◇", "△", "⌁"][index])
                            .font(.system(size: 28, weight: .light, design: .monospaced))
                            .frame(maxWidth: .infinity)
                            .frame(height: 62)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var resonanceHold: some View {
        VStack(spacing: 12) {
            Text("HOLD THE MEMORY FREQUENCY")
                .font(.caption.monospaced().bold())
            Text(held ? "RESONANCE STABLE" : "Maintain contact until the echo resolves.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            ZStack {
                Circle()
                    .stroke(.purple.opacity(0.25), lineWidth: 8)
                    .frame(width: 116, height: 116)
                Circle()
                    .fill(.purple.opacity(held ? 0.28 : 0.10))
                    .frame(width: 88, height: 88)
                Image(systemName: held ? "waveform.path.ecg" : "hand.tap.fill")
                    .font(.title)
                    .foregroundStyle(.purple)
            }
            .contentShape(Circle())
            .onLongPressGesture(minimumDuration: 1.15) {
                held = true
                complete(style: .success)
            }
        }
    }

    private var stabilization: some View {
        VStack(spacing: 12) {
            Text("STABILIZE AETHER · \(stabilizations)/3")
                .font(.caption.monospaced().bold())

            ProgressView(value: Double(stabilizations), total: 3)
                .tint(.cyan)

            Button {
                stabilizations += 1
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                if stabilizations >= 3 {
                    complete(style: .success)
                }
            } label: {
                Label("HOLD PHASE", systemImage: "dot.radiowaves.left.and.right")
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan.opacity(0.50))
            .disabled(stabilizations >= 3)
        }
    }

    private var pulseAnchor: some View {
        VStack(spacing: 12) {
            Text("ANCHOR REGIONAL PULSE")
                .font(.caption.monospaced().bold())
            Text("This recovery contributes to the shared region.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Button {
                complete(style: .success)
            } label: {
                Label("ANCHOR PULSE", systemImage: "scope")
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange.opacity(0.50))
        }
    }

    private var accent: Color {
        switch node.kind {
        case "echo": return .purple
        case "event": return .orange
        default: return .cyan
        }
    }

    private var symbol: String {
        switch node.kind {
        case "cache": return "lock.open.trianglebadge.exclamationmark"
        case "echo": return "waveform.path"
        case "resource": return "sparkles"
        default: return "scope"
        }
    }

    private var targetPhase: Int {
        Int(stableHash(node.id) % 3)
    }

    private func stableHash(_ value: String) -> UInt64 {
        value.utf8.reduce(1469598103934665603) { hash, byte in
            (hash ^ UInt64(byte)) &* 1099511628211
        }
    }

    private func complete(style: UINotificationFeedbackGenerator.FeedbackType) {
        guard !world.busy else { return }
        UINotificationFeedbackGenerator().notificationOccurred(style)
        Task {
            await world.act("collect", id: node.id)
            if world.lastError == nil {
                onComplete()
            }
        }
    }
}
