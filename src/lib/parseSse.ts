/**
 * Shapes in `data: JSON` for `/api/complete/stream`.
 * `empty` is internal (blank SSE block / skip).
 */
export type SseMessage =
  | { type: 'empty' }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
