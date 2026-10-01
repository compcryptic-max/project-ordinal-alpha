import SwiftUI
import UIKit

struct NativeProfileView: View {
    @ObservedObject var world: WorldStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("WAYFARER") {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(world.state?.name ?? "Wayfarer")
                                .font(.headline)
                            Text((world.state?.origin ?? "Unknown").uppercased())
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(world.worldRank.map { "#\($0)" } ?? "—")
                                .font(.title3.monospaced().bold())
                            Text("WORLD RANK")
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }

                    LabeledContent("Level", value: "\(world.state?.level ?? 1)")
                    LabeledContent("Ordinal Rating", value: "\(world.state?.ordinalRating ?? 0)")
                    LabeledContent("Ranked Wayfarers", value: "\(world.rankedPopulation)")
                    LabeledContent("Region", value: world.state?.region.name ?? "Unknown")
                }

                Section("LOADOUT") {
                    NavigationLink {
                        NativeGearView(world: world)
                    } label: {
                        Label("Gear & Mastery", systemImage: "shield.lefthalf.filled")
                    }
                }

                Section("GLOBAL ORDINAL NETWORK") {
                    if world.leaders.isEmpty {
                        Text("Ranking network is syncing…")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(world.leaders.prefix(10)) { player in
                            HStack(spacing: 12) {
                                Text("#\(player.rank)")
                                    .font(.caption.monospaced().bold())
                                    .frame(width: 34, alignment: .leading)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(player.name)
                                        .font(.subheadline.bold())
                                    Text("\(player.origin.uppercased()) · LV \(player.level)")
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Text("\(player.rating)")
                                    .font(.caption.monospaced().bold())
                                    .foregroundStyle(.cyan)
                            }
                        }
                    }
                }

                Section("CHARACTER RECOVERY") {
                    Text("Generate a private recovery code before changing phones, reinstalling the app, or linking this Wayfarer to another Project Ordinal client.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let code = world.recoveryCode {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(code)
                                .font(.caption.monospaced().bold())
                                .textSelection(.enabled)

                            Button {
                                UIPasteboard.general.string = code
                                UINotificationFeedbackGenerator().notificationOccurred(.success)
                            } label: {
                                Label("COPY CODE", systemImage: "doc.on.doc")
                            }

                            Text("KEEP PRIVATE. Generating another code replaces this one.")
                                .font(.caption2.monospaced())
                                .foregroundStyle(.orange)
                        }
                    } else {
                        Button {
                            Task { await world.generateRecoveryCode() }
                        } label: {
                            Label(world.busy ? "GENERATING…" : "GENERATE RECOVERY CODE", systemImage: "key.fill")
                        }
                        .disabled(world.busy)
                    }
                }
            }
            .navigationTitle("Ordinal Profile")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await world.syncSocial()
            }
        }
    }
}
