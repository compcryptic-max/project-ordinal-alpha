import SwiftUI
import UIKit
import ARKit
import AVFoundation

struct NativeFieldView: View {
    @ObservedObject var world: WorldStore
    @Binding var arOpen: Bool
    @Binding var localVeil: Bool
    @EnvironmentObject private var location: CoarseLocationService
    @EnvironmentObject private var spatial: SpatialFieldService
    @State private var showProfile = false
    @State private var showGuild = false
    @State private var nearestStatus = "ACQUIRING POSITION"
    @State private var lastActivatedNode: String?
    @State private var recenterToken = 0

    var body: some View {
        GeometryReader { _ in
            ZStack {
                NativeWorldMapView(contacts: spatial.contacts, recenterToken: recenterToken)
                    .ignoresSafeArea()
                    .saturation(0.45)
                    .brightness(-0.18)

                LinearGradient(
                    colors: [.black.opacity(0.52), .clear, .black.opacity(0.72)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                .allowsHitTesting(false)

                VStack(spacing: 10) {
                    header
                    if let environment = world.state?.environment {
                        Text(environment.status == "current" ? (environment.rainBoost ? "REGIONAL RAIN · RIFT SPARK +10%" : "REGIONAL WEATHER · NO RAIN BONUS") : "REGIONAL WEATHER UNAVAILABLE · NO BONUS")
                            .font(.caption2.monospaced())
                            .padding(6)
                            .background(.black.opacity(0.72), in: Capsule())
                    }
                    Spacer()
                    objective
                    actionBar
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                if location.rapidTravel {
                    VStack(spacing: 6) {
                        Image(systemName: "car.fill")
                            .font(.title2)
                        Text("RAPID TRAVEL")
                            .font(.caption.monospaced().bold())
                        Text("Field interactions pause while moving at vehicle speed.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 16))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(.orange.opacity(0.30))
                    }
                    .foregroundStyle(.white)
                }
            }
        }
        .alert("Ordinal", isPresented: Binding(get: { world.lastError != nil }, set: { if !$0 { world.lastError = nil } })) {
            Button("OK") { world.lastError = nil }
        } message: { Text(world.lastError ?? "") }
        .sheet(isPresented: $showGuild) {
            NativeGuildView(world: world)
        }
        .sheet(isPresented: $showProfile) {
            NativeProfileView(world: world)
        }
        .task(id: location.sampleToken) {
            await synchronizeSpatialField()
            await checkPhysicalProximity()
        }
        .task(id: spatial.contacts.map { $0.id }.joined(separator: "|")) {
            await checkPhysicalProximity()
        }
        .task(id: spatialContentID) {
            await synchronizeSpatialField()
            await checkPhysicalProximity()
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                guard !Task.isCancelled else { break }
                await world.refresh()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(world.state?.region.name.uppercased() ?? "UNKNOWN REGION")
                    .font(.caption.monospaced().bold())
                Text((world.state?.region.stage.uppercased() ?? "UNSETTLED") + "  //  THREAT \(world.state?.region.threat ?? 0)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("GUILD") { showGuild = true }
                .font(.caption.bold())
                .frame(minHeight: 44)

            Button {
                showProfile = true
            } label: {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(world.worldRank.map { "WORLD #\($0)" } ?? "RATING")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                        .foregroundStyle(.cyan)
                    Text("\(world.state?.ordinalRating ?? 0)")
                        .font(.title3.monospaced().bold())
                    Text("LV \(world.state?.level ?? 1)  ·  \(world.state?.hp ?? 0) HP")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(.white)
        .padding(12)
        .background(.black.opacity(0.46), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(.white.opacity(0.07))
        }
    }

    @ViewBuilder
    private var objective: some View {
        if let item = world.state?.journey {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("YOUR STORY")
                    Spacer()
                    Text("CHAPTER \(item.chapter)")
                }
                .font(.system(size: 7, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

                Text(world.state?.nextObjective?.title ?? item.title)
                    .font(.caption.bold())
                if let next = world.state?.nextObjective {
                    Text(next.detail).font(.caption2)
                }

                ProgressView(value: Double(item.progress), total: Double(max(1, item.next)))
                    .tint(.cyan)
            }
            .foregroundStyle(.white)
            .padding(10)
            .background(.black.opacity(0.46), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private var actionBar: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    recenterToken &+= 1
                } label: {
                    Image(systemName: "location.fill").foregroundStyle(.cyan)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Recenter map on my location")
                Text(nearestStatus)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                Spacer()
                if let accuracy = location.horizontalAccuracy {
                    Text("±\(Int(accuracy.rounded()))M")
                        .font(.system(size: 7, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)

            HStack(spacing: 9) {
                action("VEIL", "viewfinder") {
                    Task { await openVeil() }
                }

                action("LOCAL VEIL", "camera.viewfinder") {
                    Task { await openVeil(local: true) }
                }

                action("RIFT", "diamond.inset.filled") {
                    Task { await world.act("rift") }
                }
            }
        }
        .padding(10)
        .background(.black.opacity(0.68), in: RoundedRectangle(cornerRadius: 14))
        .disabled(world.busy || location.rapidTravel)
    }

    @MainActor private func openVeil(local: Bool = false) async {
        guard ARWorldTrackingConfiguration.isSupported else { world.lastError = "This device does not support native AR."; return }
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
        default: allowed = false
        }
        guard allowed else { world.lastError = "Enable Camera for Ordinal in iPhone Settings to open Veil."; return }
        localVeil = local
        arOpen = true
    }

    private var spatialContentID: String {
        let region = world.state?.region.key ?? "none"
        let nodes = world.state?.field?.map { "\($0.id):\($0.collected)" }.joined(separator: "|") ?? ""
        return region + nodes
    }

    private func synchronizeSpatialField() async {
        guard let state = world.state else { return }
        spatial.updateNodes(nodes: state.field ?? [], regionKey: state.region.key)
        guard let coordinate = location.coordinate,
              let accuracy = location.horizontalAccuracy, accuracy <= 35 else { return }
        await spatial.synchronize(nodes: state.field ?? [], regionKey: state.region.key, around: coordinate)
    }

    @MainActor
    private func checkPhysicalProximity() async {
        guard !location.rapidTravel,
              !world.busy,
              let coordinate = location.coordinate,
              let nearest = spatial.nearest(to: coordinate) else {
            nearestStatus = location.coordinate == nil ? "ACQUIRING POSITION" : spatial.status.uppercased()
            return
        }

        let meters = Int(nearest.1.rounded())
        nearestStatus = "\(nearest.0.node.label.uppercased()) · \(meters)M"

        if nearest.1 > 30, lastActivatedNode == nearest.0.id {
            lastActivatedNode = nil
        }

        let accuracy = location.horizontalAccuracy ?? 100
        guard accuracy <= 35, nearest.1 <= max(14, accuracy * 0.72) else { return }
        if lastActivatedNode != nearest.0.id {
            lastActivatedNode = nearest.0.id
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        nearestStatus = "CONTACT IN RANGE · OPEN VEIL TO DISCOVER"

    }

    private func action(_ title: String, _ icon: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.body)
                Text(title)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.11))
        .foregroundStyle(.white)
    }

}
