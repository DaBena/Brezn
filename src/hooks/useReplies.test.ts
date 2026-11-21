import { describe, expect, test } from 'vitest'
import { threadReplyETagValues } from './useReplies'

describe('threadReplyETagValues', () => {
  test('starts with root and appends unique reply ids', () => {
    expect(threadReplyETagValues('root', ['a', 'b', 'a', '', 'root'])).toEqual(['root', 'a', 'b'])
  })
})
