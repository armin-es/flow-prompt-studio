import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
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

/** Spam triage category (per-tenant); corpora linked in Phase 2+. */
export const spamCategories = pgTable('spam_categories', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.id)
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  corpusUserId: text('corpus_user_id').references(() => users.id),
  corpusId: text('corpus_id'),
  policyCorpusUserId: text('policy_corpus_user_id').references(() => users.id),
  policyCorpusId: text('policy_corpus_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const spamItems = pgTable(
  'spam_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .references(() => users.id)
      .notNull(),
    source: text('source').notNull(),
    externalId: text('external_id'),
    body: text('body').notNull(),
    authorFeatures: jsonb('author_features').notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('new'),
    ruleScore: real('rule_score'),
    llmScore: real('llm_score'),
    finalAction: text('final_action'),
    categoryId: text('category_id').references(() => spamCategories.id, {
      onDelete: 'set null',
    }),
    graphId: uuid('graph_id').references(() => graphs.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    scoredAt: timestamp('scored_at'),
    decidedAt: timestamp('decided_at'),
  },
  (t) => ({
    userStatusIdx: index('spam_items_user_status_idx').on(
      t.userId,
      t.status,
      t.createdAt,
    ),
  }),
)

export const spamDecisions = pgTable('spam_decisions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  itemId: uuid('item_id')
    .references(() => spamItems.id, { onDelete: 'cascade' })
    .notNull(),
  reviewerId: text('reviewer_id').references(() => users.id),
  action: text('action').notNull(),
  categoryId: text('category_id').references(() => spamCategories.id, {
    onDelete: 'set null',
  }),
  rationale: text('rationale'),
  policyQuote: text('policy_quote'),
  agreedWithLlm: boolean('agreed_with_llm'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const spamRules = pgTable('spam_rules', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text('user_id')
    .references(() => users.id)
    .notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  weight: real('weight').notNull().default(1),
  kind: text('kind').notNull(),
  config: jsonb('config').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
