/**
 * Shipped with **Retrieve** so a new node runs without pasting. Includes BM25–friendly
 * text so `?demo=rag` with query “What is BM25?” surfaces this passage.
 */
export const DEFAULT_RETRIEVE_CORPUS = [
  `# BM25

BM25 (Best Matching 25) is a family of bag-of-words scoring functions for ranking documents by relevance to a query. It combines term frequency with inverse document length normalization and is a classic lexical baseline in information retrieval.`,

  `# Graph execution

A directed acyclic graph (DAG) of nodes is executed in topological order. Upstream outputs fill downstream inputs so each node runs once all dependencies are complete.`,

  `# Token streaming

Large language model responses can be streamed as tokens. The client coalesces updates with \`requestAnimationFrame\` so the interface stays responsive.`,

  `# Prompting tips

Be explicit about the desired output format. Ground answers in the provided context when doing retrieval-style tasks.`,

  `# Caching partial runs

When re-running from a selected node, upstream port values may be reused if their per-node “content stamp” still matches the saved cache.`,

].join('\n\n---\n\n')
