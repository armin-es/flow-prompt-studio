import { describe, expect, it } from 'vitest'
import { parseSseBlock } from './completeStream'

describe('parseSseBlock', () => {
  it('parses token messages', () => {
    const b = 'data: {"type":"token","text":"hi"}\n'
    expect(parseSseBlock(b)).toEqual({ type: 'token', text: 'hi' })
  })

  it('parses done', () => {
    const b = 'data: {"type":"done"}\n'
    expect(parseSseBlock(b)).toEqual({ type: 'done' })
  })
})
