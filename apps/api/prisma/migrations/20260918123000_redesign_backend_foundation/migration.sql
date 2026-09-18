-- Additive backend foundation for the approved redesign.
-- Intentionally contains no INSERT statements: production/reference seed stays empty.

CREATE TABLE "social_posts" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "author_id" INTEGER NOT NULL,
  "body" VARCHAR(5000) NOT NULL, "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
  "image_url" VARCHAR(500),
  CONSTRAINT "social_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "social_posts_visibility_created_at_idx" ON "social_posts" ("visibility", "created_at" DESC);
CREATE INDEX "social_posts_author_id_created_at_idx" ON "social_posts" ("author_id", "created_at" DESC);

CREATE TABLE "post_comments" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "post_id" INTEGER NOT NULL, "author_id" INTEGER NOT NULL, "body" VARCHAR(2000) NOT NULL,
  CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "post_comments_post_id_created_at_idx" ON "post_comments" ("post_id", "created_at");
CREATE INDEX "post_comments_author_id_idx" ON "post_comments" ("author_id");

CREATE TABLE "post_reactions" (
  "post_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL, "kind" VARCHAR(16) NOT NULL DEFAULT 'like',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("post_id", "user_id"),
  CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "post_reactions_user_id_created_at_idx" ON "post_reactions" ("user_id", "created_at" DESC);

CREATE TABLE "post_bookmarks" (
  "post_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("post_id", "user_id"),
  CONSTRAINT "post_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "post_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "post_bookmarks_user_id_created_at_idx" ON "post_bookmarks" ("user_id", "created_at" DESC);

CREATE TABLE "user_follows" (
  "follower_id" INTEGER NOT NULL, "following_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("follower_id", "following_id"),
  CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_follows_not_self" CHECK ("follower_id" <> "following_id")
);
CREATE INDEX "user_follows_following_id_created_at_idx" ON "user_follows" ("following_id", "created_at" DESC);

CREATE TABLE "team_events" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "owner_id" INTEGER NOT NULL, "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(5000) NOT NULL, "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL,
  "location" VARCHAR(300) NOT NULL, "capacity" INTEGER, "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
  "status" VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  CONSTRAINT "team_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "team_events_time_order" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "team_events_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0)
);
CREATE INDEX "team_events_visibility_starts_at_idx" ON "team_events" ("visibility", "starts_at");
CREATE INDEX "team_events_owner_id_starts_at_idx" ON "team_events" ("owner_id", "starts_at");

CREATE TABLE "event_participants" (
  "event_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'joined',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("event_id", "user_id"),
  CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "team_events"("id") ON DELETE CASCADE,
  CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "event_participants_user_id_joined_at_idx" ON "event_participants" ("user_id", "joined_at" DESC);

CREATE TABLE "partner_ads" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "owner_id" INTEGER NOT NULL, "sport_id" INTEGER, "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(3000) NOT NULL, "city" VARCHAR(200) NOT NULL, "available_at" TIMESTAMP(3),
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  CONSTRAINT "partner_ads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "partner_ads_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL
);
CREATE INDEX "partner_ads_status_city_created_at_idx" ON "partner_ads" ("status", "city", "created_at" DESC);
CREATE INDEX "partner_ads_owner_id_created_at_idx" ON "partner_ads" ("owner_id", "created_at" DESC);

CREATE TABLE "partner_contact_requests" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ad_id" INTEGER NOT NULL, "requester_id" INTEGER NOT NULL, "ad_owner_id" INTEGER NOT NULL,
  "message" VARCHAR(1000) NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  CONSTRAINT "partner_contact_requests_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "partner_ads"("id") ON DELETE CASCADE,
  CONSTRAINT "partner_contact_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "partner_contact_requests_ad_owner_id_fkey" FOREIGN KEY ("ad_owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "partner_contact_requests_ad_id_requester_id_key" UNIQUE ("ad_id", "requester_id")
);
CREATE INDEX "partner_contact_requests_ad_owner_id_status_created_at_idx" ON "partner_contact_requests" ("ad_owner_id", "status", "created_at" DESC);

CREATE TABLE "marketplace_categories" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" VARCHAR(200) NOT NULL, "slug" VARCHAR(200) NOT NULL UNIQUE, "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "products" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "seller_id" INTEGER NOT NULL, "category_id" INTEGER NOT NULL,
  "name" VARCHAR(200) NOT NULL, "description" VARCHAR(5000) NOT NULL, "price" INTEGER NOT NULL,
  "kind" VARCHAR(16) NOT NULL DEFAULT 'physical', "status" VARCHAR(16) NOT NULL DEFAULT 'draft', "stock" INTEGER,
  CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "marketplace_categories"("id") ON DELETE RESTRICT,
  CONSTRAINT "products_price_stock_nonnegative" CHECK ("price" >= 0 AND ("stock" IS NULL OR "stock" >= 0))
);
CREATE INDEX "products_status_category_id_created_at_idx" ON "products" ("status", "category_id", "created_at" DESC);
CREATE INDEX "products_seller_id_created_at_idx" ON "products" ("seller_id", "created_at" DESC);

CREATE TABLE "carts" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "user_id" INTEGER NOT NULL UNIQUE,
  CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE "cart_items" (
  "cart_id" INTEGER NOT NULL, "product_id" INTEGER NOT NULL, "quantity" INTEGER NOT NULL,
  PRIMARY KEY ("cart_id", "product_id"),
  CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE,
  CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "orders" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER NOT NULL, "status" VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation', "total" INTEGER NOT NULL,
  CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "orders_total_nonnegative" CHECK ("total" >= 0)
);
CREATE INDEX "orders_user_id_created_at_idx" ON "orders" ("user_id", "created_at" DESC);
CREATE TABLE "order_items" (
  "id" SERIAL PRIMARY KEY, "order_id" INTEGER NOT NULL, "product_id" INTEGER,
  "product_name" VARCHAR(200) NOT NULL, "unit_price" INTEGER NOT NULL, "quantity" INTEGER NOT NULL,
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL,
  CONSTRAINT "order_items_values_positive" CHECK ("unit_price" >= 0 AND "quantity" > 0)
);
CREATE INDEX "order_items_order_id_idx" ON "order_items" ("order_id");

CREATE TABLE "digital_programs" (
  "id" SERIAL PRIMARY KEY, "product_id" INTEGER NOT NULL UNIQUE, "program_type" VARCHAR(16) NOT NULL, "content" JSONB NOT NULL,
  CONSTRAINT "digital_programs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);
CREATE TABLE "program_entitlements" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER NOT NULL, "program_id" INTEGER NOT NULL, "order_id" INTEGER, "expires_at" TIMESTAMP(3),
  CONSTRAINT "program_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "program_entitlements_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "digital_programs"("id") ON DELETE CASCADE,
  CONSTRAINT "program_entitlements_user_id_program_id_key" UNIQUE ("user_id", "program_id")
);
CREATE INDEX "program_entitlements_user_id_created_at_idx" ON "program_entitlements" ("user_id", "created_at" DESC);

CREATE TABLE "workout_entries" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL, "title" VARCHAR(200) NOT NULL,
  "notes" VARCHAR(2000), "duration_minutes" INTEGER,
  CONSTRAINT "workout_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "workout_entries_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0)
);
CREATE INDEX "workout_entries_user_id_occurred_at_idx" ON "workout_entries" ("user_id", "occurred_at" DESC);
CREATE TABLE "workout_exercises" (
  "id" SERIAL PRIMARY KEY, "workout_id" INTEGER NOT NULL, "name" VARCHAR(200) NOT NULL,
  "sets" INTEGER, "reps" INTEGER, "weight_kg" DOUBLE PRECISION, "duration_seconds" INTEGER,
  CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workout_entries"("id") ON DELETE CASCADE
);
CREATE INDEX "workout_exercises_workout_id_idx" ON "workout_exercises" ("workout_id");

CREATE TABLE "food_entries" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER NOT NULL, "eaten_at" TIMESTAMP(3) NOT NULL, "name" VARCHAR(200) NOT NULL,
  "calories" INTEGER NOT NULL, "protein_grams" DOUBLE PRECISION, "fat_grams" DOUBLE PRECISION, "carbs_grams" DOUBLE PRECISION,
  CONSTRAINT "food_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "food_entries_user_id_eaten_at_idx" ON "food_entries" ("user_id", "eaten_at" DESC);
CREATE TABLE "nutrition_targets" (
  "user_id" INTEGER PRIMARY KEY, "updated_at" TIMESTAMP(3) NOT NULL, "calories" INTEGER NOT NULL,
  "protein_grams" DOUBLE PRECISION, "fat_grams" DOUBLE PRECISION, "carbs_grams" DOUBLE PRECISION,
  CONSTRAINT "nutrition_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "pass_plans" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_user_id" INTEGER NOT NULL, "name" VARCHAR(200) NOT NULL, "description" VARCHAR(2000) NOT NULL,
  "price" INTEGER NOT NULL, "duration_days" INTEGER NOT NULL, "visit_limit" INTEGER,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  CONSTRAINT "pass_plans_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "pass_plans_values_positive" CHECK ("price" >= 0 AND "duration_days" > 0 AND ("visit_limit" IS NULL OR "visit_limit" > 0))
);
CREATE INDEX "pass_plans_status_created_at_idx" ON "pass_plans" ("status", "created_at" DESC);
CREATE INDEX "pass_plans_provider_user_id_idx" ON "pass_plans" ("provider_user_id");
CREATE TABLE "user_subscriptions" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER NOT NULL, "plan_id" INTEGER NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL, "remaining_visits" INTEGER,
  CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "pass_plans"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_subscriptions_time_order" CHECK ("ends_at" > "starts_at")
);
CREATE INDEX "user_subscriptions_user_id_status_ends_at_idx" ON "user_subscriptions" ("user_id", "status", "ends_at");

CREATE TABLE "marketing_campaigns" (
  "id" SERIAL PRIMARY KEY, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_user_id" INTEGER NOT NULL, "title" VARCHAR(200) NOT NULL, "message" VARCHAR(2000) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft', "sent_at" TIMESTAMP(3), "recipient_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "marketing_campaigns_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "marketing_campaigns_provider_user_id_created_at_idx" ON "marketing_campaigns" ("provider_user_id", "created_at" DESC);
