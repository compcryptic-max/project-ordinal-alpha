import SwiftUI
import MapKit

struct NativeWorldMapView: UIViewRepresentable {
    let contacts: [SpatialFieldService.Contact]
    var recenterToken = 0

    @MainActor
    final class Coordinator: NSObject, @preconcurrency MKMapViewDelegate {
        var recenterToken = 0
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let contact = annotation as? SpatialContactAnnotation else { return nil }
            let identifier = "ordinal-contact"
            let view = (mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView)
                ?? MKMarkerAnnotationView(annotation: contact, reuseIdentifier: identifier)
            view.annotation = contact
            view.canShowCallout = true
            view.displayPriority = contact.kind == "signal" ? .required : .defaultHigh
            view.markerTintColor = contact.kind == "signal"
                ? UIColor(red: 0.72, green: 0.10, blue: 0.15, alpha: 0.94)
                : UIColor(red: 0.10, green: 0.68, blue: 0.63, alpha: 0.92)
            view.glyphImage = UIImage(systemName: contact.kind == "signal" ? "exclamationmark" : "diamond.fill")
            return view
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.showsCompass = true
        map.showsScale = false
        map.pointOfInterestFilter = .excludingAll
        map.preferredConfiguration = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .muted)
        map.setUserTrackingMode(.followWithHeading, animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        if context.coordinator.recenterToken != recenterToken {
            context.coordinator.recenterToken = recenterToken
            map.setUserTrackingMode(.followWithHeading, animated: true)
        }
        let existing = map.annotations.compactMap { $0 as? SpatialContactAnnotation }
        let wanted = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, $0) })
        let obsolete = existing.filter { annotation in
            guard let contact = wanted[annotation.nodeID] else { return true }
            return !annotation.matches(contact)
        }
        map.removeAnnotations(obsolete)
        let obsoleteIDs = Set(obsolete.map(\.nodeID))
        let existingIDs = Set(existing.filter { !obsoleteIDs.contains($0.nodeID) }.map(\.nodeID))

        for contact in contacts where !existingIDs.contains(contact.id) {
            map.addAnnotation(SpatialContactAnnotation(contact: contact))
        }

    }
}

private final class SpatialContactAnnotation: NSObject, MKAnnotation {
    let nodeID: String
    let kind: String
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let subtitle: String?

    init(contact: SpatialFieldService.Contact) {
        nodeID = contact.node.id
        kind = contact.node.kind
        coordinate = contact.coordinate
        title = contact.node.label + " · " + contact.landmark
        subtitle = "Use public paths; check access before approaching"
    }

    func matches(_ contact: SpatialFieldService.Contact) -> Bool {
        kind == contact.node.kind && title == contact.node.label + " · " + contact.landmark
            && coordinate.latitude == contact.coordinate.latitude
            && coordinate.longitude == contact.coordinate.longitude
    }
}
