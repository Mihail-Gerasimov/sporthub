-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "name_normalized" VARCHAR(200) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "icon" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "is_popular" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_formats" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "work_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "avatar_url" VARCHAR(500),
    "city" VARCHAR(200),
    "quarantine_lifted_at" TIMESTAMP(3),
    "notified_quarantine_until" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "slug_normalized" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "city" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(320),
    "website" VARCHAR(500),
    "vk" VARCHAR(500),
    "telegram" VARCHAR(500),
    "facebook" VARCHAR(500),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "price_from" INTEGER NOT NULL DEFAULT 0,
    "distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "managed_by_user_id" INTEGER,
    "source" VARCHAR(32) NOT NULL DEFAULT 'seed',
    "status" VARCHAR(32) NOT NULL DEFAULT 'published',
    "hide_reason" TEXT,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_user_id" INTEGER,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "slug_normalized" VARCHAR(200) NOT NULL,
    "bio" TEXT NOT NULL,
    "avatar_url" VARCHAR(500) NOT NULL DEFAULT '',
    "experience_years" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "price_from" INTEGER NOT NULL DEFAULT 0,
    "city" VARCHAR(200),
    "address" VARCHAR(300),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" VARCHAR(32),
    "vk" VARCHAR(500),
    "telegram" VARCHAR(500),
    "facebook" VARCHAR(500),
    "sport_id" INTEGER,
    "managed_by_user_id" INTEGER,
    "source" VARCHAR(32) NOT NULL DEFAULT 'seed',
    "status" VARCHAR(32) NOT NULL DEFAULT 'published',
    "hide_reason" TEXT,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_user_id" INTEGER,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerings" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_club_id" INTEGER,
    "owner_trainer_id" INTEGER,
    "venue_club_id" INTEGER,
    "trainer_club_link_id" INTEGER,
    "cancellation_policy" VARCHAR(64),
    "sport_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "format" VARCHAR(32) NOT NULL,
    "price" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offering_id" INTEGER,
    "owner_club_id" INTEGER,
    "owner_trainer_id" INTEGER,
    "venue_club_id" INTEGER,
    "sport_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "level" VARCHAR(32) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "room" VARCHAR(100),

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_id" INTEGER NOT NULL,
    "offering_id" INTEGER,
    "owner_club_id" INTEGER,
    "owner_trainer_id" INTEGER,
    "venue_club_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "sport_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "payment_status" VARCHAR(32) NOT NULL DEFAULT 'unpaid',
    "total_price" INTEGER NOT NULL,
    "cancellation_policy_snapshot" VARCHAR(64),
    "cancelled_by" VARCHAR(32),
    "cancel_reason" VARCHAR(32),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "club_id" INTEGER,
    "trainer_id" INTEGER,
    "rating" INTEGER NOT NULL,
    "text" VARCHAR(1000) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_club_links" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainer_id" INTEGER NOT NULL,
    "club_id" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "initiated_by" VARCHAR(32) NOT NULL,
    "initiated_by_user_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejected_by_user_id" INTEGER,
    "rejection_reason" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" INTEGER,
    "revoked_by" VARCHAR(32),

    CONSTRAINT "trainer_club_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" VARCHAR(64) NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "actor_role" VARCHAR(32) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "meta" JSONB,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_client_notes" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "provider_user_id" INTEGER NOT NULL,
    "client_user_id" INTEGER NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "booking_id" INTEGER,

    CONSTRAINT "provider_client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_sports" (
    "club_id" INTEGER NOT NULL,
    "sport_id" INTEGER NOT NULL,

    CONSTRAINT "club_sports_pkey" PRIMARY KEY ("club_id","sport_id")
);

-- CreateTable
CREATE TABLE "club_tags" (
    "club_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "club_tags_pkey" PRIMARY KEY ("club_id","tag_id")
);

-- CreateTable
CREATE TABLE "club_amenities" (
    "club_id" INTEGER NOT NULL,
    "amenity_id" INTEGER NOT NULL,

    CONSTRAINT "club_amenities_pkey" PRIMARY KEY ("club_id","amenity_id")
);

-- CreateTable
CREATE TABLE "trainer_sports" (
    "trainer_id" INTEGER NOT NULL,
    "sport_id" INTEGER NOT NULL,

    CONSTRAINT "trainer_sports_pkey" PRIMARY KEY ("trainer_id","sport_id")
);

-- CreateTable
CREATE TABLE "trainer_specialties" (
    "trainer_id" INTEGER NOT NULL,
    "specialty_id" INTEGER NOT NULL,

    CONSTRAINT "trainer_specialties_pkey" PRIMARY KEY ("trainer_id","specialty_id")
);

-- CreateTable
CREATE TABLE "trainer_work_formats" (
    "trainer_id" INTEGER NOT NULL,
    "work_format_id" INTEGER NOT NULL,

    CONSTRAINT "trainer_work_formats_pkey" PRIMARY KEY ("trainer_id","work_format_id")
);

-- CreateTable
CREATE TABLE "user_favorite_clubs" (
    "user_id" INTEGER NOT NULL,
    "club_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_clubs_pkey" PRIMARY KEY ("user_id","club_id")
);

-- CreateTable
CREATE TABLE "club_images" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "club_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_transitions" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32) NOT NULL,
    "actor" VARCHAR(32) NOT NULL,
    "actor_user_id" INTEGER,
    "at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "booking_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_normalized_key" ON "cities"("name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "sports_name_key" ON "sports"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_slug_key" ON "sports"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_name_key" ON "amenities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "work_formats_name_key" ON "work_formats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_status_idx" ON "users"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_normalized_key" ON "clubs"("slug_normalized");

-- CreateIndex
CREATE INDEX "clubs_status_idx" ON "clubs"("status");

-- CreateIndex
CREATE INDEX "clubs_managed_by_user_id_idx" ON "clubs"("managed_by_user_id");

-- CreateIndex
CREATE INDEX "clubs_city_status_idx" ON "clubs"("city", "status");

-- CreateIndex
CREATE INDEX "clubs_status_created_at_idx" ON "clubs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "clubs_status_rating_review_count_idx" ON "clubs"("status", "rating" DESC, "review_count" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trainers_slug_key" ON "trainers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_slug_normalized_key" ON "trainers"("slug_normalized");

-- CreateIndex
CREATE INDEX "trainers_status_idx" ON "trainers"("status");

-- CreateIndex
CREATE INDEX "trainers_managed_by_user_id_idx" ON "trainers"("managed_by_user_id");

-- CreateIndex
CREATE INDEX "trainers_city_status_idx" ON "trainers"("city", "status");

-- CreateIndex
CREATE INDEX "trainers_status_created_at_idx" ON "trainers"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "trainers_status_rating_review_count_idx" ON "trainers"("status", "rating" DESC, "review_count" DESC);

-- CreateIndex
CREATE INDEX "offerings_owner_club_id_idx" ON "offerings"("owner_club_id");

-- CreateIndex
CREATE INDEX "offerings_owner_trainer_id_idx" ON "offerings"("owner_trainer_id");

-- CreateIndex
CREATE INDEX "offerings_venue_club_id_idx" ON "offerings"("venue_club_id");

-- CreateIndex
CREATE INDEX "offerings_sport_id_idx" ON "offerings"("sport_id");

-- CreateIndex
CREATE INDEX "offerings_trainer_club_link_id_idx" ON "offerings"("trainer_club_link_id");

-- CreateIndex
CREATE INDEX "offerings_owner_trainer_id_price_idx" ON "offerings"("owner_trainer_id", "price");

-- CreateIndex
CREATE INDEX "schedule_offering_id_idx" ON "schedule"("offering_id");

-- CreateIndex
CREATE INDEX "schedule_owner_club_id_date_start_time_idx" ON "schedule"("owner_club_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "schedule_owner_trainer_id_date_start_time_idx" ON "schedule"("owner_trainer_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "schedule_venue_club_id_idx" ON "schedule"("venue_club_id");

-- CreateIndex
CREATE INDEX "schedule_sport_id_date_idx" ON "schedule"("sport_id", "date");

-- CreateIndex
CREATE INDEX "schedule_date_start_time_idx" ON "schedule"("date", "start_time");

-- CreateIndex
CREATE INDEX "bookings_user_id_date_created_at_idx" ON "bookings"("user_id", "date", "created_at");

-- CreateIndex
CREATE INDEX "bookings_schedule_id_user_id_status_idx" ON "bookings"("schedule_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "bookings_schedule_id_idx" ON "bookings"("schedule_id");

-- CreateIndex
CREATE INDEX "bookings_owner_club_id_idx" ON "bookings"("owner_club_id");

-- CreateIndex
CREATE INDEX "bookings_owner_trainer_id_idx" ON "bookings"("owner_trainer_id");

-- CreateIndex
CREATE INDEX "bookings_venue_club_id_idx" ON "bookings"("venue_club_id");

-- CreateIndex
CREATE INDEX "bookings_sport_id_created_at_idx" ON "bookings"("sport_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "reviews_club_id_created_at_idx" ON "reviews"("club_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_trainer_id_created_at_idx" ON "reviews"("trainer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "trainer_club_links_trainer_id_status_created_at_idx" ON "trainer_club_links"("trainer_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "trainer_club_links_club_id_status_created_at_idx" ON "trainer_club_links"("club_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "logs_action_created_at_idx" ON "logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "logs_actor_id_created_at_idx" ON "logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "logs_created_at_idx" ON "logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "provider_client_notes_provider_user_id_client_user_id_creat_idx" ON "provider_client_notes"("provider_user_id", "client_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "provider_client_notes_booking_id_idx" ON "provider_client_notes"("booking_id");

-- CreateIndex
CREATE INDEX "club_sports_sport_id_idx" ON "club_sports"("sport_id");

-- CreateIndex
CREATE INDEX "club_tags_tag_id_idx" ON "club_tags"("tag_id");

-- CreateIndex
CREATE INDEX "club_amenities_amenity_id_idx" ON "club_amenities"("amenity_id");

-- CreateIndex
CREATE INDEX "trainer_sports_sport_id_idx" ON "trainer_sports"("sport_id");

-- CreateIndex
CREATE INDEX "trainer_specialties_specialty_id_idx" ON "trainer_specialties"("specialty_id");

-- CreateIndex
CREATE INDEX "trainer_work_formats_work_format_id_idx" ON "trainer_work_formats"("work_format_id");

-- CreateIndex
CREATE INDEX "user_favorite_clubs_club_id_idx" ON "user_favorite_clubs"("club_id");

-- CreateIndex
CREATE INDEX "user_favorite_clubs_user_id_created_at_idx" ON "user_favorite_clubs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "club_images_club_id_position_idx" ON "club_images"("club_id", "position");

-- CreateIndex
CREATE INDEX "booking_status_transitions_booking_id_at_idx" ON "booking_status_transitions"("booking_id", "at");

-- CreateIndex
CREATE INDEX "booking_status_transitions_actor_user_id_idx" ON "booking_status_transitions"("actor_user_id");

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_managed_by_user_id_fkey" FOREIGN KEY ("managed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_hidden_by_user_id_fkey" FOREIGN KEY ("hidden_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_managed_by_user_id_fkey" FOREIGN KEY ("managed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_hidden_by_user_id_fkey" FOREIGN KEY ("hidden_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_owner_club_id_fkey" FOREIGN KEY ("owner_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_owner_trainer_id_fkey" FOREIGN KEY ("owner_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_venue_club_id_fkey" FOREIGN KEY ("venue_club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_trainer_club_link_id_fkey" FOREIGN KEY ("trainer_club_link_id") REFERENCES "trainer_club_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_owner_club_id_fkey" FOREIGN KEY ("owner_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_owner_trainer_id_fkey" FOREIGN KEY ("owner_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_venue_club_id_fkey" FOREIGN KEY ("venue_club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_club_id_fkey" FOREIGN KEY ("owner_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_trainer_id_fkey" FOREIGN KEY ("owner_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_club_id_fkey" FOREIGN KEY ("venue_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_club_links" ADD CONSTRAINT "trainer_club_links_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_client_notes" ADD CONSTRAINT "provider_client_notes_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_client_notes" ADD CONSTRAINT "provider_client_notes_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_client_notes" ADD CONSTRAINT "provider_client_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_sports" ADD CONSTRAINT "club_sports_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_sports" ADD CONSTRAINT "club_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_amenities" ADD CONSTRAINT "club_amenities_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_amenities" ADD CONSTRAINT "club_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_sports" ADD CONSTRAINT "trainer_sports_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_sports" ADD CONSTRAINT "trainer_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_specialties" ADD CONSTRAINT "trainer_specialties_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_specialties" ADD CONSTRAINT "trainer_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_work_formats" ADD CONSTRAINT "trainer_work_formats_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_work_formats" ADD CONSTRAINT "trainer_work_formats_work_format_id_fkey" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_clubs" ADD CONSTRAINT "user_favorite_clubs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_clubs" ADD CONSTRAINT "user_favorite_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_images" ADD CONSTRAINT "club_images_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_transitions" ADD CONSTRAINT "booking_status_transitions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_transitions" ADD CONSTRAINT "booking_status_transitions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Ограничения целостности и частичные индексы.
-- Собрано скриптом scripts/db-constraints.mjs из наборов состояний в @sporthub/domain.
-- Править вручную нельзя: предикаты обязаны совпадать с кодом, это сверяет тест схемы.

ALTER TABLE "offerings" ADD CONSTRAINT "offerings_owner_one" CHECK ((CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1);
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_owner_one" CHECK ((CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_one" CHECK ((CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_one" CHECK ((CASE WHEN club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN trainer_id IS NULL THEN 0 ELSE 1 END) = 1);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_time_order" CHECK (end_time > start_time);

CREATE UNIQUE INDEX "bookings_active_slot_user_uq" ON "bookings" (schedule_id, user_id) WHERE status IN ('pending','confirmed');
CREATE UNIQUE INDEX "links_active_pair_uq" ON "trainer_club_links" (trainer_id, club_id) WHERE status IN ('pending','confirmed');
CREATE UNIQUE INDEX "bst_initial_uq" ON "booking_status_transitions" (booking_id) WHERE from_status IS NULL;

CREATE INDEX "schedule_has_free_seats_idx" ON "schedule" (date, start_time) WHERE booked_count < capacity;
CREATE INDEX "bookings_active_by_slot_idx" ON "bookings" (schedule_id, status) WHERE status IN ('pending','confirmed');
CREATE INDEX "notifications_unread_idx" ON "notifications" (user_id, created_at DESC) WHERE read_at IS NULL;
