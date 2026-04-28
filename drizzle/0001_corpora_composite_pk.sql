-- Corpus slug is unique per user (fixes POST /api/corpora 409 when another tenant owns corpus-default).
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "corpus_user_id" text;
--> statement-breakpoint
UPDATE "documents" d SET "corpus_user_id" = c."user_id" FROM "corpora" c WHERE d."corpus_id" = c."id";
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "corpus_user_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_corpus_idx";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_corpus_id_corpora_id_fk";
--> statement-breakpoint
ALTER TABLE "corpora" DROP CONSTRAINT IF EXISTS "corpora_pkey";
--> statement-breakpoint
ALTER TABLE "corpora" ADD PRIMARY KEY ("user_id", "id");
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_corpus_user_id_corpus_id_corpora_user_id_id_fk" FOREIGN KEY ("corpus_user_id", "corpus_id") REFERENCES "public"."corpora"("user_id", "id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "documents_corpus_idx" ON "documents" USING btree ("corpus_user_id", "corpus_id");
