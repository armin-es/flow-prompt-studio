import { create } from 'zustand'
import type { Point } from '../types'

type PortKey = string // `${nodeId}:${direction}:${index}`

function portKey(nodeId: string, direction: 'input' | 'output', index: number): PortKey {
  return `${nodeId}:${direction}:${index}`
}

/**
 * Stores port anchor positions in graph space. Nodes write their port
 * positions here whenever they move. EdgeLayer reads from this store
 * reactively — no getBoundingClientRect during drag frames.
 */
interface PortPositionStore {
  positions: Map<PortKey, Point>
  setPortPosition: (
    nodeId: string,
    direction: 'input' | 'output',
    index: number,
    point: Point,
  ) => void
  getPortPosition: (
    nodeId: string,
    direction: 'input' | 'output',
    index: number,
  ) => Point | undefined
}

export const usePortPositionStore = create<PortPositionStore>()((set, get) => ({
  positions: new Map(),

  setPortPosition: (nodeId, direction, index, point) =>
    set((state) => {
      const newPositions = new Map(state.positions)
      newPositions.set(portKey(nodeId, direction, index), point)
      return { positions: newPositions }
    }),

  getPortPosition: (nodeId, direction, index) =>
    get().positions.get(portKey(nodeId, direction, index)),
}))
