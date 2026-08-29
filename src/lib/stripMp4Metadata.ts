/**
 * Strip container metadata from MP4/MOV (ISO BMFF / QuickTime) without re-encoding.
 *
 * - Sensitive boxes (udta, meta, uuid, location atoms, …) → equal-sized `free` (offsets stay valid)
 * - Creation/modification times in mvhd / tkhd / mdhd → zeroed
 */

const STRIP_TYPES = new Set([
  'udta',
  'meta',
  'uuid', // proprietary / XMP extensions
  'loci',
  '©xyz', // QuickTime GPS (0xA9xyz)
  'xyz ',
  'GPS ',
  'tags',
  'ilst',
  'keys',
])

/** Movie / track / media headers with creation_time + modification_time. */
const TIME_HEADER_TYPES = new Set(['mvhd', 'tkhd', 'mdhd'])

/** Boxes that contain nested boxes we may need to walk. */
const CONTAINER_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'dinf',
  'stbl',
  'edts',
  'mvex',
  'moof',
  'traf',
  'mfra',
  'skip',
  'udta',
  'meta',
  'ilst',
  'keys',
])

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function readU64AsNumber(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false)
  const lo = view.getUint32(offset + 4, false)
  return hi * 0x1_0000_0000 + lo
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  )
}

function writeType(bytes: Uint8Array, offset: number, type: string) {
  bytes[offset] = type.charCodeAt(0)
  bytes[offset + 1] = type.charCodeAt(1)
  bytes[offset + 2] = type.charCodeAt(2)
  bytes[offset + 3] = type.charCodeAt(3)
}

function rangeHasNonZero(bytes: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (bytes[i] !== 0) return true
  }
  return false
}

/**
 * Zero creation_time + modification_time in an mvhd/tkhd/mdhd FullBox payload.
 * Layout (ISO/IEC 14496-12): version/flags, then times as u32 (v0) or u64 (v1).
 */
function clearCreationModificationTimes(
  bytes: Uint8Array,
  contentStart: number,
  contentEnd: number,
): boolean {
  if (contentStart + 4 > contentEnd) return false
  const version = bytes[contentStart]!
  const timesStart = contentStart + 4
  if (version === 1) {
    if (timesStart + 16 > contentEnd) return false
    if (!rangeHasNonZero(bytes, timesStart, timesStart + 16)) return false
    bytes.fill(0, timesStart, timesStart + 16)
    return true
  }
  // version 0 (and treat other versions like v0 if the classic 8-byte fields fit)
  if (timesStart + 8 > contentEnd) return false
  if (!rangeHasNonZero(bytes, timesStart, timesStart + 8)) return false
  bytes.fill(0, timesStart, timesStart + 8)
  return true
}

export function looksLikeIsoBmff(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  const type = boxType(bytes, 4)
  return (
    type === 'ftyp' ||
    type === 'moov' ||
    type === 'mdat' ||
    type === 'free' ||
    type === 'wide' ||
    type === 'skip' ||
    type === 'pnot' ||
    type === 'uuid'
  )
}

export function isMp4OrMovFile(file: File): boolean {
  const mime = (file.type ?? '').toLowerCase()
  const name = (file.name ?? '').toLowerCase()
  return (
    mime === 'video/mp4' ||
    mime === 'video/quicktime' ||
    mime === 'video/x-m4v' ||
    name.endsWith('.mp4') ||
    name.endsWith('.mov') ||
    name.endsWith('.m4v')
  )
}

/**
 * Walk ISO BMFF boxes in `[rangeStart, rangeEnd)`:
 * strip privacy boxes to `free`, zero header timestamps.
 * @returns number of mutations applied
 */
export function stripMp4MetadataInPlace(bytes: Uint8Array): number {
  if (!looksLikeIsoBmff(bytes)) return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let mutations = 0

  function walk(rangeStart: number, rangeEnd: number) {
    let offset = rangeStart
    while (offset + 8 <= rangeEnd) {
      const sizeField = readU32(view, offset)
      const type = boxType(bytes, offset + 4)
      let headerSize = 8
      let boxSize: number

      if (sizeField === 1) {
        if (offset + 16 > rangeEnd) break
        boxSize = readU64AsNumber(view, offset + 8)
        headerSize = 16
      } else if (sizeField === 0) {
        boxSize = rangeEnd - offset
      } else {
        boxSize = sizeField
      }

      if (boxSize < headerSize || offset + boxSize > rangeEnd) break

      const contentStart = offset + headerSize
      const contentEnd = offset + boxSize

      if (STRIP_TYPES.has(type)) {
        writeType(bytes, offset + 4, 'free')
        bytes.fill(0, contentStart, contentEnd)
        mutations++
      } else if (TIME_HEADER_TYPES.has(type)) {
        if (clearCreationModificationTimes(bytes, contentStart, contentEnd)) mutations++
      } else if (CONTAINER_TYPES.has(type)) {
        let childStart = contentStart
        // FullBox: version + flags before children
        if (type === 'meta' && childStart + 4 <= contentEnd) {
          childStart += 4
        }
        walk(childStart, contentEnd)
      }

      if (sizeField === 0) break
      offset += boxSize
    }
  }

  walk(0, bytes.length)
  return mutations
}

/**
 * Returns a new File with container metadata / timestamps removed when the file is MP4/MOV.
 * Always uses a neutral filename. On parse failure or non-ISO-BMFF input, returns the original.
 */
export async function stripMp4ContainerMetadata(file: File): Promise<File> {
  if (!isMp4OrMovFile(file)) return file

  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0))
    if (!looksLikeIsoBmff(bytes)) return file

    stripMp4MetadataInPlace(bytes)

    const name = (file.name ?? '').toLowerCase()
    const mime = (file.type ?? '').toLowerCase()
    const isMov =
      name.endsWith('.mov') || mime === 'video/quicktime' || mime.includes('quicktime')
    const outName = isMov ? 'video.mov' : 'video.mp4'
    const outType = file.type || (isMov ? 'video/quicktime' : 'video/mp4')

    return new File([bytes], outName, { type: outType, lastModified: Date.now() })
  } catch {
    return file
  }
}
