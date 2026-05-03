import { describe, expect, it } from 'vitest'
import { truncateFeedCardContent } from './feedContentPreview'

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
