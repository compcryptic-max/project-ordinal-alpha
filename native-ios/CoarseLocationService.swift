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
    private var waiters: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
    private var acquisitionTimeout: Task<Void, Never>?
    private var freshnessTimeout: Task<Void, Never>?
    private var lastFixAt: Date?
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
        if let lastFixAt, Date().timeIntervalSince(lastFixAt) <= 15,
           let coarseCoordinate { return coarseCoordinate }
        return await withCheckedContinuation { continuation in
            waiters.append(continuation)
            guard waiters.count == 1 else { return }
            acquisitionTimeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(12)) } catch { return }
                self?.finish(nil)
            }
            requestPermissionOrLocation()
        }
    }

    func startSafetyMonitoring() {
        monitoringRequested = true
        manager.desiredAccuracy = kCLLocationAccuracyBest
        // Keep fixes fresh while standing still to aim at a contact.
        manager.distanceFilter = kCLDistanceFilterNone
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
        invalidatePosition()
        finish(nil)
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
            if !waiters.isEmpty { manager.requestLocation() }
            if monitoringRequested {
                manager.startUpdatingLocation()
                if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
            }
        case .denied, .restricted:
            stopSafetyMonitoring()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard monitoringRequested || !waiters.isEmpty else { return }
        guard let raw = locations.last,
              abs(raw.timestamp.timeIntervalSinceNow) <= 15,
              raw.horizontalAccuracy >= 0 else {
            if !waiters.isEmpty { finish(nil) }
            return
        }

        // Speed stays on-device. Above 15 mph pauses interaction immediately;
        // resume only below 4 m/s to avoid threshold flicker.
        if monitoringRequested, raw.speed >= 0 {
            if raw.speed > 6.7056 {
                fastSamples = 2
            } else if raw.speed < 4 {
                fastSamples = 0
            }
            rapidTravel = fastSamples >= 2
        }

        // Exact location powers Maps locally and is never included in the Ordinal server API.
        coordinate = raw.coordinate
        lastFixAt = raw.timestamp
        horizontalAccuracy = raw.horizontalAccuracy >= 0 ? raw.horizontalAccuracy : nil
        sampleToken &+= 1
        freshnessTimeout?.cancel()
        let remaining = max(0, 15 - Date().timeIntervalSince(raw.timestamp))
        freshnessTimeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
            self?.invalidatePosition()
        }

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

        if !waiters.isEmpty {
            finish(coarse)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard monitoringRequested, newHeading.headingAccuracy >= 0 else { return }
        let value = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        heading = value
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if !waiters.isEmpty { finish(nil) }
    }

    private func invalidatePosition() {
        freshnessTimeout?.cancel()
        freshnessTimeout = nil
        coordinate = nil
        coarseCoordinate = nil
        lastFixAt = nil
        horizontalAccuracy = nil
        heading = nil
        relocationToken = ""
        sampleToken &+= 1
    }

    private func finish(_ value: CLLocationCoordinate2D?) {
        acquisitionTimeout?.cancel()
        acquisitionTimeout = nil
        let current = waiters
        waiters.removeAll()
        for waiter in current { waiter.resume(returning: value) }
    }
}
