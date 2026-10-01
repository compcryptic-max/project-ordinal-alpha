import SwiftUI
import UIKit

struct NativeEncounterView: View {
    @ObservedObject var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService
    var onEngage: (() -> Void)? = nil

    private var encounter: OrdinalAPI.PendingEncounter? { world.state?.pendingEncounter }

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [Color(red: 0.20, green: 0.03, blue: 0.045), .black],
                center: .center,
                startRadius: 30,
                endRadius: 430
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("CONTACT IDENTIFIED")
                            .font(.caption2.monospaced().bold())
                            .foregroundStyle(.red)
                        Text(world.state?.region.name.uppercased() ?? "UNKNOWN REGION")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("THREAT \(encounter?.threat ?? 0)")
                        .font(.caption.monospaced().bold())
                }

                Spacer()

                ZStack {
                    Circle()
                        .stroke(.red.opacity(0.28), lineWidth: 1)
                        .frame(width: 250, height: 250)
                    Circle()
                        .fill(.red.opacity(0.05))
                        .frame(width: 210, height: 210)
                    Image(systemName: "eye.trianglebadge.exclamationmark.fill")
                        .font(.system(size: 86, weight: .ultraLight))
                        .foregroundStyle(.red.opacity(0.88))
                }

                VStack(spacing: 6) {
                    Text(encounter?.name.uppercased() ?? "UNKNOWN HOSTILE")
                        .font(.title2.monospaced().bold())
                    Text("\(encounter?.archetype.uppercased() ?? "HOSTILE")  //  WEAK: \(encounter?.weakness.uppercased() ?? "UNKNOWN")")
                        .font(.caption2.monospaced().bold())
                        .foregroundStyle(.secondary)
                    if let modifier = encounter?.modifier {
                        Text("\(modifier.name.uppercased()) — \(modifier.desc)")
                            .font(.caption2.monospaced())
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                            .padding(.top, 4)
                    }
                }

                Spacer()

                HStack(spacing: 12) {
                    Button {
                        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                        onEngage?()
                        Task { await world.act("engage", choice: "engage") }
                    } label: {
                        Label("ENGAGE", systemImage: "bolt.fill")
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red.opacity(0.75))

                    Button {
                        Task { await world.act("engage", choice: "leave") }
                    } label: {
                        Text("MARK & LEAVE")
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.bordered)
                }
                .disabled(world.busy || location.rapidTravel)
            }
            .padding(18)
        }
        .foregroundStyle(.white)
    }
}
