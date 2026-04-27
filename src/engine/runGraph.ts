import { useGraphStore } from '../store/graphStore'
import { useExecutionStore } from '../store/executionStore'
import { useRunResultStore } from '../store/runResultStore'
import { useRunOutputCacheStore } from '../store/runOutputCacheStore'
import type { NodeOutput } from '../store/executionStore'
import { nodesDownstreamFrom } from './downstreamFrom'
import { buildNodeStampsForGraph, whyPartialRunInvalid } from '../lib/partialRunValidation'
import { outputsMapForNode } from '../lib/portOutputRecord'
import { topologicalSort } from './topologicalSort'
import { getExecutor } from './executors'
import { formatRunSummary } from '../lib/formatRunSummary'
import type { NodeId } from '../types'

type RunMode = 'full' | 'fromNode'

async function runGraphCore(
  fromNodeId: NodeId | undefined,
): Promise<void> {
  const { nodes, edges } = useGraphStore.getState()
  const { setNodeState, setIsRunning, resetAll, setRunAbortController } =
    useExecutionStore.getState()
  const setLastRun = useRunResultStore.getState().setLastRun
  const runMode: RunMode = fromNodeId ? 'fromNode' : 'full'

  if (nodes.size === 0) {
    setLastRun({
      status: 'error',
      summaryText: '',
      error: 'No nodes to run. Load a workflow first.',
    })
    return
  }

  const cacheState = useRunOutputCacheStore.getState()

  if (fromNodeId) {
    if (!nodes.has(fromNodeId)) {
      setLastRun({
        status: 'error',
        summaryText: '',
        error: 'Selected node is not in the graph.',
        runMode: 'fromNode',
        fromNodeId,
      })
      return
    }
    const partialErr = whyPartialRunInvalid(
      fromNodeId,
      nodes,
      edges,
      cacheState.portOutputs,
      cacheState.nodeStamps,
    )
    if (partialErr != null) {
      setLastRun({
        status: 'error',
        summaryText: '',
        error: partialErr,
        runMode: 'fromNode',
        fromNodeId,
      })
      return
    }
  }

  resetAll()
  const ac = new AbortController()
  setRunAbortController(ac)
  setIsRunning(true)
  const runId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now()}`
  setLastRun({
    status: 'running',
    runId,
    summaryText: '',
    error: undefined,
    sourceNodeId: undefined,
    sourceNodeType: undefined,
    startedAt: Date.now(),
    runMode: fromNodeId ? 'fromNode' : 'full',
    fromNodeId: fromNodeId ?? undefined,
  })

  const order = topologicalSort(nodes, edges)
  if (order.length < nodes.size) {
    useExecutionStore.getState().resetAll()
    setRunAbortController(null)
    setIsRunning(false)
    setLastRun({
      status: 'error',
      runId,
      summaryText: '',
      error:
        'Graph has a cycle or disconnected nodes; not all nodes can be executed.',
      runMode,
      fromNodeId: fromNodeId ?? undefined,
    })
    return
  }

  const edgeList = Array.from(edges.values())
  const portRecords = fromNodeId
    ? { ...useRunOutputCacheStore.getState().portOutputs }
    : ({} as Record<string, NodeOutput | undefined>)
  const nodeOutputs = fromNodeId
    ? new Map<string, NodeOutput>(Object.entries(portRecords) as [string, NodeOutput][])
    : new Map<string, NodeOutput>()

  const downstream = fromNodeId
    ? nodesDownstreamFrom(fromNodeId, nodes, edges)
    : null
  const runSet = downstream
  const subOrder: NodeId[] = runSet
    ? order.filter((id) => runSet.has(id))
    : order

  for (const id of order) {
    if (runSet && !runSet.has(id)) {
      setNodeState(id, {
        status: 'done',
        progress: 1,
        outputs: outputsMapForNode(id, portRecords as Record<string, NodeOutput | undefined>),
      })
    } else {
      setNodeState(id, { status: 'queued', progress: 0, outputs: {} })
    }
  }

  let outcome: 'complete' | 'error' | 'cancel' = 'complete'
  const { signal } = ac

  for (const nodeId of subOrder) {
    if (signal.aborted || !useExecutionStore.getState().isRunning) {
      outcome = 'cancel'
      break
    }

    const node = nodes.get(nodeId)
    if (!node) continue

    const inputs: Record<number, NodeOutput | undefined> = {}
    for (const edge of edgeList.filter((e) => e.targetNodeId === nodeId)) {
      inputs[edge.targetPortIndex] = nodeOutputs.get(
        `${edge.sourceNodeId}:${edge.sourcePortIndex}`,
      )
    }

    setNodeState(nodeId, { status: 'running', progress: 0 })

    let streamRaf: number | null = null
    let streamFull: string | null = null
    const queueStreamToNode = (full: string) => {
      streamFull = full
      if (streamRaf == null) {
        streamRaf = requestAnimationFrame(() => {
          streamRaf = null
          if (streamFull != null) {
            setNodeState(nodeId, {
              outputs: { 0: { type: 'TEXT', text: streamFull } },
            })
          }
        })
      }
    }

    try {
      const executor = getExecutor(node.type)
      const outputs = await executor(
        node,
        inputs,
        (progress) => {
          setNodeState(nodeId, { progress })
        },
        {
          signal,
          ...(node.type === 'AppLlm'
            ? { onStreamText: queueStreamToNode }
            : {}),
        },
      )

      if (streamRaf != null) {
        cancelAnimationFrame(streamRaf)
        streamRaf = null
      }

      for (const [portStr, value] of Object.entries(outputs)) {
        nodeOutputs.set(`${nodeId}:${portStr}`, value)
      }

      setNodeState(nodeId, { status: 'done', progress: 1, outputs })
    } catch (err) {
      if (streamRaf != null) {
        cancelAnimationFrame(streamRaf)
        streamRaf = null
      }
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      if (isAbort) {
        outcome = 'cancel'
        setNodeState(nodeId, { status: 'idle', error: undefined })
        break
      }
      const message = err instanceof Error ? err.message : String(err)
      setNodeState(nodeId, {
        status: 'error',
        error: message,
      })
      setLastRun({
        status: 'error',
        runId,
        summaryText: '',
        error: message,
        sourceNodeId: nodeId,
        sourceNodeType: node.type,
        runMode,
        fromNodeId: fromNodeId ?? undefined,
      })
      outcome = 'error'
      break
    }
  }

  if (outcome === 'complete' && subOrder.length > 0) {
    const lastId = subOrder[subOrder.length - 1]!
    const lastNode = nodes.get(lastId)
    const lastState = useExecutionStore.getState().nodeStates.get(lastId)
    if (lastNode && lastState?.status === 'done' && lastState.outputs) {
      const { summary, sourceNodeId, sourceNodeType } = formatRunSummary(
        lastNode,
        lastState.outputs,
      )
      setLastRun({
        status: 'ok',
        runId,
        summaryText: summary,
        error: undefined,
        sourceNodeId,
        sourceNodeType,
        runMode,
        fromNodeId: fromNodeId ?? undefined,
      })
    } else {
      setLastRun({
        status: 'ok',
        runId,
        summaryText: 'Run finished.',
        error: undefined,
        runMode,
        fromNodeId: fromNodeId ?? undefined,
      })
    }
    const snapshotNodes = useGraphStore.getState().nodes
    useRunOutputCacheStore
      .getState()
      .setFromRun(nodeOutputs, buildNodeStampsForGraph(snapshotNodes))
  } else if (outcome === 'cancel' || signal.aborted) {
    setLastRun({
      status: 'cancelled',
      runId,
      error: undefined,
      summaryText: signal.aborted
        ? 'Run was cancelled (including in-flight request).'
        : 'Run was cancelled (Escape or stop between nodes).',
      runMode,
      fromNodeId: fromNodeId ?? undefined,
    })
  }

  useExecutionStore.getState().setIsRunning(false)
  useExecutionStore.getState().clearCancelRequest()
  setRunAbortController(null)
}

export async function runGraph(): Promise<void> {
  return runGraphCore(undefined)
}

export async function runGraphFromNode(nodeId: NodeId): Promise<void> {
  return runGraphCore(nodeId)
}
