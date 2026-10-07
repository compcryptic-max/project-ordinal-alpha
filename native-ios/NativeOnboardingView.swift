import SwiftUI

struct NativeOnboardingView: View {
    @ObservedObject var world: WorldStore

    @State private var name = ""
    @State private var origin = "Rogue"
    @State private var recoveryCode = ""
    @State private var mode: Mode = .create

    private enum Mode: String, CaseIterable {
        case create = "NEW"
        case recover = "RECOVER"
    }

    private let origins = [
        ("Vanguard", "Endure pressure and break enemy rhythm."),
        ("Ranger", "Precision and ranged pressure."),
        ("Arcanist", "Resource-heavy burst and Veil control."),
        ("Rogue", "Fast reactions and evasive pressure.")
    ]

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.055, blue: 0.05), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    Spacer(minLength: 40)

                    VStack(spacing: 6) {
                        Text("PROJECT ORDINAL")
                            .font(.largeTitle.bold())
                        Text("NATIVE WORLD LINK")
                            .font(.caption.monospaced().bold())
                            .foregroundStyle(.cyan)
                    }

                    Picker("Mode", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { item in
                            Text(item.rawValue).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)

                    if mode == .create {
                        createForm
                    } else {
                        recoveryForm
                    }

                    if let error = world.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    Text("Your persistent game state is stored on the Project Ordinal server. Exact home coordinates are not stored in your character save.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)

                    Spacer(minLength: 30)
                }
                .padding(.horizontal, 18)
            }
        }
        .foregroundStyle(.white)
    }

    private var createForm: some View {
        VStack(spacing: 14) {
            TextField("Wayfarer name", text: $name)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(14)
                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))

            VStack(spacing: 8) {
                ForEach(origins, id: \.0) { item in
                    Button {
                        origin = item.0
                    } label: {
                        HStack(spacing: 12) {
                            OrdinalWayfarerArt(origin: item.0)
                                .frame(width: 54, height: 68)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.0.uppercased())
                                    .font(.caption.monospaced().bold())
                                Text(item.1)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if origin == item.0 {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.cyan)
                            }
                        }
                        .padding(12)
                        .background(
                            origin == item.0 ? Color.cyan.opacity(0.09) : Color.white.opacity(0.035),
                            in: RoundedRectangle(cornerRadius: 12)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(origin == item.0 ? Color.cyan.opacity(0.36) : Color.white.opacity(0.06))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                Task { await world.createCharacter(name: name, origin: origin) }
            } label: {
                Text(world.busy ? "CONNECTING…" : "ENTER THE WORLD")
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan.opacity(0.68))
            .disabled(world.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private var recoveryForm: some View {
        VStack(spacing: 14) {
            Text("Use the recovery code generated by your existing Project Ordinal character.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", text: $recoveryCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.caption.monospaced())
                .padding(14)
                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))

            Button {
                Task { await world.recover(code: recoveryCode) }
            } label: {
                Text(world.busy ? "RECOVERING…" : "RECOVER WAYFARER")
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple.opacity(0.65))
            .disabled(world.busy || recoveryCode.isEmpty)
        }
    }
}
