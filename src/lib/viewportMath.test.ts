import { describe, it, expect } from 'vitest'
import { toGraphSpace, toScreenSpace } from './viewportMath'

const v = { translateX: 10, translateY: 20, scale: 2 }

describe('viewportMath', () => {
  it('converts screen to graph: identity at origin of graph space (0,0) maps to (translateX, translateY) screen', () => {
    const g = toGraphSpace(10, 20, v)
    expect(g.x).toBe(0)
    expect(g.y).toBe(0)
  })

  it('round-trips a graph point at scale 2', () => {
    const screen = toScreenSpace(100, 50, v)
    const back = toGraphSpace(screen.x, screen.y, v)
    expect(back.x).toBeCloseTo(100)
    expect(back.y).toBeCloseTo(50)
  })
})
