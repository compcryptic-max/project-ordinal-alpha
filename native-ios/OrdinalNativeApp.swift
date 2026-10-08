import SwiftUI
import ARKit

@main
struct OrdinalNativeApp: App {
    @StateObject private var world = WorldStore()
    @StateObject private var location = CoarseLocationService()
    @StateObject private var spatial = SpatialFieldService()

    var body: some Scene {
        WindowGroup {
            NativeBridgeView()
                .environmentObject(world)
                .environmentObject(location)
                .environmentObject(spatial)
        }
    }
}

struct NativeBridgeView: View {
    @EnvironmentObject private var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService
    @EnvironmentObject private var spatial: SpatialFieldService
    @Environment(\.scenePhase) private var scenePhase
    @State private var arOpen = false
    @State private var localVeil = false
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
                OrdinalARView(nodes: reachableNodes, onStatus: { arStatus = $0 }) { node in
                    guard !world.busy, reachableNodes.contains(where: { $0.id == node.id }) else { return }
                    Task {
                        if node.kind == "signal" {
                            encounterCameFromAR = true
                            await world.act("investigate")
                            if world.state?.pendingEncounter != nil || world.state?.combat != nil {
                                arOpen = false
                            }
                        } else {
                            await world.act("collect", id: node.id)
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
                        Text(localVeil ? "ORDINAL // LOCAL VEIL" : "ORDINAL // LANDMARK VEIL")
                        Spacer()
                        Button("CLOSE") { arOpen = false }
                    }
                    .font(.caption.monospaced().bold())
                    .padding()
                    .background(.black.opacity(0.55))
                    Text(reachableNodes.isEmpty ? "No contacts in range. Return to the map or use Local Veil." : arStatus)
                        .font(.caption).padding(8).background(.black.opacity(0.55))
                    if let error = world.lastError {
                        Text(error).font(.caption).foregroundStyle(.red).padding(8).background(.black.opacity(0.55))
                    }
                    Spacer()
                }
                .foregroundStyle(.white)
            } else if world.state != nil {
                NativeFieldView(world: world, arOpen: $arOpen, localVeil: $localVeil)
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
            location.startSafetyMonitoring()
            if world.state == nil {
                let coarse = await location.acquire()
                world.setLocation(lat: coarse?.latitude, lon: coarse?.longitude)
                if world.hasSavedIdentity {
                    await world.connect(lat: coarse?.latitude, lon: coarse?.longitude)
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && !accountGate {
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
        .onChange(of: location.sampleToken, initial: true) { _, _ in
            Task { await synchronizeSpatialField() }
        }
        .task(id: spatialContentID) {
            await synchronizeSpatialField()
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
    private var reachableNodes: [OrdinalAPI.FieldNode] {
        guard !location.rapidTravel else { return [] }
        if localVeil { return world.state?.field?.filter { !$0.collected } ?? [] }
        guard let position = location.coordinate,
              let accuracy = location.horizontalAccuracy, accuracy <= 35 else { return [] }
        return spatial.contacts.filter {
            spatial.distance(to: $0, from: position) <= max(14, accuracy * 0.72)
        }.map { $0.node }
    }

    private var spatialContentID: String {
        (world.state?.region.key ?? "") + (world.state?.field?.map {
            "\($0.id):\($0.collected)"
        }.joined(separator: "|") ?? "")
    }

    private func synchronizeSpatialField() async {
        guard let state = world.state, let coordinate = location.coordinate,
              let accuracy = location.horizontalAccuracy, accuracy <= 35 else { return }
        await spatial.synchronize(nodes: state.field ?? [], regionKey: state.region.key, around: coordinate)
    }

}
