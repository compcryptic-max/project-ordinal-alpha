import SwiftUI
import ARKit

@main
struct OrdinalNativeApp: App {
    var body: some Scene {
        WindowGroup {
            NativeBridgeView()
        }
    }
}

struct NativeBridgeView: View {
    @State private var arOpen = false
    @State private var serverStatus = "CHECKING WORLD LINK"

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if arOpen && ARWorldTrackingConfiguration.isSupported {
                OrdinalARView().ignoresSafeArea()
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
            } else {
                VStack(spacing: 18) {
                    Text("PROJECT ORDINAL")
                        .font(.title.bold())
                    Text(serverStatus)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                    Button("OPEN NATIVE VEIL") { arOpen = true }
                        .buttonStyle(.borderedProminent)
                        .disabled(!ARWorldTrackingConfiguration.isSupported)
                }
                .foregroundStyle(.white)
            }
        }
        .task {
            do {
                let health = try await OrdinalAPI.shared.health()
                serverStatus = health.ok ? "WORLD LINK // \(health.version) // \(health.storage.uppercased())" : "WORLD LINK DEGRADED"
            } catch {
                serverStatus = "WORLD LINK OFFLINE"
            }
        }
    }
}
