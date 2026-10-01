import Foundation
import CoreLocation
import Combine

@MainActor
final class CoarseLocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var coordinate: CLLocationCoordinate2D?
    private let manager = CLLocationManager()
    private var waiter: CheckedContinuation<CLLocationCoordinate2D?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func acquire() async -> CLLocationCoordinate2D? {
        if let coordinate { return coordinate }
        return await withCheckedContinuation { continuation in
            waiter = continuation
            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                manager.requestLocation()
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            default:
                finish(nil)
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard waiter != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finish(nil)
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let raw = locations.last?.coordinate else { return finish(nil) }
        // Quantize before the coordinate leaves the device. The server only needs a coarse region.
        let coarse = CLLocationCoordinate2D(
            latitude: (raw.latitude * 100).rounded() / 100,
            longitude: (raw.longitude * 100).rounded() / 100
        )
        coordinate = coarse
        finish(coarse)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(nil)
    }

    private func finish(_ value: CLLocationCoordinate2D?) {
        let current = waiter
        waiter = nil
        current?.resume(returning: value)
    }
}
