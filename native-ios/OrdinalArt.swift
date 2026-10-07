import SwiftUI

enum OrdinalArt {
    static func enemyAsset(for name: String) -> String {
        let value = name.lowercased()
        if value.contains("hound") { return "pale-hound" }
        if value.contains("stalker") { return "veil-stalker" }
        if value.contains("marauder") { return "hollow-marauder" }
        if value.contains("mirehorn") { return "mirehorn" }
        if value.contains("revenant") { return "ash-revenant" }
        if value.contains("choirless") || value.contains("knight") { return "choirless-knight" }
        if value.contains("weaver") { return "riftweaver" }
        return "glass-warden"
    }

    static func wayfarerAsset(for origin: String) -> String {
        switch origin.lowercased() {
        case "vanguard", "ranger", "arcanist": return origin.lowercased()
        default: return "rogue"
        }
    }
}

struct OrdinalEnemyArt: View {
    let name: String
    var body: some View {
        Image(OrdinalArt.enemyAsset(for: name))
            .resizable()
            .scaledToFit()
            .accessibilityLabel(name)
    }
}

struct OrdinalWayfarerArt: View {
    let origin: String
    var body: some View {
        Image(OrdinalArt.wayfarerAsset(for: origin))
            .resizable()
            .scaledToFit()
            .accessibilityLabel("\(origin) Wayfarer")
    }
}
