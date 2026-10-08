import Foundation
import CoreLocation
import MapKit
import Combine

/// Exact locations stay out of the Ordinal game API. Apple Maps handles landmark lookup.
@MainActor
final class SpatialFieldService: ObservableObject {
    struct Contact: Identifiable {
        let node: OrdinalAPI.FieldNode
        let coordinate: CLLocationCoordinate2D
        let landmark: String
        var id: String { node.id }
    }

    @Published private(set) var contacts: [Contact] = []
    @Published private(set) var status = "Looking for nearby parks"
    private var landmarks: [(String, CLLocationCoordinate2D)] = []
    private var searchedAt = Date.distantPast
    private var searchOrigin: CLLocation?
    private var searching = false
    private var latestNodes: [OrdinalAPI.FieldNode] = []
    private var latestRegion = ""
    private var assignments: [String: (String, CLLocationCoordinate2D)] = [:]

    func synchronize(nodes: [OrdinalAPI.FieldNode], regionKey: String, around origin: CLLocationCoordinate2D) async {
        latestNodes = nodes
        latestRegion = regionKey
        let position = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
        let moved = searchOrigin.map { position.distance(from: $0) > 600 } ?? true
        if !searching, moved || Date().timeIntervalSince(searchedAt) > 300 {
            searching = true
            searchedAt = Date()
            searchOrigin = position
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = "park"
            request.resultTypes = .pointOfInterest
            request.region = MKCoordinateRegion(center: origin, latitudinalMeters: 3000, longitudinalMeters: 3000)
            request.pointOfInterestFilter = MKPointOfInterestFilter(including: [.park])
            do {
                let response = try await MKLocalSearch(request: request).start()
                landmarks = response.mapItems.filter {
                    $0.pointOfInterestCategory == .park && position.distance(from: $0.placemark.location ?? position) <= 1500
                }.map { ($0.name ?? "Park", $0.placemark.coordinate) }
                // Sort identically across lookups so movement does not reshuffle node assignments.
                landmarks.sort {
                    if $0.0 != $1.0 { return $0.0 < $1.0 }
                    return $0.1.latitude < $1.1.latitude
                }
                status = landmarks.isEmpty ? "No nearby park locations found. Use Veil for local exploration." : "Park contacts · choose a public accessible area"
            } catch {
                status = "Maps unavailable. Use Veil for local exploration."
                // Retry network failures sooner without querying on every GPS update.
                searchedAt = Date().addingTimeInterval(-270)
            }
            searching = false
        }
        guard !landmarks.isEmpty else { contacts = []; return }
        contacts = latestNodes.filter { !$0.collected }.map { node in
            let key = latestRegion + ":" + node.id
            let landmark: (String, CLLocationCoordinate2D)
            if let existing = assignments[key] {
                landmark = existing
            } else {
                let seed = stableHash(key)
                landmark = landmarks[Int(seed % UInt64(landmarks.count))]
                assignments[key] = landmark
            }
            return Contact(node: node, coordinate: landmark.1, landmark: landmark.0)
        }
    }

    func distance(to contact: Contact, from player: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: player.latitude, longitude: player.longitude)
            .distance(from: CLLocation(latitude: contact.coordinate.latitude, longitude: contact.coordinate.longitude))
    }

    func nearest(to player: CLLocationCoordinate2D) -> (Contact, CLLocationDistance)? {
        contacts.map { ($0, distance(to: $0, from: player)) }.min { $0.1 < $1.1 }
    }

    private func stableHash(_ value: String) -> UInt64 {
        value.utf8.reduce(1469598103934665603) { hash, byte in
            (hash ^ UInt64(byte)) &* 1099511628211
        }
    }
}
