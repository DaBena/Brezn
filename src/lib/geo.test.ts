import { afterEach, describe, expect, it, vi } from 'vitest'
import geohash from 'ngeohash'
import { encodeGeohash, generateGeohashTags, getBrowserLocation } from './geo'

describe('geo', () => {
  it('encodeGeohash returns ngeohash.encode with correct length', () => {
    const p = { lat: 10.0, lon: 20.0 }
    expect(encodeGeohash(p, 4)).toBe(geohash.encode(p.lat, p.lon, 4))
    expect(encodeGeohash(p, 6)).toHaveLength(6)
  })

  it('generateGeohashTags generates all prefixes from 1 to 5', () => {
    const geo5 = 'u0m1x'
    const tags = generateGeohashTags(geo5)
    expect(tags).toEqual(['u', 'u0', 'u0m', 'u0m1', 'u0m1x'])
    expect(tags).toHaveLength(5)
  })

  it('generateGeohashTags generates prefixes only up to actual length', () => {
    const geo3 = 'u0m'
    const tags = generateGeohashTags(geo3)
    // Function generates only prefixes up to actual length (no padding)
    expect(tags).toEqual(['u', 'u0', 'u0m'])
    expect(tags).toHaveLength(3)
  })

  it('generateGeohashTags handles empty string', () => {
    expect(generateGeohashTags('')).toEqual([])
  })

  it('getBrowserLocation uses fast defaults (no high accuracy)', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _err?: PositionErrorCallback | null, _opts?: PositionOptions) => {
        success({
          coords: { latitude: 5.5, longitude: -3.3 } as GeolocationCoordinates,
        } as GeolocationPosition)
      },
    )
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
    })

    const pos = await getBrowserLocation()
    expect(pos).toEqual({ lat: 5.5, lon: -3.3 })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60_000,
    })
  })

  it('getBrowserLocation forwards custom geolocation options', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _err?: PositionErrorCallback | null, _opts?: PositionOptions) => {
        success({
          coords: { latitude: 1.0, longitude: 2.0 } as GeolocationCoordinates,
        } as GeolocationPosition)
      },
    )
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
    })

    await getBrowserLocation({ enableHighAccuracy: true, timeoutMs: 2000, maximumAgeMs: 5000 })
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 2000,
      maximumAge: 5000,
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
