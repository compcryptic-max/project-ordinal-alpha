import SwiftUI

struct NativeAccountView: View {
    @ObservedObject var world: WorldStore
    var onContinue: () -> Void
    @State private var mode = "welcome"
    @State private var login = ""
    @State private var name = ""
    @State private var password = ""
    @State private var code = ""
    @State private var account: OrdinalAPI.TestAccount?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.055, green: 0.12, blue: 0.13), .black], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("PROJECT ORDINAL").font(.headline).tracking(4)
                        .frame(maxWidth: .infinity).padding(.vertical, 30)
                    if mode == "welcome" {
                        Text("The world remembers.").font(.largeTitle.bold())
                        Text("Create your account, choose a Wayfarer, and enter the Veil.")
                        action("CREATE ACCOUNT") { mode = "signup" }
                        action("SIGN IN") { mode = "signin" }
                        if world.hasSavedIdentity || world.state != nil {
                            action("CONTINUE SAVED WAYFARER", perform: onContinue)
                        }
                    } else if let account, mode == "receipt" {
                        Text("Welcome, \(account.displayName).").font(.largeTitle.bold())
                        Text("Save this private account recovery code. No email is sent.")
                        Text(account.recoveryCode ?? "").font(.body.monospaced()).textSelection(.enabled)
                            .padding().background(.cyan.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        Text(account.persistent ? "Your test account is saved on the server." : "Temporary test server: accounts reset when it restarts.").font(.caption)
                        action("CHOOSE YOUR WAYFARER", perform: onContinue)
                    } else {
                        Button("← Back") { mode = "welcome"; error = nil; password = "" }
                        Text(mode == "signup" ? "Create your account" : mode == "recover" ? "Recover your account" : "Welcome back").font(.largeTitle.bold())
                        if mode == "signup" { field("Display name", text: $name) }
                        field("Account name or test email", text: $login)
                        if mode == "recover" { field("Private account recovery code", text: $code) }
                        SecureField(mode == "recover" ? "New test password" : "Test password", text: $password)
                            .textContentType(mode == "signin" ? .password : .newPassword)
                            .padding(14).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                        action(mode == "signup" ? "CREATE TEST ACCOUNT" : mode == "recover" ? "RESET PASSWORD" : "SIGN IN") { Task { await submit() } }
                        Button(mode == "signup" ? "Already have an account? Sign in" : "Create an account") { mode = mode == "signup" ? "signin" : "signup"; password = ""; error = nil }
                        if mode == "signin" { Button("Forgot password?") { mode = "recover"; password = "" } }
                    }
                    if let error { Text(error).foregroundStyle(.red).font(.caption) }
                    Text("Alpha testing: invented details are welcome. No email verification or identity checks. Use a test password.").font(.caption).foregroundStyle(.secondary)
                }.padding(24)
            }.disabled(busy)
        }.foregroundStyle(.white)
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text).textInputAutocapitalization(.never).autocorrectionDisabled()
            .padding(14).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }
    private func action(_ title: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) { Text(title).font(.caption.bold()).frame(maxWidth: .infinity).padding(16) }
            .buttonStyle(.borderedProminent).tint(.cyan.opacity(0.5))
    }
    @MainActor private func submit() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await OrdinalAPI.shared.account(action: mode, input: .init(login: login, password: password, displayName: name, recoveryCode: code))
            account = result
            await world.useAccount(result, restore: mode == "signin" || mode == "recover")
            password = ""
            error = nil
            if result.recoveryCode != nil { mode = "receipt" } else { onContinue() }
        } catch { self.error = error.localizedDescription }
    }
}
