import SwiftUI
import MapKit

struct NativeWorldMapView: UIViewRepresentable {
    let contacts: [SpatialFieldService.Contact]
    let heading: CLLocationDirection?

    @MainActor
    final class Coordinator: NSObject, @preconcurrency MKMapViewDelegate {
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
        let existing = map.annotations.compactMap { $0 as? SpatialContactAnnotation }
        let existingIDs = Set(existing.map(\.nodeID))
        let wantedIDs = Set(contacts.map(\.id))
        map.removeAnnotations(existing.filter { !wantedIDs.contains($0.nodeID) })

        for contact in contacts where !existingIDs.contains(contact.id) {
            map.addAnnotation(SpatialContactAnnotation(contact: contact))
        }

        if map.userTrackingMode == .none {
            map.setUserTrackingMode(.followWithHeading, animated: true)
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
        title = contact.node.label
        subtitle = "Walk within range, then open the Veil"
    }
}
