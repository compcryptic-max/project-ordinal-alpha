// Regional weather uses coarse cell centers, never precise player coordinates.
export function createEnvironmentService({fetcher = fetch, clock = Date.now, enabled = true} = {}) {
  const cache = new Map(), pending = new Map();
  function keyFor(region) {
    const match = /^c1200:(-?\d+):(-?\d+)$/.exec(region);
    if (!match) return null;
    const lat = (Number(match[1]) + .5) / 90, lon = (Number(match[2]) + .5) / 90;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [Math.round(lat * 10) / 10, Math.round(lon * 10) / 10];
  }
  async function refresh(key, coordinates) {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({latitude: coordinates[0], longitude: coordinates[1], current: 'rain,is_day,temperature_2m', timezone: 'auto', timeformat: 'unixtime', forecast_days: '1'}).toString();
      const response = await fetcher(url, {signal: AbortSignal.timeout(4000)});
      if (!response.ok) throw Error('Weather unavailable');
      const data = await response.json(), current = data.current;
      if (!current || !Number.isFinite(current.time) || !Number.isFinite(current.rain) || current.rain < 0 || ![0,1].includes(current.is_day) || typeof data.timezone !== 'string') throw Error('Invalid weather');
      new Intl.DateTimeFormat('en', {timeZone: data.timezone});
      const observedAt = current.time * 1000;
      if (Math.abs(clock() - observedAt) > 60 * 60 * 1000) throw Error('Outdated weather');
      cache.set(key, {updatedAt: clock(), retryAt: clock() + 15 * 60 * 1000, observedAt, rain: current.rain, isDay: current.is_day === 1, timezone: data.timezone});
    } catch {
      cache.set(key, {...cache.get(key), retryAt: clock() + 60000});
    } finally { pending.delete(key); }
  }
  function read(region) {
    const coordinates = keyFor(region);
    if (!enabled || !coordinates) return {status: 'unavailable', rainBoost: false};
    const key = coordinates.join(','), now = clock(), entry = cache.get(key);
    if ((!entry || now >= entry.retryAt) && !pending.has(key)) {
      if (cache.size >= 256 && !cache.has(key)) cache.delete(cache.keys().next().value);
      // Limit concurrent external requests rather than growing an unbounded queue.
      if (pending.size < 4) pending.set(key, Promise.resolve().then(() => refresh(key, coordinates)));
    }
    if (!entry?.updatedAt) return {status: 'unavailable', rainBoost: false};
    const fresh = now - entry.observedAt <= 30 * 60 * 1000 && now - entry.updatedAt <= 20 * 60 * 1000;
    return {status: fresh ? 'current' : 'stale', rainBoost: fresh && entry.rain > 0, rain: entry.rain, isDay: entry.isDay, timezone: entry.timezone, observedAt: entry.observedAt, source: 'Open-Meteo'};
  }
  return {read, settled: () => Promise.all([...pending.values()])};
}
