// @vitest-environment node
import { describe, expect, test } from 'vitest'
import {
  looksLikeIsoBmff,
  stripMp4ContainerMetadata,
  stripMp4MetadataInPlace,
} from './stripMp4Metadata'

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, false)
  return b
}

function fourcc(s: string): Uint8Array {
  return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)])
}

/** Build a simple ISO BMFF box: [size][type][payload] */
function box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length
  const out = new Uint8Array(size)
  out.set(u32be(size), 0)
  out.set(fourcc(type), 4)
  out.set(payload, 8)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

describe('stripMp4MetadataInPlace', () => {
  test('detects ftyp as ISO BMFF', () => {
    const ftyp = box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom')))
    expect(looksLikeIsoBmff(ftyp)).toBe(true)
  })

  test('converts nested udta to free and zeros payload', () => {
    const gpsPayload = new TextEncoder().encode('+48.2082+016.3738/')
    const udta = box('udta', box('©xyz', gpsPayload))
    const moov = box('moov', udta)
    const ftyp = box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom')))
    const mdat = box('mdat', new Uint8Array([0, 1, 2, 3]))
    const file = concat(ftyp, moov, mdat)
    const copy = new Uint8Array(file)

    const n = stripMp4MetadataInPlace(copy)
    expect(n).toBeGreaterThanOrEqual(1)

    // udta type bytes (inside moov, after moov header) should now be 'free'
    const moovStart = ftyp.length
    const udtaTypeOffset = moovStart + 8 + 4
    expect(String.fromCharCode(...copy.slice(udtaTypeOffset, udtaTypeOffset + 4))).toBe('free')

    // GPS payload must be gone
    const asText = new TextDecoder().decode(copy)
    expect(asText.includes('+48.2082')).toBe(false)

    // File size unchanged (offsets stay valid)
    expect(copy.length).toBe(file.length)

    // mdat payload intact
    expect([...copy.slice(copy.length - 4)]).toEqual([0, 1, 2, 3])
  })

  test('strips top-level meta box', () => {
    const ftyp = box('ftyp', concat(fourcc('mp41'), u32be(0), fourcc('mp41')))
    // meta is a FullBox: version/flags + children
    const metaPayload = concat(u32be(0), box('ilst', new TextEncoder().encode('secret-device')))
    const meta = box('meta', metaPayload)
    const moov = box('moov', meta)
    const file = concat(ftyp, moov)
    const copy = new Uint8Array(file)

    stripMp4MetadataInPlace(copy)
    expect(new TextDecoder().decode(copy).includes('secret-device')).toBe(false)
  })

  test('strips uuid boxes (XMP / proprietary)', () => {
    const usertype = new Uint8Array(16).fill(0xab)
    const xmp = new TextEncoder().encode('<x:xmpmeta>gps-secret</x:xmpmeta>')
    const uuid = box('uuid', concat(usertype, xmp))
    const ftyp = box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom')))
    const moov = box('moov', uuid)
    const file = concat(ftyp, moov)
    const copy = new Uint8Array(file)

    const n = stripMp4MetadataInPlace(copy)
    expect(n).toBeGreaterThanOrEqual(1)
    const uuidTypeOffset = ftyp.length + 8 + 4
    expect(String.fromCharCode(...copy.slice(uuidTypeOffset, uuidTypeOffset + 4))).toBe('free')
    expect(new TextDecoder().decode(copy).includes('gps-secret')).toBe(false)
  })

  test('zeros creation/modification times in mvhd (version 0)', () => {
    // mvhd v0 payload: version/flags + creation + modification + timescale + duration + rest
    const creation = u32be(0x12345678)
    const modification = u32be(0x9abcdef0)
    const rest = concat(u32be(1000), u32be(5000), new Uint8Array(76)) // timescale, duration, padding
    const mvhdPayload = concat(u32be(0), creation, modification, rest)
    const ftyp = box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom')))
    const moov = box('moov', box('mvhd', mvhdPayload))
    const file = concat(ftyp, moov)
    const copy = new Uint8Array(file)

    const n = stripMp4MetadataInPlace(copy)
    expect(n).toBeGreaterThanOrEqual(1)

    const mvhdContent = ftyp.length + 8 + 8 // moov hdr + mvhd hdr
    // version/flags untouched
    expect([...copy.slice(mvhdContent, mvhdContent + 4)]).toEqual([0, 0, 0, 0])
    // creation + modification zeroed
    expect([...copy.slice(mvhdContent + 4, mvhdContent + 12)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    // timescale preserved
    expect([...copy.slice(mvhdContent + 12, mvhdContent + 16)]).toEqual([...u32be(1000)])
  })

  test('zeros creation/modification times in tkhd (version 1)', () => {
    const u64 = (hi: number, lo: number) => concat(u32be(hi), u32be(lo))
    const mvhdLike = concat(
      new Uint8Array([1, 0, 0, 0]), // version 1
      u64(1, 2), // creation
      u64(3, 4), // modification
      u32be(1), // track_ID
      u32be(0), // reserved
      u64(0, 100), // duration
      new Uint8Array(60),
    )
    const ftyp = box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom')))
    const trak = box('trak', box('tkhd', mvhdLike))
    const moov = box('moov', trak)
    const copy = new Uint8Array(concat(ftyp, moov))

    stripMp4MetadataInPlace(copy)
    const tkhdContent = ftyp.length + 8 + 8 + 8 // moov + trak + tkhd headers
    expect([...copy.slice(tkhdContent + 4, tkhdContent + 20)]).toEqual(new Array(16).fill(0))
    // track_ID preserved
    expect([...copy.slice(tkhdContent + 20, tkhdContent + 24)]).toEqual([...u32be(1)])
  })
})

describe('stripMp4ContainerMetadata', () => {
  test('returns cleaned File for .mp4', async () => {
    const gpsPayload = new TextEncoder().encode('+1.0000+2.0000/')
    const fileBytes = concat(
      box('ftyp', concat(fourcc('isom'), u32be(0), fourcc('isom'))),
      box('moov', box('udta', box('©xyz', gpsPayload))),
      box('mdat', new Uint8Array([9])),
    )
    const input = new File([fileBytes], 'Holiday_Mallorca.mp4', { type: 'video/mp4' })
    const out = await stripMp4ContainerMetadata(input)
    expect(out.name).toBe('video.mp4')
    expect(out.type).toBe('video/mp4')
    const buf = new Uint8Array(await out.arrayBuffer())
    expect(new TextDecoder().decode(buf).includes('+1.0000')).toBe(false)
  })

  test('leaves non-mp4 video untouched', async () => {
    const webm = new File([new Uint8Array([1, 2, 3, 4])], 'clip.webm', { type: 'video/webm' })
    const out = await stripMp4ContainerMetadata(webm)
    expect(out).toBe(webm)
  })
})
