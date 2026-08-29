import { afterEach, describe, expect, it, vi } from 'vitest'
import geohash from 'ngeohash'
import {
  bearingDegrees,
  calculateApproxDistance,
  encodeGeohash,
  formatApproxDistance,
  generateGeohashTags,
  GeolocationRequestFailedError,
  geohashCellMapUrl,
  getBrowserLocation,
  parsePublishGeohashInput,
} from './geo'
import type { Event } from './nostrPrimitives'

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

  it('generateGeohashTags includes prefixes beyond length 5 when given longer hash', () => {
    expect(generateGeohashTags('u0m1xd')).toEqual(['u', 'u0', 'u0m', 'u0m1', 'u0m1x', 'u0m1xd'])
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

  describe('parsePublishGeohashInput', () => {
    it('treats empty as default', () => {
      expect(parsePublishGeohashInput('')).toEqual({ kind: 'default' })
      expect(parsePublishGeohashInput('  ')).toEqual({ kind: 'default' })
    })
    it('accepts valid override', () => {
      expect(parsePublishGeohashInput('U0m')).toEqual({ kind: 'override', geohash: 'u0m' })
    })
    it('rejects invalid characters and overlong input', () => {
      expect(parsePublishGeohashInput('ailo')).toEqual({ kind: 'invalid' })
      expect(parsePublishGeohashInput('u'.repeat(13))).toEqual({ kind: 'invalid' })
    })
  })

  describe('formatApproxDistance', () => {
    it('formats without leading tilde', () => {
      expect(formatApproxDistance(2.34)).toBe('2,3 km')
      expect(formatApproxDistance(50)).toBe('50 km')
      expect(formatApproxDistance(0.4)).toBe('400 m')
    })
  })

  describe('bearingDegrees', () => {
    it('returns 0 for due north', () => {
      expect(bearingDegrees({ lat: 48, lon: 11 }, { lat: 49, lon: 11 })).toBeCloseTo(0, 5)
    })
    it('returns ~90 for due east', () => {
      expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 0)
    })
    it('returns null when points coincide', () => {
      expect(bearingDegrees({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBeNull()
    })
  })

  describe('geohashCellMapUrl', () => {
    it('links to esp.info cell viewer for the geohash', () => {
      expect(geohashCellMapUrl('u1hzz')).toBe('https://esp.info/geohash/u1hzz')
    })
    it('rejects invalid geohash characters', () => {
      expect(geohashCellMapUrl('ailo')).toBeNull()
      expect(geohashCellMapUrl('')).toBeNull()
    })
  })

  describe('calculateApproxDistance', () => {
    it('returns text, bearing and geohash cell map URL', () => {
      const evt = {
        tags: [
          ['g', 'u1'],
          ['g', 'u1hzz'],
        ],
      } as Event
      const info = calculateApproxDistance(evt, { lat: 48.14, lon: 11.58 })
      expect(info).not.toBeNull()
      expect(info!.text).toMatch(/m|km/)
      expect(info!.text.startsWith('~')).toBe(false)
      expect(info!.mapUrl).toBe('https://esp.info/geohash/u1hzz')
      expect(info!.bearingDeg).toEqual(expect.any(Number))
    })
  })

  describe('getBrowserLocation', () => {
    it('passes empty PositionOptions when no overrides (browser defaults)', async () => {
      const getCurrentPosition = vi.fn(
        (
          success: PositionCallback,
          _err?: PositionErrorCallback | null,
          _opts?: PositionOptions,
        ) => {
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
      expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({})
    })

    it('forwards custom geolocation options', async () => {
      const getCurrentPosition = vi.fn(
        (
          success: PositionCallback,
          _err?: PositionErrorCallback | null,
          _opts?: PositionOptions,
        ) => {
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

    it('rejects with GeolocationRequestFailedError when permission denied', async () => {
      const getCurrentPosition = vi.fn(
        (_success: PositionCallback, errCb?: PositionErrorCallback | null) => {
          errCb?.({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError)
        },
      )
      vi.stubGlobal('navigator', {
        geolocation: { getCurrentPosition },
      })

      const rejection = await getBrowserLocation().catch((err: unknown) => err)
      expect(rejection).toBeInstanceOf(GeolocationRequestFailedError)
      expect((rejection as GeolocationRequestFailedError).geoCode).toBe(1)
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
