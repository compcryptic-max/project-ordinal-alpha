import Foundation
import CoreLocation
import Combine

@MainActor
final class CoarseLocationService: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var coordinate: CLLocationCoordinate2D?
    @Published private(set) var rapidTravel = false

    private let manager = CLLocationManager()
    private var waiter: CheckedContinuation<CLLocationCoordinate2D?, Never>?
    private var monitoringRequested = false
    private var fastSamples = 0

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func acquire() async -> CLLocationCoordinate2D? {
        if let coordinate { return coordinate }
        return await withCheckedContinuation { continuation in
            waiter = continuation
            requestPermissionOrLocation()
        }
    }

    func startSafetyMonitoring() {
        monitoringRequested = true
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 30
        manager.activityType = .otherNavigation

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            rapidTravel = false
        }
    }

    func stopSafetyMonitoring() {
        monitoringRequested = false
        manager.stopUpdatingLocation()
        fastSamples = 0
        rapidTravel = false
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.distanceFilter = kCLDistanceFilterNone
    }

    private func requestPermissionOrLocation() {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            finish(nil)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            if waiter != nil { manager.requestLocation() }
            if monitoringRequested { manager.startUpdatingLocation() }
        case .denied, .restricted:
            finish(nil)
            stopSafetyMonitoring()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let raw = locations.last else {
            if waiter != nil { finish(nil) }
            return
        }

        // Speed is evaluated only on-device. Two sustained vehicle-speed samples pause interaction.
        if monitoringRequested, raw.speed >= 0 {
            if raw.speed > 8.5 {
                fastSamples = min(3, fastSamples + 1)
            } else if raw.speed < 4 {
                fastSamples = 0
            }
            rapidTravel = fastSamples >= 2
        }

        // Quantize before the coordinate leaves the device. The server only needs a coarse region.
        let coarse = CLLocationCoordinate2D(
            latitude: (raw.coordinate.latitude * 100).rounded() / 100,
            longitude: (raw.coordinate.longitude * 100).rounded() / 100
        )
        coordinate = coarse

        if waiter != nil {
            finish(coarse)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if waiter != nil { finish(nil) }
    }

    private func finish(_ value: CLLocationCoordinate2D?) {
        let current = waiter
        waiter = nil
        current?.resume(returning: value)
    }
}
