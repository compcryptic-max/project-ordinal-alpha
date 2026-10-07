import Foundation
import CoreLocation
import Combine

/// Converts server-owned Field contacts into stable, walkable coordinates.
/// Precise coordinates stay in UserDefaults on this iPhone and are never uploaded.
@MainActor
final class SpatialFieldService: ObservableObject {
    struct Contact: Identifiable {
        let node: OrdinalAPI.FieldNode
        let coordinate: CLLocationCoordinate2D
        var id: String { node.id }
    }

    @Published private(set) var contacts: [Contact] = []

    func synchronize(nodes: [OrdinalAPI.FieldNode], regionKey: String, around origin: CLLocationCoordinate2D) {
        contacts = nodes.filter { !$0.collected }.map { node in
            Contact(node: node, coordinate: storedCoordinate(for: node, regionKey: regionKey, origin: origin))
        }
    }

    func distance(to contact: Contact, from player: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: player.latitude, longitude: player.longitude)
            .distance(from: CLLocation(latitude: contact.coordinate.latitude, longitude: contact.coordinate.longitude))
    }

    func nearest(to player: CLLocationCoordinate2D) -> (Contact, CLLocationDistance)? {
        contacts
            .map { ($0, distance(to: $0, from: player)) }
            .min { $0.1 < $1.1 }
    }

    private func storedCoordinate(for node: OrdinalAPI.FieldNode, regionKey: String, origin: CLLocationCoordinate2D) -> CLLocationCoordinate2D {
        let key = "ordinal.spatial.\(regionKey).\(node.id)"
        if let saved = UserDefaults.standard.array(forKey: key) as? [Double], saved.count == 2 {
            return CLLocationCoordinate2D(latitude: saved[0], longitude: saved[1])
        }

        let seed = stableHash(regionKey + ":" + node.id)
        let bearing = Double(seed % 360) * .pi / 180
        // Contacts remain close enough for a short real walk, but never spawn on top of the player.
        let meters = 45 + Double((seed >> 9) % 111)
        let result = destination(from: origin, meters: meters, bearing: bearing)
        UserDefaults.standard.set([result.latitude, result.longitude], forKey: key)
        return result
    }

    private func destination(from origin: CLLocationCoordinate2D, meters: Double, bearing: Double) -> CLLocationCoordinate2D {
        let radius = 6_371_000.0
        let angular = meters / radius
        let latitude = origin.latitude * .pi / 180
        let longitude = origin.longitude * .pi / 180
        let nextLatitude = asin(sin(latitude) * cos(angular) + cos(latitude) * sin(angular) * cos(bearing))
        let nextLongitude = longitude + atan2(
            sin(bearing) * sin(angular) * cos(latitude),
            cos(angular) - sin(latitude) * sin(nextLatitude)
        )
        return CLLocationCoordinate2D(latitude: nextLatitude * 180 / .pi, longitude: nextLongitude * 180 / .pi)
    }

    private func stableHash(_ value: String) -> UInt64 {
        value.utf8.reduce(1469598103934665603) { hash, byte in
            (hash ^ UInt64(byte)) &* 1099511628211
        }
    }
}
