import { describe, expect, test } from 'vitest'
import type { Event } from './nostrPrimitives'
import { replyDepthById, replyIndentClass, replyParentId, threadRootEventId } from './nip10Thread'

function note(id: string, eTags: string[][]): Event {
  return {
    id,
    pubkey: 'pk',
    created_at: 1,
    kind: 1,
    tags: eTags,
    content: '',
    sig: '',
  }
}

describe('threadRootEventId', () => {
  test('prefers marked root', () => {
    expect(
      threadRootEventId(
        note('c', [
          ['e', 'root', '', 'root'],
          ['e', 'parent', '', 'reply'],
        ]),
      ),
    ).toBe('root')
  })

  test('uses first e when unmarked', () => {
    expect(
      threadRootEventId(
        note('c', [
          ['e', 'root'],
          ['e', 'parent'],
        ]),
      ),
    ).toBe('root')
  })

  test('null for notes without e tags', () => {
    expect(threadRootEventId(note('root', []))).toBeNull()
  })
})

describe('replyParentId', () => {
  test('prefers marked reply', () => {
    expect(
      replyParentId(
        note('c', [
          ['e', 'root', '', 'root'],
          ['e', 'parent', '', 'reply'],
        ]),
      ),
    ).toBe('parent')
  })

  test('uses last e when unmarked', () => {
    expect(
      replyParentId(
        note('c', [
          ['e', 'root'],
          ['e', 'parent'],
        ]),
      ),
    ).toBe('parent')
  })
})

describe('replyDepthById', () => {
  test('direct replies are depth 0; nested are deeper', () => {
    const a = note('a', [
      ['e', 'root', '', 'root'],
      ['e', 'root', '', 'reply'],
    ])
    const b = note('b', [
      ['e', 'root', '', 'root'],
      ['e', 'a', '', 'reply'],
    ])
    const map = replyDepthById('root', [a, b])
    expect(map.get('a')).toBe(0)
    expect(map.get('b')).toBe(1)
  })
})

describe('replyIndentClass', () => {
  test('maps depth to padding classes', () => {
    expect(replyIndentClass(0)).toBe('')
    expect(replyIndentClass(1)).toBe('pl-3')
    expect(replyIndentClass(2)).toBe('pl-6')
  })
})
