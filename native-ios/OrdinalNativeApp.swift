import SwiftUI
import ARKit

@main
struct OrdinalNativeApp: App {
    @StateObject private var world = WorldStore()

    var body: some Scene {
        WindowGroup {
            NativeBridgeView()
                .environmentObject(world)
        }
    }
}

struct NativeBridgeView: View {
    @EnvironmentObject private var world: WorldStore
    @State private var arOpen = false

    var body: some View {
        ZStack {
            if arOpen && ARWorldTrackingConfiguration.isSupported {
                OrdinalARView(nodes: world.state?.field ?? []).ignoresSafeArea()
                VStack {
                    HStack {
                        Text("ORDINAL // NATIVE VEIL")
                        Spacer()
                        Button("CLOSE") { arOpen = false }
                    }
                    .font(.caption.monospaced().bold())
                    .padding()
                    .background(.black.opacity(0.55))
                    Spacer()
                }
                .foregroundStyle(.white)
            } else if world.state?.combat != nil {
                NativeCombatView(world: world)
            } else if world.state != nil {
                NativeFieldView(world: world, arOpen: $arOpen)
            } else {
                Color.black.ignoresSafeArea()
                VStack(spacing: 14) {
                    ProgressView()
                    Text("PROJECT ORDINAL")
                        .font(.title.bold())
                    Text(world.status)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                    if world.lastError != nil {
                        Button("RETRY WORLD LINK") {
                            Task { await world.connect() }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .foregroundStyle(.white)
            }
        }
        .task {
            if world.state == nil {
                await world.connect()
            }
        }
    }
}
