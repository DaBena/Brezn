import { describe, expect, it } from 'vitest'
import { mergeKind0IntoCacheRow } from './profileMetadataCache'

describe('mergeKind0IntoCacheRow', () => {
  it('returns null for non-kind-0', () => {
    expect(
      mergeKind0IntoCacheRow(undefined, { kind: 1, pubkey: 'p', created_at: 1, content: '{}' }, 0),
    ).toBeNull()
  })

  it('inserts when no existing row', () => {
    const row = mergeKind0IntoCacheRow(
      undefined,
      { kind: 0, pubkey: 'ab', created_at: 10, content: '{"name":"A"}' },
      99,
    )
    expect(row).toMatchObject({
      pubkey: 'ab',
      createdAt: 10,
      storedAt: 99,
      content: '{"name":"A"}',
    })
  })

  it('rejects older relay event than cache', () => {
    const existing = {
      pubkey: 'ab',
      createdAt: 20,
      content: '{}',
      storedAt: 1,
    }
    expect(
      mergeKind0IntoCacheRow(existing, { kind: 0, pubkey: 'ab', created_at: 10, content: '{}' }, 2),
    ).toBeNull()
  })

  it('bumps storedAt when same created_at and content', () => {
    const existing = {
      pubkey: 'ab',
      createdAt: 10,
      content: '{"name":"A"}',
      storedAt: 1,
    }
    const row = mergeKind0IntoCacheRow(
      existing,
      { kind: 0, pubkey: 'ab', created_at: 10, content: '{"name":"A"}' },
      50,
    )
    expect(row).toMatchObject({ storedAt: 50, createdAt: 10 })
  })

  it('replaces when newer created_at', () => {
    const existing = {
      pubkey: 'ab',
      createdAt: 10,
      content: '{}',
      storedAt: 1,
    }
    const row = mergeKind0IntoCacheRow(
      existing,
      { kind: 0, pubkey: 'ab', created_at: 11, content: '{"name":"B"}' },
      3,
    )
    expect(row?.content).toBe('{"name":"B"}')
    expect(row?.createdAt).toBe(11)
  })
})
