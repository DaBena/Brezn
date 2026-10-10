import { describe, expect, it } from 'vitest'
import { truncateFeedCardContent, truncateFeedCardContentAroundQuery } from './feedContentPreview'

describe('truncateFeedCardContent', () => {
  it('keeps plain https URLs in the preview when under the flow limit', () => {
    const content = 'See https://example.com/page for details.'
    expect(truncateFeedCardContent(content)).toContain('https://example.com/page')
  })

  it('still strips inline image URLs but lists them after the body', () => {
    const content = 'Photo https://cdn.example.com/x.jpg end'
    const out = truncateFeedCardContent(content)
    expect(out).toContain('Photo ')
    expect(out).toContain(' end')
    expect(out).toContain('https://cdn.example.com/x.jpg')
    expect(out.indexOf('https://cdn.example.com/x.jpg')).toBeGreaterThan(
      content.indexOf('https://cdn.example.com/x.jpg'),
    )
  })
})

describe('truncateFeedCardContentAroundQuery', () => {
  it('starts the preview near the first query hit', () => {
    const content = `${'alpha '.repeat(30)}Best Brezn in town`
    const out = truncateFeedCardContentAroundQuery(content, 'brezn')
    expect(out).toContain('Brezn')
    expect(out.startsWith('...')).toBe(true)
    expect(out.indexOf('alpha')).toBeGreaterThan(0)
  })
})
