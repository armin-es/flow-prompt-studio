import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/** v1 graph JSON: nodes, edges, selection, plus version */
export type SerializedGraphJson = {
  version: 1
  nodes: [string, unknown][]
  edges: [string, unknown][]
  selection: string[]
  edgeSelection: string[]
}

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const graphs = pgTable('graphs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text('user_id')
    .references(() => users.id)
    .notNull(),
  name: text('name').notNull(),
  data: jsonb('data').$type<SerializedGraphJson>().notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  slug: text('slug'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/** Corpus slug (`id`) is unique per user — composite PK `(user_id, id)`. */
export const corpora = pgTable(
  'corpora',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    body: text('body').notNull().default(''),
    chunkSize: integer('chunk_size').notNull().default(800),
    chunkOverlap: integer('chunk_overlap').notNull().default(20),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.id] }),
    corporaUserIdx: index('corpora_user_idx').on(t.userId),
  }),
)

export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    corpusUserId: text('corpus_user_id')
      .notNull()
      .references(() => users.id),
    corpusId: text('corpus_id').notNull(),
    title: text('title').notNull(),
    sha256: text('sha256').notNull(),
    body: text('body').notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (t) => ({
    corpusFk: foreignKey({
      columns: [t.corpusUserId, t.corpusId],
      foreignColumns: [corpora.userId, corpora.id],
    }).onDelete('cascade'),
    documentsCorpusIdx: index('documents_corpus_idx').on(t.corpusUserId, t.corpusId),
  }),
)

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    /** 1-based paragraph start (citation / chunker) */
    paragraphIndex: integer('paragraph_index').notNull(),
    partIndex: integer('part_index').notNull(),
    source: text('source').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (t) => [index('chunks_doc_idx').on(t.documentId)],
)

export const runs = pgTable('runs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text('user_id')
    .references(() => users.id)
    .notNull(),
  graphId: uuid('graph_id').references(() => graphs.id, { onDelete: 'cascade' }),
  status: text('status').$type<'ok' | 'error' | 'cancelled'>().notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  summary: text('summary'),
  error: text('error'),
})
