import { describe, expect, it } from 'vitest'
import geohash from 'ngeohash'
import { encodeGeohash } from './geo'

describe('geo', () => {
  it('encodeGeohash returns ngeohash.encode with correct length', () => {
    const p = { lat: 48.137154, lon: 11.576124 } // Munich
    expect(encodeGeohash(p, 4)).toBe(geohash.encode(p.lat, p.lon, 4))
    expect(encodeGeohash(p, 6)).toHaveLength(6)
  })
})

