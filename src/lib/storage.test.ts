import { describe, expect, it, vi } from 'vitest'
import { loadJson, saveJson } from './storage'

describe('storage', () => {
  it('loadJson returns fallback when missing', () => {
    localStorage.removeItem('k')
    expect(loadJson('k', { a: 1 })).toEqual({ a: 1 })
  })

  it('saveJson + loadJson roundtrip', () => {
    saveJson('k2', { ok: true, n: 123 })
    expect(loadJson('k2', { ok: false, n: 0 })).toEqual({ ok: true, n: 123 })
  })

  it('loadJson returns fallback on invalid JSON', () => {
    localStorage.setItem('k3', '{not json')
    expect(loadJson('k3', ['x'])).toEqual(['x'])
  })

  it('saveJson swallows storage errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveJson('k4', { a: 1 })).not.toThrow()
    spy.mockRestore()
  })
})

