import Foundation
import CoreLocation
import Combine

@MainActor
final class CoarseLocationService: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    /// Precise position is kept on-device for the live map and walking proximity.
    @Published private(set) var coordinate: CLLocationCoordinate2D?
    @Published private(set) var heading: CLLocationDirection?
    @Published private(set) var horizontalAccuracy: CLLocationAccuracy?
    @Published private(set) var sampleToken = 0
    @Published private(set) var rapidTravel = false
    @Published private(set) var relocationToken = ""

    var serverCoordinate: CLLocationCoordinate2D? { coarseCoordinate }

    private let manager = CLLocationManager()
    private var waiter: CheckedContinuation<CLLocationCoordinate2D?, Never>?
    private var monitoringRequested = false
    private var fastSamples = 0
    private var coarseCoordinate: CLLocationCoordinate2D?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.headingFilter = 4
    }

    func acquire() async -> CLLocationCoordinate2D? {
        if let coarseCoordinate { return coarseCoordinate }
        return await withCheckedContinuation { continuation in
            waiter = continuation
            requestPermissionOrLocation()
        }
    }

    func startSafetyMonitoring() {
        monitoringRequested = true
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.activityType = .fitness

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            rapidTravel = false
        }
    }

    func stopSafetyMonitoring() {
        monitoringRequested = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
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
            if monitoringRequested {
                manager.startUpdatingLocation()
                if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
            }
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

        // Exact location powers the local spatial map and never leaves this service.
        coordinate = raw.coordinate
        horizontalAccuracy = raw.horizontalAccuracy >= 0 ? raw.horizontalAccuracy : nil
        sampleToken &+= 1

        // Quantize anything returned to the world server. It only needs a coarse region.
        let coarse = CLLocationCoordinate2D(
            latitude: (raw.coordinate.latitude * 100).rounded() / 100,
            longitude: (raw.coordinate.longitude * 100).rounded() / 100
        )
        coarseCoordinate = coarse
        let token = String(format: "%.2f,%.2f", coarse.latitude, coarse.longitude)
        if token != relocationToken {
            relocationToken = token
        }

        if waiter != nil {
            finish(coarse)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        let value = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        heading = value
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
