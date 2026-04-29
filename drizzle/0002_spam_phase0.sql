CREATE TABLE "spam_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"corpus_user_id" text,
	"corpus_id" text,
	"policy_corpus_user_id" text,
	"policy_corpus_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spam_categories" ADD CONSTRAINT "spam_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_categories" ADD CONSTRAINT "spam_categories_corpus_user_id_users_id_fk" FOREIGN KEY ("corpus_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_categories" ADD CONSTRAINT "spam_categories_policy_corpus_user_id_users_id_fk" FOREIGN KEY ("policy_corpus_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "spam_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"body" text NOT NULL,
	"author_features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"rule_score" real,
	"llm_score" real,
	"final_action" text,
	"category_id" text,
	"graph_id" uuid,
	"run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"scored_at" timestamp,
	"decided_at" timestamp,
	CONSTRAINT "spam_items_status_check" CHECK ("status" IN ('new','allowed','quarantined','queued','decided','dropped')),
	CONSTRAINT "spam_items_final_action_check" CHECK ("final_action" IS NULL OR "final_action" IN ('allow','shadow','quarantine','remove'))
);
--> statement-breakpoint
ALTER TABLE "spam_items" ADD CONSTRAINT "spam_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_items" ADD CONSTRAINT "spam_items_category_id_spam_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."spam_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_items" ADD CONSTRAINT "spam_items_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_items" ADD CONSTRAINT "spam_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spam_items_user_status_idx" ON "spam_items" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE TABLE "spam_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"reviewer_id" text,
	"action" text NOT NULL,
	"category_id" text,
	"rationale" text,
	"policy_quote" text,
	"agreed_with_llm" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spam_decisions_action_check" CHECK ("action" IN ('allow','shadow','quarantine','remove','escalate'))
);
--> statement-breakpoint
ALTER TABLE "spam_decisions" ADD CONSTRAINT "spam_decisions_item_id_spam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."spam_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_decisions" ADD CONSTRAINT "spam_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_decisions" ADD CONSTRAINT "spam_decisions_category_id_spam_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."spam_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "spam_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spam_rules_kind_check" CHECK ("kind" IN ('regex','url-domain','feature-threshold'))
);
--> statement-breakpoint
ALTER TABLE "spam_rules" ADD CONSTRAINT "spam_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
