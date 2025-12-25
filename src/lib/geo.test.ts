import { describe, expect, it } from 'vitest'
import geohash from 'ngeohash'
import { encodeGeohash, generateGeohashTags } from './geo'

describe('geo', () => {
  it('encodeGeohash returns ngeohash.encode with correct length', () => {
    const p = { lat: 48.137154, lon: 11.576124 } // Munich
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
})

