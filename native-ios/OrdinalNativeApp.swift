import SwiftUI
import ARKit

@main
struct OrdinalNativeApp: App {
    @StateObject private var world = WorldStore()
    @StateObject private var location = CoarseLocationService()

    var body: some Scene {
        WindowGroup {
            NativeBridgeView()
                .environmentObject(world)
                .environmentObject(location)
        }
    }
}

struct NativeBridgeView: View {
    @EnvironmentObject private var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService
    @Environment(\.scenePhase) private var scenePhase
    @State private var arOpen = false
    @State private var arStatus = "Move slowly to establish tracking."
    @State private var arCombatMode = false
    @State private var encounterCameFromAR = false
    @State private var selectedARNode: OrdinalAPI.FieldNode?
    @State private var accountGate = true

    var body: some View {
        ZStack {
            if accountGate {
                NativeAccountView(world: world) { accountGate = false }
            } else if let node = selectedARNode {
                NativeFieldInteractionView(
                    world: world,
                    node: node,
                    onComplete: { selectedARNode = nil },
                    onCancel: { selectedARNode = nil }
                )
            } else if world.state?.pendingLoot != nil {
                NativeLootView(world: world)
            } else if world.state?.pendingChoice != nil {
                NativeShrineChoiceView(world: world)
            } else if world.state?.pendingEncounter != nil {
                NativeEncounterView(world: world) {
                    if encounterCameFromAR {
                        arCombatMode = true
                    }
                }
            } else if world.state?.combat != nil {
                if arCombatMode && ARWorldTrackingConfiguration.isSupported {
                    NativeARCombatView(world: world, onExitAR: { arCombatMode = false })
                } else {
                    NativeCombatView(world: world)
                }
            } else if arOpen && ARWorldTrackingConfiguration.isSupported {
                OrdinalARView(nodes: world.state?.field ?? [], onStatus: { arStatus = $0 }) { node in
                    Task {
                        if node.kind == "signal" {
                            encounterCameFromAR = true
                            await world.act("investigate")
                            if world.state?.pendingEncounter != nil || world.state?.combat != nil {
                                arOpen = false
                            }
                        } else {
                            selectedARNode = node
                        }
                    }
                }
                .ignoresSafeArea()

                ZStack {
                    Circle()
                        .stroke(.cyan.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [4, 6]))
                        .frame(width: 76, height: 76)
                    Circle()
                        .fill(.cyan.opacity(0.82))
                        .frame(width: 5, height: 5)
                }
                .allowsHitTesting(false)

                VStack {
                    HStack {
                        Text("ORDINAL // NATIVE VEIL")
                        Spacer()
                        Button("CLOSE") { arOpen = false }
                    }
                    .font(.caption.monospaced().bold())
                    .padding()
                    .background(.black.opacity(0.55))
                    Text(arStatus).font(.caption).padding(8).background(.black.opacity(0.55))
                    Spacer()
                }
                .foregroundStyle(.white)
            } else if world.state != nil {
                NativeFieldView(world: world, arOpen: $arOpen)
            } else if world.hasSavedIdentity {
                Color.black.ignoresSafeArea()
                VStack(spacing: 14) {
                    ProgressView()
                    Text("PROJECT ORDINAL")
                        .font(.title.bold())
                    Text(world.status)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(.white)
            } else {
                NativeOnboardingView(world: world)
            }
        }
        .task(id: accountGate) {
            guard !accountGate else { return }
            if world.state == nil {
                let coarse = await location.acquire()
                world.setLocation(lat: coarse?.latitude, lon: coarse?.longitude)
                if world.hasSavedIdentity {
                    await world.connect(lat: coarse?.latitude, lon: coarse?.longitude)
                }
                location.startSafetyMonitoring()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                location.startSafetyMonitoring()
            } else {
                location.stopSafetyMonitoring()
            }
        }
        .onChange(of: location.rapidTravel) { _, rapid in
            if rapid {
                arOpen = false
                selectedARNode = nil
            }
        }
        .onChange(of: location.relocationToken) { _, token in
            guard !token.isEmpty,
                  let coordinate = location.serverCoordinate,
                  world.state != nil else { return }
            Task {
                await world.relocateIfNeeded(lat: coordinate.latitude, lon: coordinate.longitude)
            }
        }
        .onChange(of: world.state?.combat?.name) { _, newValue in
            if newValue == nil {
                arCombatMode = false
                encounterCameFromAR = false
            }
        }
    }
}
