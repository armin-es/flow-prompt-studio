/** pgvector literal for parameterized queries (`$1::vector`). */
export function vectorToPgLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`
}
