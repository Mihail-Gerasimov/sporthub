--
-- PostgreSQL database dump
--

\restrict HsB0SroXnSoExiXeW7oJMhaZ6gihGeedoVJqiGFH0We1xY5Sn7OzRTKywcAVUNG

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: sporthub
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO sporthub;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: sporthub
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO sporthub;

--
-- Name: amenities; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.amenities (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL
);


ALTER TABLE public.amenities OWNER TO sporthub;

--
-- Name: amenities_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.amenities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.amenities_id_seq OWNER TO sporthub;

--
-- Name: amenities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.amenities_id_seq OWNED BY public.amenities.id;


--
-- Name: booking_status_transitions; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.booking_status_transitions (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    from_status character varying(32),
    to_status character varying(32) NOT NULL,
    actor character varying(32) NOT NULL,
    actor_user_id integer,
    at timestamp(3) without time zone NOT NULL,
    reason text
);


ALTER TABLE public.booking_status_transitions OWNER TO sporthub;

--
-- Name: booking_status_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.booking_status_transitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.booking_status_transitions_id_seq OWNER TO sporthub;

--
-- Name: booking_status_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.booking_status_transitions_id_seq OWNED BY public.booking_status_transitions.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    schedule_id integer,
    offering_id integer,
    owner_club_id integer,
    owner_trainer_id integer,
    venue_club_id integer,
    user_id integer NOT NULL,
    sport_id integer NOT NULL,
    date date NOT NULL,
    status character varying(32) NOT NULL,
    payment_status character varying(32) DEFAULT 'unpaid'::character varying NOT NULL,
    total_price integer NOT NULL,
    cancellation_policy_snapshot character varying(64),
    cancelled_by character varying(32),
    cancel_reason character varying(32),
    completed_at timestamp(3) without time zone,
    conducted_by_trainer_id integer,
    CONSTRAINT bookings_owner_one CHECK (((
CASE
    WHEN (owner_club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (owner_trainer_id IS NULL) THEN 0
    ELSE 1
END) = 1))
);


ALTER TABLE public.bookings OWNER TO sporthub;

--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bookings_id_seq OWNER TO sporthub;

--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL,
    name_normalized character varying(200) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL
);


ALTER TABLE public.cities OWNER TO sporthub;

--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cities_id_seq OWNER TO sporthub;

--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: club_amenities; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.club_amenities (
    club_id integer NOT NULL,
    amenity_id integer NOT NULL
);


ALTER TABLE public.club_amenities OWNER TO sporthub;

--
-- Name: club_images; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.club_images (
    id integer NOT NULL,
    club_id integer NOT NULL,
    url character varying(500) NOT NULL,
    "position" integer NOT NULL
);


ALTER TABLE public.club_images OWNER TO sporthub;

--
-- Name: club_images_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.club_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_images_id_seq OWNER TO sporthub;

--
-- Name: club_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.club_images_id_seq OWNED BY public.club_images.id;


--
-- Name: club_sports; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.club_sports (
    club_id integer NOT NULL,
    sport_id integer NOT NULL
);


ALTER TABLE public.club_sports OWNER TO sporthub;

--
-- Name: club_tags; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.club_tags (
    club_id integer NOT NULL,
    tag_id integer NOT NULL
);


ALTER TABLE public.club_tags OWNER TO sporthub;

--
-- Name: clubs; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.clubs (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    slug_normalized character varying(200) NOT NULL,
    description text NOT NULL,
    short_description text NOT NULL,
    city character varying(200) NOT NULL,
    address character varying(300) NOT NULL,
    phone character varying(32) NOT NULL,
    email character varying(320),
    website character varying(500),
    vk character varying(500),
    telegram character varying(500),
    facebook character varying(500),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    review_count integer DEFAULT 0 NOT NULL,
    price_from integer DEFAULT 0 NOT NULL,
    distance_km double precision DEFAULT 0 NOT NULL,
    managed_by_user_id integer,
    source character varying(32) DEFAULT 'seed'::character varying NOT NULL,
    status character varying(32) DEFAULT 'published'::character varying NOT NULL,
    hide_reason text,
    hidden_at timestamp(3) without time zone,
    hidden_by_user_id integer,
    hidden_kind character varying(32),
    awaiting_recheck boolean DEFAULT false NOT NULL,
    verified_at timestamp(3) without time zone,
    verified_by_user_id integer,
    CONSTRAINT clubs_verified_shape CHECK (((verified_by_user_id IS NULL) OR (verified_at IS NOT NULL)))
);


ALTER TABLE public.clubs OWNER TO sporthub;

--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clubs_id_seq OWNER TO sporthub;

--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.clubs_id_seq OWNED BY public.clubs.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.logs (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    action character varying(64) NOT NULL,
    actor_id integer,
    actor_role character varying(32) NOT NULL,
    entity_type character varying(64) NOT NULL,
    entity_id integer NOT NULL,
    meta jsonb,
    CONSTRAINT logs_actor_or_system CHECK (((actor_id IS NOT NULL) OR ((actor_role)::text = 'system'::text)))
);


ALTER TABLE public.logs OWNER TO sporthub;

--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_id_seq OWNER TO sporthub;

--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id integer,
    type character varying(64) NOT NULL,
    payload jsonb NOT NULL,
    read_at timestamp(3) without time zone,
    addressee_club_id integer,
    addressee_trainer_id integer,
    addressee_kind character varying(16) NOT NULL,
    read_by_user_id integer,
    CONSTRAINT notifications_addressee_kind CHECK (((addressee_kind)::text = ANY ((ARRAY['personal'::character varying, 'club'::character varying, 'trainer'::character varying, 'supervision'::character varying])::text[]))),
    CONSTRAINT notifications_addressee_shape CHECK (((((addressee_kind)::text = 'personal'::text) AND (user_id IS NOT NULL) AND (addressee_club_id IS NULL) AND (addressee_trainer_id IS NULL)) OR (((addressee_kind)::text = 'club'::text) AND (user_id IS NOT NULL) AND (addressee_club_id IS NOT NULL) AND (addressee_trainer_id IS NULL)) OR (((addressee_kind)::text = 'trainer'::text) AND (user_id IS NOT NULL) AND (addressee_club_id IS NULL) AND (addressee_trainer_id IS NOT NULL)) OR (((addressee_kind)::text = 'supervision'::text) AND (user_id IS NULL) AND (addressee_club_id IS NULL) AND (addressee_trainer_id IS NULL))))
);


ALTER TABLE public.notifications OWNER TO sporthub;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO sporthub;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: offerings; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.offerings (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    owner_club_id integer,
    owner_trainer_id integer,
    venue_club_id integer,
    trainer_club_link_id integer,
    cancellation_policy character varying(64),
    sport_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    format character varying(32) NOT NULL,
    price integer NOT NULL,
    duration_minutes integer NOT NULL,
    capacity integer NOT NULL,
    address character varying(300) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    CONSTRAINT offerings_owner_one CHECK (((
CASE
    WHEN (owner_club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (owner_trainer_id IS NULL) THEN 0
    ELSE 1
END) = 1))
);


ALTER TABLE public.offerings OWNER TO sporthub;

--
-- Name: offerings_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.offerings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.offerings_id_seq OWNER TO sporthub;

--
-- Name: offerings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.offerings_id_seq OWNED BY public.offerings.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    token_hash character varying(64) NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    CONSTRAINT password_reset_tokens_expires_after_created CHECK ((expires_at > created_at))
);


ALTER TABLE public.password_reset_tokens OWNER TO sporthub;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_reset_tokens_id_seq OWNER TO sporthub;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: provider_client_notes; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.provider_client_notes (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    provider_user_id integer NOT NULL,
    client_user_id integer NOT NULL,
    note character varying(2000) NOT NULL,
    booking_id integer,
    face_club_id integer,
    face_trainer_id integer,
    CONSTRAINT provider_client_notes_face_one CHECK (((
CASE
    WHEN (face_club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (face_trainer_id IS NULL) THEN 0
    ELSE 1
END) <= 1))
);


ALTER TABLE public.provider_client_notes OWNER TO sporthub;

--
-- Name: provider_client_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.provider_client_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.provider_client_notes_id_seq OWNER TO sporthub;

--
-- Name: provider_client_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.provider_client_notes_id_seq OWNED BY public.provider_client_notes.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id integer NOT NULL,
    club_id integer,
    trainer_id integer,
    rating integer NOT NULL,
    text character varying(1000) NOT NULL,
    CONSTRAINT reviews_rating_range CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_target_one CHECK (((
CASE
    WHEN (club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (trainer_id IS NULL) THEN 0
    ELSE 1
END) = 1))
);


ALTER TABLE public.reviews OWNER TO sporthub;

--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reviews_id_seq OWNER TO sporthub;

--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: schedule; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.schedule (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    offering_id integer,
    owner_club_id integer,
    owner_trainer_id integer,
    venue_club_id integer,
    sport_id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    date date NOT NULL,
    start_time time(0) without time zone NOT NULL,
    end_time time(0) without time zone NOT NULL,
    duration_minutes integer NOT NULL,
    level character varying(32) NOT NULL,
    capacity integer NOT NULL,
    booked_count integer DEFAULT 0 NOT NULL,
    price integer NOT NULL,
    room character varying(100),
    conducted_by_trainer_id integer,
    CONSTRAINT schedule_booked_range CHECK (((booked_count >= 0) AND (booked_count <= capacity))),
    CONSTRAINT schedule_owner_one CHECK (((
CASE
    WHEN (owner_club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (owner_trainer_id IS NULL) THEN 0
    ELSE 1
END) = 1)),
    CONSTRAINT schedule_time_order CHECK ((end_time > start_time))
);


ALTER TABLE public.schedule OWNER TO sporthub;

--
-- Name: schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schedule_id_seq OWNER TO sporthub;

--
-- Name: schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.schedule_id_seq OWNED BY public.schedule.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    token_hash character varying(64) NOT NULL,
    user_id integer NOT NULL,
    impersonated_user_id integer,
    last_seen_at timestamp(3) without time zone NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    revoked_at timestamp(3) without time zone,
    user_agent character varying(512),
    ip character varying(64),
    CONSTRAINT sessions_expires_after_created CHECK ((expires_at > created_at))
);


ALTER TABLE public.sessions OWNER TO sporthub;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO sporthub;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: specialties; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.specialties (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL
);


ALTER TABLE public.specialties OWNER TO sporthub;

--
-- Name: specialties_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.specialties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.specialties_id_seq OWNER TO sporthub;

--
-- Name: specialties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.specialties_id_seq OWNED BY public.specialties.id;


--
-- Name: sports; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.sports (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text NOT NULL,
    icon character varying(100) NOT NULL,
    image_url character varying(500) NOT NULL,
    is_popular boolean DEFAULT false NOT NULL,
    color character varying(7),
    CONSTRAINT sports_color_hex CHECK (((color IS NULL) OR ((color)::text ~ '^#[0-9a-f]{6}$'::text)))
);


ALTER TABLE public.sports OWNER TO sporthub;

--
-- Name: sports_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.sports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sports_id_seq OWNER TO sporthub;

--
-- Name: sports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.sports_id_seq OWNED BY public.sports.id;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL
);


ALTER TABLE public.tags OWNER TO sporthub;

--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tags_id_seq OWNER TO sporthub;

--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: trainer_club_links; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.trainer_club_links (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    trainer_id integer NOT NULL,
    club_id integer NOT NULL,
    status character varying(32) NOT NULL,
    initiated_by character varying(32) NOT NULL,
    initiated_by_user_id integer,
    approved_at timestamp(3) without time zone,
    approved_by_user_id integer,
    rejected_at timestamp(3) without time zone,
    rejected_by_user_id integer,
    rejection_reason text,
    revoked_at timestamp(3) without time zone,
    revoked_by_user_id integer,
    revoked_by character varying(32)
);


ALTER TABLE public.trainer_club_links OWNER TO sporthub;

--
-- Name: trainer_club_links_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.trainer_club_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trainer_club_links_id_seq OWNER TO sporthub;

--
-- Name: trainer_club_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.trainer_club_links_id_seq OWNED BY public.trainer_club_links.id;


--
-- Name: trainer_specialties; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.trainer_specialties (
    trainer_id integer NOT NULL,
    specialty_id integer NOT NULL
);


ALTER TABLE public.trainer_specialties OWNER TO sporthub;

--
-- Name: trainer_sports; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.trainer_sports (
    trainer_id integer NOT NULL,
    sport_id integer NOT NULL
);


ALTER TABLE public.trainer_sports OWNER TO sporthub;

--
-- Name: trainer_work_formats; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.trainer_work_formats (
    trainer_id integer NOT NULL,
    work_format_id integer NOT NULL
);


ALTER TABLE public.trainer_work_formats OWNER TO sporthub;

--
-- Name: trainers; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.trainers (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    slug_normalized character varying(200) NOT NULL,
    bio text NOT NULL,
    avatar_url character varying(500) DEFAULT ''::character varying NOT NULL,
    experience_years integer NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    review_count integer DEFAULT 0 NOT NULL,
    price_from integer DEFAULT 0 NOT NULL,
    city character varying(200),
    address character varying(300),
    latitude double precision,
    longitude double precision,
    phone character varying(32),
    vk character varying(500),
    telegram character varying(500),
    facebook character varying(500),
    sport_id integer,
    managed_by_user_id integer,
    source character varying(32) DEFAULT 'seed'::character varying NOT NULL,
    status character varying(32) DEFAULT 'published'::character varying NOT NULL,
    hide_reason text,
    hidden_at timestamp(3) without time zone,
    hidden_by_user_id integer,
    hidden_kind character varying(32),
    awaiting_recheck boolean DEFAULT false NOT NULL,
    verified_at timestamp(3) without time zone,
    verified_by_user_id integer,
    CONSTRAINT trainers_verified_shape CHECK (((verified_by_user_id IS NULL) OR (verified_at IS NOT NULL)))
);


ALTER TABLE public.trainers OWNER TO sporthub;

--
-- Name: trainers_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.trainers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trainers_id_seq OWNER TO sporthub;

--
-- Name: trainers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.trainers_id_seq OWNED BY public.trainers.id;


--
-- Name: user_favorite_clubs; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.user_favorite_clubs (
    user_id integer NOT NULL,
    club_id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_favorite_clubs OWNER TO sporthub;

--
-- Name: user_notification_preferences; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.user_notification_preferences (
    user_id integer NOT NULL,
    type character varying(64) NOT NULL,
    enabled boolean NOT NULL,
    id integer NOT NULL,
    face_club_id integer,
    face_trainer_id integer,
    CONSTRAINT user_notification_preferences_face_one CHECK (((
CASE
    WHEN (face_club_id IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN (face_trainer_id IS NULL) THEN 0
    ELSE 1
END) <= 1))
);


ALTER TABLE public.user_notification_preferences OWNER TO sporthub;

--
-- Name: user_notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.user_notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_notification_preferences_id_seq OWNER TO sporthub;

--
-- Name: user_notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.user_notification_preferences_id_seq OWNED BY public.user_notification_preferences.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.users (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(320) NOT NULL,
    phone character varying(32) NOT NULL,
    password_hash character varying(255) NOT NULL,
    avatar_url character varying(500),
    city character varying(200),
    account_kind character varying(32) DEFAULT 'person'::character varying NOT NULL,
    CONSTRAINT users_account_kind CHECK (((account_kind)::text = ANY ((ARRAY['person'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO sporthub;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO sporthub;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: work_formats; Type: TABLE; Schema: public; Owner: sporthub
--

CREATE TABLE public.work_formats (
    id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(200) NOT NULL
);


ALTER TABLE public.work_formats OWNER TO sporthub;

--
-- Name: work_formats_id_seq; Type: SEQUENCE; Schema: public; Owner: sporthub
--

CREATE SEQUENCE public.work_formats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.work_formats_id_seq OWNER TO sporthub;

--
-- Name: work_formats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sporthub
--

ALTER SEQUENCE public.work_formats_id_seq OWNED BY public.work_formats.id;


--
-- Name: amenities id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.amenities ALTER COLUMN id SET DEFAULT nextval('public.amenities_id_seq'::regclass);


--
-- Name: booking_status_transitions id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.booking_status_transitions ALTER COLUMN id SET DEFAULT nextval('public.booking_status_transitions_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: club_images id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_images ALTER COLUMN id SET DEFAULT nextval('public.club_images_id_seq'::regclass);


--
-- Name: clubs id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.clubs ALTER COLUMN id SET DEFAULT nextval('public.clubs_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: offerings id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings ALTER COLUMN id SET DEFAULT nextval('public.offerings_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: provider_client_notes id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes ALTER COLUMN id SET DEFAULT nextval('public.provider_client_notes_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: schedule id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule ALTER COLUMN id SET DEFAULT nextval('public.schedule_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: specialties id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.specialties ALTER COLUMN id SET DEFAULT nextval('public.specialties_id_seq'::regclass);


--
-- Name: sports id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sports ALTER COLUMN id SET DEFAULT nextval('public.sports_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: trainer_club_links id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links ALTER COLUMN id SET DEFAULT nextval('public.trainer_club_links_id_seq'::regclass);


--
-- Name: trainers id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers ALTER COLUMN id SET DEFAULT nextval('public.trainers_id_seq'::regclass);


--
-- Name: user_notification_preferences id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_notification_preferences_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: work_formats id; Type: DEFAULT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.work_formats ALTER COLUMN id SET DEFAULT nextval('public.work_formats_id_seq'::regclass);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
c65e663f-a9b9-4840-be21-412719bdbf0a	5573d7776e99efea4b4324cce39c2285e4498656e75a883b064ba5a5a7c3640a	2026-08-20 08:28:33.494022+00	20260820082639_init	\N	\N	2026-08-20 08:28:33.362728+00	1
13fe9ad0-d2fe-42e8-81e1-69e95a417313	61f4b9b22c4147a9e8fa0fe4cbb0c40458bee6d1078e5c356be67ae4ed387e82	2026-08-20 15:42:51.975359+00	20260820154251_conducting_trainer	\N	\N	2026-08-20 15:42:51.967196+00	1
6a4c209f-8943-4970-a05f-ed7f41ffb46d	9220b3dff15d98c9a466e9b2d790594cec65053010b31c96b26a0acc36ed54ce	2026-08-20 17:08:58.700366+00	20260820165041_detachable_booking_slot	\N	\N	2026-08-20 17:08:58.695942+00	1
d637e321-4699-4b67-a27a-de53794609fb	4aea4b6b60a15f34e14bc53a9a66073062b7ebe1348e873106978ce70f9c460b	2026-08-21 00:43:07.257822+00	20260821040000_schedule_booked_range	\N	\N	2026-08-21 00:43:07.250895+00	1
b57b004e-66fc-464c-8421-ac1e4dcdf29a	d608b977c66eb4ace1773885fba445ce8c2f00f9f538a69c6abb6cc229bed76f	2026-09-10 17:52:10.195909+00	20260911000000_publication_hide_kind	\N	\N	2026-09-10 17:52:10.181818+00	1
0dd7acb1-fab2-4956-9288-d7ad1b6a8218	e42937f5050bcba398ecf6f4620a442f44d2fe920fc3f0c4a8da89b982bcd3d4	2026-08-21 06:40:48.092289+00	20260821103000_drop_redundant_user_index	\N	\N	2026-08-21 06:40:48.087526+00	1
9817f99c-1c8e-48c4-af1b-29904614de6f	30de2f8e7a6b9b33729470d72549291ab5383312be1e68858b7dae083e2f421e	2026-09-08 23:56:22.270027+00	20260909000000_sessions	\N	\N	2026-09-08 23:56:22.254611+00	1
40eaf875-7af7-416f-b6fa-7a354c4f43fc	bfa51999d05c6a984102fdd856268ed90673edaa29dca82c55710de60d344205	2026-09-09 01:02:48.869145+00	20260909120000_password_reset_tokens	\N	\N	2026-09-09 01:02:48.844954+00	1
1110ecd6-1613-4e4b-98a5-b2258c6c0afd	7bec7810a79b49209571d61a8c8e75ac970dff3a5edbe8238ce6ded422a2e055	2026-09-11 08:06:01.851415+00	20260911120000_notification_subject	\N	\N	2026-09-11 08:06:01.8471+00	1
65a64d53-cef1-4570-ad0d-93039f3c68ae	ef237e25b5a627b977f89bbefc91f8370dfe30555a39b0a5b97291955ea08896	2026-09-09 05:12:10.626733+00	20260909180000_review_quota_indexes	\N	\N	2026-09-09 05:12:10.613399+00	1
b28b5d53-ced7-4794-bb70-d013a77618ad	ac9fd320ac82e674fcfa1388cd0fa5e92b9f109ceb08fc7c82ee71d2b29d3d3b	2026-09-09 20:39:22.47814+00	20260910000000_drop_quarantine_fields	\N	\N	2026-09-09 20:39:22.469409+00	1
ab8dfcd2-7de2-456b-89bd-46ffbc528338	8d9e11f9b93a6e6ff38adbb420a170f830f0060b7c05eb401cf176b64101ea83	2026-09-11 12:24:07.399185+00	20260911150000_logs_system_actor	\N	\N	2026-09-11 12:24:07.395508+00	1
7a623610-f6c3-46cf-b1a2-b28756c37a52	8f4f7f59223a085c174d19ca551033a7a8f192985a87b340c58d1b11a5f5100b	2026-09-09 20:39:22.486035+00	20260910120000_account_kind	\N	\N	2026-09-09 20:39:22.478854+00	1
45804e2a-83f7-489e-86e1-a01e45124173	19abfca02903b61edac260229a0a5e2f3b57e6d240b8f68d355ad075c96aa9d7	2026-09-11 12:24:07.368947+00	20260911140000_notification_addressee_kind	\N	\N	2026-09-11 12:24:07.356548+00	1
6db09f81-4f0e-4097-9b9e-6c93762a692f	9f27cf6226b68b74e5e5fd08f73795f419401673e910b03ccfd8cb1a2c3c0a5e	2026-09-09 21:55:02.671603+00	20260910180000_notes_addressee	\N	\N	2026-09-09 21:55:02.653316+00	1
42321151-cffc-46bb-bae0-6cec8508a331	b097b7b53f4928153dae15f297fc6ee235a450c83e2c355ab64547dfdc009301	2026-09-09 22:55:22.888185+00	20260910190000_notification_addressee	\N	\N	2026-09-09 22:55:22.871673+00	1
3cd8f00a-d502-4219-b7d9-139bf6004c97	e90742e97cd52319778f60ec1526bd6331b23d035f2e5bde0fef5bc1e887bfb4	2026-09-09 22:55:22.892982+00	20260910200000_drop_user_role	\N	\N	2026-09-09 22:55:22.888697+00	1
e873eeaf-2351-486c-a312-f8ba93bda3dd	c65b1074cbc7bc001e50bdc8c75c01d89256c469ba19d861b395f4ac7c71015f	2026-09-11 12:24:07.373846+00	20260911141000_notification_read_by	\N	\N	2026-09-11 12:24:07.369791+00	1
15d8afdc-3f3e-4fcf-aad8-17568fd07684	9bf7feb6ccb03e434a431e9d720eb1d5ff656c257a53b904978d73bd773bbb12	2026-09-09 23:20:00.257092+00	20260910210000_preferences_per_face	\N	\N	2026-09-09 23:20:00.236344+00	1
ca5df6f7-5dd0-4c98-a411-c57ab327b8ec	b8cb89ec611286392af5ed803d9328905c70c73cb5fcb8c278c4f1e0de89aa9f	2026-09-10 17:52:10.181221+00	20260910230000_drop_quarantine_preferences	\N	\N	2026-09-10 17:52:10.166523+00	1
b1a0a30b-bdad-4e27-a680-f5ac94899b0e	fc83f71584750baafe345f91c0646fae1a211cc44b0cf97869da52feb88c02a5	2026-09-15 19:54:21.586668+00	20260915120000_publication_verification	\N	\N	2026-09-15 19:54:21.56935+00	1
b2b84486-bf48-4caf-bbcd-f8a6ac5b6030	9e171e76d6f6147aaa16214dc95f20fb2012d6f688173e6da0a1898645ef4554	2026-09-11 12:24:07.377356+00	20260911142000_notification_user_optional	\N	\N	2026-09-11 12:24:07.3746+00	1
aa77360a-43c9-41d1-9507-d8be1e3abdb0	b364ecfb1ffbda3d32cdf6628c6840338301eedad1a26756f8dd079a7dabcbac	2026-09-11 12:24:07.382376+00	20260911143000_notification_addressee_shape	\N	\N	2026-09-11 12:24:07.378112+00	1
b38d4610-5c21-4794-85de-ae5b7623d9e5	c7e23605bf04ff5f1d00b1b5003071413ea23649cebf515b289e709e93b4801c	2026-09-11 12:24:07.389987+00	20260911144000_notification_personal_idx	\N	\N	2026-09-11 12:24:07.383057+00	1
64b52bf0-f7e4-459b-b408-7721e54dfe6c	d02dfa079f5125fbed4bd9ace9bcf8c0edce9076545262ebf1d080b91dd5b237	2026-09-16 09:19:06.383961+00	20260916090000_sports_color	\N	\N	2026-09-16 09:19:06.373414+00	1
0dd444e6-0fd0-48b8-8e48-bb8df4c85b70	8f649bd054816e1f65d2fcd16939a69901d78c40ae1239b9f0137a2200624c4e	2026-09-11 12:24:07.394795+00	20260911145000_notification_supervision_idx	\N	\N	2026-09-11 12:24:07.390631+00	1
\.


--
-- Data for Name: amenities; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.amenities (id, created_at, name) FROM stdin;
1	2026-03-17 09:00:00	Парковка
2	2026-03-17 09:00:00	Душевые
3	2026-03-17 09:00:00	Раздевалки
4	2026-03-17 09:00:00	Сауна
5	2026-03-17 09:00:00	Бассейн 25 м
6	2026-03-17 09:00:00	Кондиционер
7	2026-03-17 09:00:00	Wi-Fi
8	2026-03-17 09:00:00	Детская комната
9	2026-03-17 09:00:00	Кафе / бар
10	2026-03-17 09:00:00	Прокат инвентаря
11	2026-03-17 09:00:00	Коврики и блоки
12	2026-03-17 09:00:00	Тренажёры
13	2026-03-17 09:00:00	Зеркальный зал
14	2026-03-17 09:00:00	Ринг
15	2026-03-17 09:00:00	Татами
\.


--
-- Data for Name: booking_status_transitions; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.booking_status_transitions (id, booking_id, from_status, to_status, actor, actor_user_id, at, reason) FROM stdin;
6	3	\N	pending	athlete	7	2026-04-23 10:44:10.784	\N
7	3	pending	confirmed	provider	2	2026-04-23 10:44:30.11	\N
8	3	confirmed	completed	provider	2	2026-04-23 17:22:15.125	\N
15	6	\N	pending	athlete	1	2026-04-23 17:10:39.168	\N
16	6	pending	confirmed	provider	2	2026-04-23 17:10:40.03	\N
17	6	confirmed	cancelled_by_athlete	athlete	1	2026-04-23 17:19:40.626	\N
18	7	\N	pending	athlete	1	2026-04-23 17:20:04.66	\N
19	7	pending	confirmed	provider	2	2026-04-23 17:20:04.87	\N
20	7	confirmed	cancelled_by_provider	provider	2	2026-04-23 17:20:05.092	\N
21	8	\N	pending	athlete	1	2026-04-23 17:20:35.557	\N
22	8	pending	confirmed	provider	2	2026-04-23 17:21:40.705	\N
23	8	confirmed	completed	provider	2	2026-04-23 17:22:47.866	\N
24	9	\N	pending	athlete	7	2026-04-23 17:50:33.923	\N
25	9	pending	cancelled_by_provider	system	\N	2026-04-23 18:00:33.136	auto_cancel_pending_expired
26	10	\N	pending	athlete	1	2026-04-23 23:45:16.85	\N
27	10	pending	confirmed	provider	2	2026-04-23 23:45:17.658	\N
28	10	confirmed	completed	provider	2	2026-04-23 23:49:04.018	\N
29	11	\N	pending	athlete	1	2026-04-23 23:50:14.957	\N
30	11	pending	confirmed	provider	2	2026-04-23 23:50:15.262	\N
31	11	confirmed	cancelled_by_athlete	athlete	1	2026-04-23 23:50:16.853	\N
32	12	\N	pending	athlete	1	2026-04-23 23:50:17.172	\N
33	12	pending	confirmed	provider	2	2026-04-23 23:50:17.201	\N
34	12	confirmed	cancelled_by_provider	provider	2	2026-04-23 23:50:17.308	\N
35	13	\N	pending	athlete	1	2026-04-23 23:50:17.741	\N
36	13	pending	cancelled_by_provider	system	\N	2026-04-23 23:50:17.993	auto_cancel_pending_expired
37	14	\N	pending	athlete	6	2026-04-23 23:52:53.101	\N
38	14	pending	cancelled_by_provider	system	\N	2026-04-23 23:52:53.311	auto_cancel_pending_expired
39	15	\N	pending	athlete	7	2026-04-23 23:52:53.111	\N
40	15	pending	cancelled_by_provider	system	\N	2026-04-23 23:52:53.311	auto_cancel_pending_expired
41	16	\N	pending	athlete	6	2026-04-23 23:53:05.889	\N
42	16	pending	confirmed	provider	2	2026-04-23 23:53:06.167	\N
43	16	confirmed	unmarked	system	\N	2026-04-27 08:19:24.01	\N
44	17	\N	pending	athlete	7	2026-04-23 23:53:06.32	\N
45	17	pending	confirmed	provider	2	2026-04-23 23:53:06.4	\N
46	17	confirmed	completed	provider	2	2026-04-23 23:53:23.4	\N
47	18	\N	pending	athlete	1	2026-04-27 12:27:36.236	\N
48	18	pending	confirmed	provider	2	2026-04-27 12:28:50.376	\N
49	18	confirmed	completed	provider	2	2026-04-27 12:34:22.603	\N
50	19	\N	pending	athlete	1	2026-04-27 12:29:42.766	\N
51	19	pending	rejected_by_provider	provider	2	2026-04-27 12:31:06.272	\N
52	20	\N	pending	athlete	6	2026-04-27 12:35:52.39	\N
53	20	pending	confirmed	provider	2	2026-04-27 12:35:53.053	\N
54	20	confirmed	no_show	provider	2	2026-04-27 12:35:53.691	\N
55	21	\N	pending	athlete	7	2026-04-27 12:36:12.436	\N
56	21	pending	confirmed	provider	2	2026-04-27 12:36:12.462	\N
57	21	confirmed	unmarked	system	\N	2026-04-27 12:36:36.71	\N
60	23	\N	pending	athlete	1	2026-04-27 12:43:34.485	\N
61	23	pending	cancelled_by_athlete	athlete	1	2026-04-27 12:43:35.857	\N
65	25	\N	pending	athlete	7	2026-04-27 12:44:58.86	\N
66	25	pending	confirmed	provider	2	2026-04-27 12:44:58.896	\N
67	25	confirmed	cancelled_by_provider	provider	2	2026-04-27 12:44:59.218	\N
68	26	\N	pending	athlete	7	2026-04-27 12:45:35.98	\N
69	26	pending	cancelled_by_athlete	athlete	7	2026-04-27 12:46:59.764	\N
70	27	\N	pending	athlete	6	2026-04-27 21:46:57.591	\N
71	27	pending	rejected_by_provider	provider	2	2026-04-27 21:47:52.781	Изменились планы
72	28	\N	pending	athlete	6	2026-04-27 21:49:00.864	\N
73	28	pending	rejected_by_provider	provider	2	2026-04-27 21:50:08.058	Не смогу прийти
74	29	\N	pending	athlete	6	2026-04-27 22:00:42.175	\N
75	29	pending	rejected_by_provider	provider	2	2026-04-27 22:01:08.431	Отмена по просьбе клиента
76	30	\N	pending	athlete	1	2026-04-29 09:17:17.903	\N
77	30	pending	rejected_by_provider	provider	2	2026-04-29 09:18:11.002	Ошибочная запись
78	31	\N	pending	athlete	1	2026-05-08 09:37:57.16	\N
79	31	pending	confirmed	provider	2	2026-05-08 09:38:39.205	\N
80	31	confirmed	unmarked	system	\N	2026-05-14 09:14:13.377	\N
81	32	\N	pending	athlete	6	2026-08-13 11:53:55.625	\N
82	32	pending	cancelled_by_provider	system	\N	2026-08-18 14:44:26.518	auto_cancel_pending_expired
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.bookings (id, created_at, schedule_id, offering_id, owner_club_id, owner_trainer_id, venue_club_id, user_id, sport_id, date, status, payment_status, total_price, cancellation_policy_snapshot, cancelled_by, cancel_reason, completed_at, conducted_by_trainer_id) FROM stdin;
3	2026-04-23 10:44:10.784	3	2	2	\N	\N	7	2	2026-05-07	completed	unpaid	500	free_until_24h	\N	\N	2026-04-23 17:22:15.125	\N
6	2026-04-23 17:10:39.168	3	2	2	\N	\N	1	2	2026-05-07	cancelled_by_athlete	unpaid	500	free_until_24h	athlete	late	\N	\N
7	2026-04-23 17:20:04.66	2	2	2	\N	\N	1	2	2026-05-07	cancelled_by_provider	unpaid	500	free_until_24h	provider	\N	\N	\N
8	2026-04-23 17:20:35.557	3	2	2	\N	\N	1	2	2026-05-07	completed	unpaid	500	free_until_24h	\N	\N	2026-04-23 17:22:47.866	\N
9	2026-04-23 17:50:33.923	1	1	1	\N	\N	7	7	2026-05-08	cancelled_by_provider	unpaid	1000	free_until_24h	system	\N	\N	\N
10	2026-04-23 23:45:16.85	3	2	2	\N	\N	1	2	2026-05-07	completed	unpaid	500	free_until_24h	\N	\N	2026-04-23 23:49:04.018	\N
11	2026-04-23 23:50:14.957	2	2	2	\N	\N	1	2	2026-05-07	cancelled_by_athlete	unpaid	500	free_until_24h	athlete	late	\N	\N
12	2026-04-23 23:50:17.172	1	1	1	\N	\N	1	7	2026-05-08	cancelled_by_provider	unpaid	1000	free_until_24h	provider	\N	\N	\N
13	2026-04-23 23:50:17.741	4	3	\N	1	\N	1	1	2026-05-07	cancelled_by_provider	unpaid	1000	free_anytime	system	\N	\N	\N
14	2026-04-23 23:52:53.101	2	2	2	\N	\N	6	2	2026-05-07	cancelled_by_provider	unpaid	500	free_until_24h	system	\N	\N	\N
15	2026-04-23 23:52:53.111	3	2	2	\N	\N	7	2	2026-05-07	cancelled_by_provider	unpaid	500	free_until_24h	system	\N	\N	\N
16	2026-04-23 23:53:05.889	2	2	2	\N	\N	6	2	2026-05-07	unmarked	unpaid	500	free_until_24h	\N	\N	\N	\N
17	2026-04-23 23:53:06.32	3	2	2	\N	\N	7	2	2026-05-07	completed	unpaid	500	free_until_24h	\N	\N	2026-04-23 23:53:23.4	\N
18	2026-04-27 12:27:36.236	1	1	1	\N	\N	1	7	2026-05-08	completed	unpaid	1000	free_until_24h	\N	\N	2026-04-27 12:34:22.603	\N
19	2026-04-27 12:29:42.766	6	4	3	\N	\N	1	1	2026-05-07	rejected_by_provider	unpaid	800	free_until_24h	provider	\N	\N	\N
20	2026-04-27 12:35:52.39	1	1	1	\N	\N	6	7	2026-05-08	no_show	unpaid	1000	free_until_24h	\N	\N	\N	\N
21	2026-04-27 12:36:12.436	2	2	2	\N	\N	7	2	2026-05-07	unmarked	unpaid	500	free_until_24h	\N	\N	\N	\N
23	2026-04-27 12:43:34.485	6	4	3	\N	\N	1	1	2026-05-07	cancelled_by_athlete	unpaid	800	free_until_24h	athlete	on_time	\N	\N
25	2026-04-27 12:44:58.86	5	3	\N	1	\N	7	1	2026-05-07	cancelled_by_provider	unpaid	1000	free_anytime	provider	\N	\N	\N
26	2026-04-27 12:45:35.98	6	4	3	\N	\N	7	1	2026-05-07	cancelled_by_athlete	unpaid	800	free_until_24h	athlete	on_time	\N	\N
27	2026-04-27 21:46:57.591	1	1	1	\N	\N	6	7	2026-05-08	rejected_by_provider	unpaid	1000	free_until_24h	provider	\N	\N	\N
28	2026-04-27 21:49:00.864	1	1	1	\N	\N	6	7	2026-05-08	rejected_by_provider	unpaid	1000	free_until_24h	provider	\N	\N	\N
29	2026-04-27 22:00:42.175	1	1	1	\N	\N	6	7	2026-05-08	rejected_by_provider	unpaid	1000	free_until_24h	provider	\N	\N	\N
30	2026-04-29 09:17:17.903	1	1	1	\N	\N	1	7	2026-05-08	rejected_by_provider	unpaid	1000	free_until_24h	provider	\N	\N	\N
31	2026-05-08 09:37:57.16	1	1	1	\N	\N	1	7	2026-05-08	unmarked	unpaid	1000	free_until_24h	\N	\N	\N	\N
32	2026-08-13 11:53:55.625	6	4	3	\N	\N	6	1	2026-08-13	cancelled_by_provider	unpaid	800	free_until_24h	system	\N	\N	\N
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.cities (id, created_at, name, name_normalized, latitude, longitude) FROM stdin;
1	2026-03-17 09:00:00	Самара	самара	53.195878	50.100202
2	2026-03-17 09:00:00	Москва	москва	55.7558	37.6173
3	2026-03-17 09:00:00	Санкт-Петербург	санкт-петербург	59.9343	30.3351
4	2026-03-17 09:00:00	Казань	казань	55.7887	49.1221
5	2026-03-17 09:00:00	Екатеринбург	екатеринбург	56.8389	60.6057
6	2026-03-17 09:00:00	Тольятти	тольятти	53.5078	49.4204
\.


--
-- Data for Name: club_amenities; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.club_amenities (club_id, amenity_id) FROM stdin;
1	1
1	2
1	3
2	1
2	2
2	3
2	4
3	1
3	2
3	3
388	1
388	2
388	3
388	12
389	3
389	11
389	13
390	1
390	2
391	2
391	3
391	14
391	15
392	1
392	2
392	3
392	4
392	5
393	3
393	6
393	13
\.


--
-- Data for Name: club_images; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.club_images (id, club_id, url, "position") FROM stdin;
1	388	https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500&h=220&fit=crop&auto=format	0
2	389	https://images.unsplash.com/photo-1545389336-cf090694435e?w=500&h=220&fit=crop&auto=format	0
3	390	https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&h=220&fit=crop&auto=format	0
4	391	https://images.unsplash.com/photo-1549476464-37392f717541?w=500&h=220&fit=crop&auto=format	0
5	392	https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=500&h=220&fit=crop&auto=format	0
6	393	https://images.unsplash.com/photo-1547153760-18fc86324498?w=500&h=220&fit=crop&auto=format	0
\.


--
-- Data for Name: club_sports; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.club_sports (club_id, sport_id) FROM stdin;
1	7
2	2
2	4
2	7
2	8
3	1
3	8
3	5
388	4
388	6
389	1
389	8
390	6
391	7
391	2
392	3
393	5
\.


--
-- Data for Name: club_tags; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.club_tags (club_id, tag_id) FROM stdin;
1	13
1	14
2	5
2	13
2	14
3	13
3	14
388	1
388	6
388	10
389	1
389	8
389	9
390	1
391	1
391	3
391	11
391	14
392	2
392	4
392	13
393	1
393	11
393	14
\.


--
-- Data for Name: clubs; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.clubs (id, created_at, name, slug, slug_normalized, description, short_description, city, address, phone, email, website, vk, telegram, facebook, latitude, longitude, rating, review_count, price_from, distance_km, managed_by_user_id, source, status, hide_reason, hidden_at, hidden_by_user_id, hidden_kind, awaiting_recheck, verified_at, verified_by_user_id) FROM stdin;
1	2026-04-15 11:33:02.245	Самарская федерация Айкидо ёшинкан	самарская-федерация-айкидо-ёшинкан	самарская-федерация-айкидо-ёшинкан	Спортивный клуб «Самарская федерация Айкидо ёшинкан» — это место, где вы можете погрузиться в японскую культуру, занимаясь боевыми искусствами. Здесь вы научитесь не только физическим упражнениям, но и моральным принципам.\n\nВ клубе царит дух творчества, гармонии и взаимоуважения. Инструкторы школы — мастера высочайшего класса. Каждый год в клуб приезжает прославленный сенсей из Японии, чтобы провести мастер-класс.	Спортивный клуб «Самарская федерация Айкидо ёшинкан» — это место, где вы можете погрузиться в японскую культуру,…	Самара	Ново-Садовая ул., 106М	+7 (927) 754-14-14	test@mail.ru	\N	\N	\N	\N	53.22102	50.151918	3	2	1000	0	2	provider	published	\N	\N	\N	\N	f	\N	\N
3	2026-04-15 11:46:15.212	Невесомость	невесомость	невесомость	Спортивный клуб «Невесомость» — это место, где вы можете заниматься различными видами спорта, такими как акробатика, танцы на пилоне и фитнес.\nВ клубе работают опытные тренеры, которые помогут вам достичь ваших целей в спорте.	Спортивный клуб «Невесомость» — это место, где вы можете заниматься различными видами спорта, такими как акробатика,…	Самара	Ново-Садовая ул., 106, корп. З	+7 (846) 922-75-02	test@mail.ru	\N	\N	\N	\N	53.21771	50.148585	0	0	800	0	2	provider	published	\N	\N	\N	\N	f	2026-09-17 11:11:59.355	3
388	2026-01-01 09:00:00	Фитнес-центр «Ритм»	fitnes-centr-ritm	fitnes-centr-ritm	Просторный зал с кроссфит-зоной, тренажёрами и групповыми программами. Тренировки идут с утра до позднего вечера, есть направления для новичков.	Кроссфит, тренажёрный зал и групповые программы в центре города.	Самара	Ново-Садовая ул., 106	+7 (846) 000-10-10	ritm@sporthub.local	\N	\N	\N	\N	53.22102	50.151918	4.75	4	900	0	581	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
2	2026-04-15 11:38:03.619	Амстафф	амстафф	амстафф	Фитнес-клуб «Амстафф» — это место, где каждый найдет занятие по душе. Здесь проводятся тренировки по кроссфиту, тайскому боксу, кикбоксингу и другим видам спорта.\n\nКроме того, в клубе есть детская секция бокса. Клиенты отмечают, что в «Амстаффе» чисто и уютно, а персонал всегда готов помочь и пойти навстречу.	Фитнес-клуб «Амстафф» — это место, где каждый найдет занятие по душе.	Самара	Киевская улица, 13	+7 (917) 105-93-32	test@mail.ru	\N	\N	\N	\N	53.202373	50.151343	4.7	3	500	0	2	provider	published	\N	\N	\N	\N	f	\N	\N
389	2026-01-01 09:00:00	Студия «Баланс»	studiya-balans	studiya-balans	Небольшая студия йоги и пилатеса. Мягкий формат, малые группы, отдельные занятия по работе с осанкой.	Йога и пилатес малыми группами.	Самара	Молодогвардейская ул., 204	+7 (846) 000-20-20	balans@sporthub.local	\N	\N	\N	\N	53.202373	50.151343	4.75	4	700	0	581	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
390	2026-01-01 09:00:00	Кроссфит «Свобода»	crossfit-svoboda	crossfit-svoboda	Небольшой кроссфит-зал: функциональный тренинг, свободные веса, групповые занятия и персональные тренировки у владельца зала.	Кроссфит и персональные тренировки	Самара	ул. Свободы, 12	+7 (846) 000-10-30	svoboda@sporthub.local	\N	\N	\N	\N	53.235	50.19	4.666666666666667	3	1200	0	583	seed	published	\N	\N	\N	\N	f	\N	\N
391	2026-01-01 09:00:00	Bushido Fight Club	bushido-fight-club	bushido-fight-club	Клуб единоборств: бокс, кикбоксинг и борьба. Ринг, татами, группы для взрослых и подростков, спарринги по выходным.	Бокс, кикбоксинг и борьба — ринг и татами.	Самара	Московское ш., 41	+7 (846) 000-40-40	bushido@sporthub.local	\N	\N	\N	\N	53.2112	50.1932	4.75	4	2000	0	581	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
392	2026-01-01 09:00:00	Aqua Sport Center	aqua-sport-center	aqua-sport-center	Бассейн 25 метров, дорожки для свободного плавания и группы по технике. Утренние сеансы с шести утра, детские группы после обеда.	Бассейн 25 м, техника плавания, детские группы.	Самара	ул. Ново-Вокзальная, 62	+7 (846) 000-50-50	aqua@sporthub.local	\N	\N	\N	\N	53.2201	50.2201	4.75	4	900	0	581	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
393	2026-01-01 09:00:00	Dance Universe	dance-universe	dance-universe	Танцевальная студия: хип-хоп, контемпорари, латина и растяжка. Зеркальные залы, группы по уровням, вечерние занятия для взрослых.	Хип-хоп, контемпорари, латина — зеркальные залы.	Самара	ул. Ленинградская, 77	+7 (846) 000-60-60	dance@sporthub.local	\N	\N	\N	\N	53.1876	50.0942	4.666666666666667	3	1500	0	581	seed	published	\N	\N	\N	\N	f	\N	\N
\.


--
-- Data for Name: logs; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.logs (id, created_at, action, actor_id, actor_role, entity_type, entity_id, meta) FROM stdin;
1084	2026-09-10 19:04:56.233	reliability_recompute	3	admin	user	276	\N
4	2026-08-21 07:02:03.05	admin_login	3	admin	user	3	\N
5	2026-08-21 07:02:39.642	admin_login	3	admin	user	3	\N
1086	2026-09-10 19:04:56.267	admin_hard_delete_booking	3	admin	booking	1315	\N
1756	2026-09-12 20:23:24.598	admin_password_change	3	admin	user	402	{"targetName": "Прогон stranger", "targetEmail": "phase37-r1-stranger@test.local", "targetUserId": 402, "changedByUserId": 3}
1098	2026-09-10 19:06:39.455	reliability_recompute	3	admin	user	279	\N
969	2026-09-10 18:38:06.889	publish_create	12	person	trainer	85	{"city": "Самара", "name": "Павел Тренеров"}
974	2026-09-10 18:38:48.995	link_approve	2	person	trainer_club_link	110	{"clubId": 1, "trainerId": 85, "approvedBy": "club", "initiatedBy": "trainer"}
13	2026-09-09 04:35:32.375	link_request	2	club_owner	trainer_club_link	12	{"clubId": 7, "trainerId": 5, "initiatedBy": "club"}
14	2026-09-09 04:35:32.547	link_approve	12	trainer	trainer_club_link	12	{"clubId": 7, "trainerId": 5, "initiatedBy": "club"}
1682	2026-09-12 19:12:49.086	admin_impersonate_stop	3	admin	user	386	\N
1692	2026-09-12 19:15:08.928	admin_impersonate_stop	3	admin	user	386	\N
2385	2026-09-17 11:11:59.364	verification_grant	3	admin	club	3	{"name": "Невесомость"}
1709	2026-09-12 19:18:44.744	link_revoke	3	admin	trainer_club_link	165	{"clubId": 268, "forced": true, "revokedBy": "admin", "trainerId": 120, "detachedCount": 1}
1802	2026-09-12 20:45:07.269	admin_impersonate_start	3	admin	user	409	{"targetEmail": "phase37-r2-builder@test.local"}
1806	2026-09-12 20:45:15.533	link_revoke	3	admin	trainer_club_link	173	{"clubId": 285, "forced": true, "revokedBy": "admin", "trainerId": 124, "detachedCount": 1}
28	2026-09-09 04:43:07.486	link_request	2	club_owner	trainer_club_link	13	{"clubId": 13, "trainerId": 6, "initiatedBy": "club"}
29	2026-09-09 04:43:07.667	link_approve	12	trainer	trainer_club_link	13	{"clubId": 13, "trainerId": 6, "initiatedBy": "club"}
1730	2026-09-12 19:23:00.548	admin_impersonate_stop	3	admin	user	394	\N
1733	2026-09-12 19:23:08.814	link_revoke	3	admin	trainer_club_link	167	{"clubId": 272, "forced": true, "revokedBy": "admin", "trainerId": 121, "detachedCount": 1}
1739	2026-09-12 19:25:09.779	admin_impersonate_start	3	admin	user	394	{"targetEmail": "e2e-phase37-builder@test.local"}
1302	2026-09-10 19:27:30.209	admin_impersonate_start	3	admin	user	318	{"targetEmail": "e2e-recheck-builder@test.local"}
1303	2026-09-10 19:27:30.353	admin_impersonate_stop	3	admin	user	318	\N
42	2026-09-09 05:18:59.816	link_request	2	club_owner	trainer_club_link	14	{"clubId": 17, "trainerId": 7, "initiatedBy": "club"}
43	2026-09-09 05:18:59.993	link_approve	12	trainer	trainer_club_link	14	{"clubId": 17, "trainerId": 7, "approvedBy": "trainer", "initiatedBy": "club"}
2234	2026-09-16 20:33:53.189	admin_impersonate_start	3	admin	user	566	{"targetEmail": "ph38-mcp-builder@test.local"}
1082	2026-09-10 19:04:55.612	admin_impersonate_stop	3	admin	user	274	\N
955	2026-09-10 11:21:57.639	admin_impersonate_start	3	admin	user	1	{"targetEmail": "alexey@sporthub.local"}
957	2026-09-10 11:24:11.043	reliability_recompute	3	admin	user	1	\N
958	2026-09-10 11:24:14.993	reliability_recompute	3	admin	user	4	\N
959	2026-09-10 11:24:16.075	reliability_recompute	3	admin	user	5	\N
778	2026-09-10 07:58:41.308	admin_impersonate_start	3	admin	user	171	{"targetEmail": "e2e-p34sec-builder@test.local"}
1089	2026-09-10 19:06:37.61	admin_impersonate_start	3	admin	user	277	{"targetEmail": "e2e-recheck-builder@test.local"}
780	2026-09-10 07:58:41.838	admin_impersonate_stop	3	admin	user	171	\N
2264	2026-09-17 00:54:09.997	admin_impersonate_start	3	admin	user	572	{"targetEmail": "ph38-mcp-builder@test.local"}
866	2026-09-10 08:28:03.147	admin_impersonate_start	3	admin	user	211	{"targetEmail": "e2e-p34sec-builder@test.local"}
2162	2026-09-16 16:50:49.866	admin_impersonate_start	3	admin	user	551	{"targetEmail": "ph38-mcp-builder@test.local"}
1657	2026-09-12 19:01:55.55	admin_impersonate_stop	3	admin	user	373	\N
1658	2026-09-12 19:01:58.232	admin_password_change	3	admin	user	374	{"targetName": "Прогон stranger", "targetEmail": "e2e-phase37-stranger@test.local", "targetUserId": 374, "changedByUserId": 3}
1100	2026-09-10 19:06:39.485	admin_hard_delete_booking	3	admin	booking	1317	\N
1754	2026-09-12 20:23:21.9	admin_impersonate_start	3	admin	user	401	{"targetEmail": "phase37-r1-builder@test.local"}
1758	2026-09-12 20:23:30.167	link_revoke	3	admin	trainer_club_link	169	{"clubId": 277, "forced": true, "revokedBy": "admin", "trainerId": 122, "detachedCount": 1}
800	2026-09-10 08:07:26.341	admin_impersonate_start	3	admin	user	181	{"targetEmail": "e2e-p34sec-builder@test.local"}
890	2026-09-10 08:31:41.133	admin_impersonate_stop	3	admin	user	221	\N
2189	2026-09-16 19:55:04.614	admin_impersonate_start	3	admin	user	557	{"targetEmail": "ph38-mcp-builder@test.local"}
1685	2026-09-12 19:12:57.304	link_revoke	3	admin	trainer_club_link	163	{"clubId": 264, "forced": true, "revokedBy": "admin", "trainerId": 119, "detachedCount": 1}
240	2026-09-10 07:32:00.329	reliability_recompute	3	admin	user	91	\N
802	2026-09-10 08:07:26.916	admin_impersonate_stop	3	admin	user	181	\N
246	2026-09-10 07:35:37.428	admin_impersonate_stop	3	admin	user	92	\N
1705	2026-09-12 19:18:36.489	admin_impersonate_start	3	admin	user	390	{"targetEmail": "e2e-phase37-builder@test.local"}
255	2026-09-10 07:35:51.027	admin_impersonate_stop	3	admin	user	95	\N
2211	2026-09-16 20:11:47.454	admin_impersonate_start	3	admin	user	560	{"targetEmail": "ph38-mcp-builder@test.local"}
1715	2026-09-12 19:20:45.668	admin_impersonate_start	3	admin	user	390	{"targetEmail": "e2e-phase37-builder@test.local"}
467	2026-09-10 07:47:01.555	admin_impersonate_stop	3	admin	user	129	\N
1311	2026-09-10 19:27:32.086	reliability_recompute	3	admin	user	320	\N
1313	2026-09-10 19:27:32.111	admin_hard_delete_booking	3	admin	booking	1371	\N
566	2026-09-10 07:51:39.463	admin_impersonate_stop	3	admin	user	147	\N
1731	2026-09-12 19:23:03.228	admin_password_change	3	admin	user	395	{"targetName": "Прогон stranger", "targetEmail": "e2e-phase37-stranger@test.local", "targetUserId": 395, "changedByUserId": 3}
1740	2026-09-12 19:25:19.676	admin_impersonate_stop	3	admin	user	394	\N
2235	2026-09-16 20:33:55.75	admin_impersonate_stop	3	admin	user	566	\N
359	2026-09-10 07:44:16.971	admin_impersonate_start	3	admin	user	120	{"targetEmail": "e2e-p34dbg-builder@test.local"}
1803	2026-09-12 20:45:07.284	admin_impersonate_stop	3	admin	user	409	\N
945	2026-09-10 08:59:26.112	admin_impersonate_start	3	admin	user	241	{"targetEmail": "e2e-a-builder@test.local"}
946	2026-09-10 08:59:26.267	admin_impersonate_stop	3	admin	user	241	\N
1081	2026-09-10 19:04:55.458	admin_impersonate_start	3	admin	user	274	{"targetEmail": "e2e-recheck-builder@test.local"}
972	2026-09-10 18:38:27.051	link_request	12	person	trainer_club_link	110	{"clubId": 1, "trainerId": 85, "initiatedBy": "trainer"}
2265	2026-09-17 00:54:12.599	admin_impersonate_stop	3	admin	user	572	\N
56	2026-09-09 05:23:16.912	link_request	2	club_owner	trainer_club_link	15	{"clubId": 21, "trainerId": 8, "initiatedBy": "club"}
57	2026-09-09 05:23:17.083	link_approve	12	trainer	trainer_club_link	15	{"clubId": 21, "trainerId": 8, "approvedBy": "trainer", "initiatedBy": "club"}
1656	2026-09-12 19:01:55.539	admin_impersonate_start	3	admin	user	373	{"targetEmail": "e2e-phase37-builder@test.local"}
1666	2026-09-12 19:03:54.788	admin_impersonate_start	3	admin	user	373	{"targetEmail": "e2e-phase37-builder@test.local"}
1764	2026-09-12 20:25:50.409	admin_impersonate_start	3	admin	user	401	{"targetEmail": "phase37-r1-builder@test.local"}
2163	2026-09-16 16:50:52.444	admin_impersonate_stop	3	admin	user	551	\N
2190	2026-09-16 19:55:07.204	admin_impersonate_stop	3	admin	user	557	\N
2283	2026-09-17 01:08:45.665	admin_impersonate_start	3	admin	user	575	{"targetEmail": "ph38-mcp-builder@test.local"}
70	2026-09-09 05:27:48.717	link_request	2	club_owner	trainer_club_link	16	{"clubId": 25, "trainerId": 9, "initiatedBy": "club"}
71	2026-09-09 05:27:48.901	link_approve	12	trainer	trainer_club_link	16	{"clubId": 25, "trainerId": 9, "approvedBy": "trainer", "initiatedBy": "club"}
1706	2026-09-12 19:18:36.507	admin_impersonate_stop	3	admin	user	390	\N
1804	2026-09-12 20:45:09.989	admin_password_change	3	admin	user	410	{"targetName": "Прогон stranger", "targetEmail": "phase37-r2-stranger@test.local", "targetUserId": 410, "changedByUserId": 3}
1716	2026-09-12 19:20:55.624	admin_impersonate_stop	3	admin	user	390	\N
2212	2026-09-16 20:11:50.045	admin_impersonate_stop	3	admin	user	560	\N
84	2026-09-09 05:42:44.339	link_request	2	club_owner	trainer_club_link	17	{"clubId": 29, "trainerId": 10, "initiatedBy": "club"}
85	2026-09-09 05:42:44.515	link_approve	12	trainer	trainer_club_link	17	{"clubId": 29, "trainerId": 10, "approvedBy": "trainer", "initiatedBy": "club"}
98	2026-09-09 05:58:49.321	link_request	2	club_owner	trainer_club_link	18	{"clubId": 33, "trainerId": 11, "initiatedBy": "club"}
99	2026-09-09 05:58:49.501	link_approve	12	trainer	trainer_club_link	18	{"clubId": 33, "trainerId": 11, "approvedBy": "trainer", "initiatedBy": "club"}
100	2026-09-09 09:17:21.395	link_request	2	club_owner	trainer_club_link	19	{"clubId": 1, "trainerId": 1, "initiatedBy": "club"}
101	2026-09-09 09:17:21.514	link_approve	2	club_owner	trainer_club_link	19	{"clubId": 1, "trainerId": 1, "approvedBy": "trainer", "initiatedBy": "club"}
956	2026-09-10 11:24:05.098	admin_impersonate_stop	3	admin	user	1	\N
1090	2026-09-10 19:06:37.758	admin_impersonate_stop	3	admin	user	277	\N
1660	2026-09-12 19:02:03.681	link_revoke	3	admin	trainer_club_link	161	{"clubId": 259, "forced": true, "revokedBy": "admin", "trainerId": 118, "detachedCount": 1}
298	2026-09-10 07:37:15.565	admin_impersonate_start	3	admin	user	104	{"targetEmail": "e2e-p34sec-builder@test.local"}
300	2026-09-10 07:37:16.017	admin_impersonate_stop	3	admin	user	104	\N
868	2026-09-10 08:28:03.69	admin_impersonate_stop	3	admin	user	211	\N
1667	2026-09-12 19:04:02.075	admin_impersonate_stop	3	admin	user	373	\N
1755	2026-09-12 20:23:21.919	admin_impersonate_stop	3	admin	user	401	\N
1765	2026-09-12 20:26:00.509	admin_impersonate_stop	3	admin	user	401	\N
1681	2026-09-12 19:12:49.07	admin_impersonate_start	3	admin	user	386	{"targetEmail": "e2e-phase37-builder@test.local"}
1683	2026-09-12 19:12:51.774	admin_password_change	3	admin	user	387	{"targetName": "Прогон stranger", "targetEmail": "e2e-phase37-stranger@test.local", "targetUserId": 387, "changedByUserId": 3}
1691	2026-09-12 19:14:58.949	admin_impersonate_start	3	admin	user	386	{"targetEmail": "e2e-phase37-builder@test.local"}
888	2026-09-10 08:31:40.611	admin_impersonate_start	3	admin	user	221	{"targetEmail": "e2e-p34sec-builder@test.local"}
1707	2026-09-12 19:18:39.183	admin_password_change	3	admin	user	391	{"targetName": "Прогон stranger", "targetEmail": "e2e-phase37-stranger@test.local", "targetUserId": 391, "changedByUserId": 3}
2384	2026-09-17 11:08:05.229	verification_grant	3	admin	trainer	85	{"name": "Павел Тренеров"}
2284	2026-09-17 01:08:48.06	admin_impersonate_stop	3	admin	user	575	\N
564	2026-09-10 07:51:38.929	admin_impersonate_start	3	admin	user	147	{"targetEmail": "e2e-p34sec-builder@test.local"}
1729	2026-09-12 19:23:00.529	admin_impersonate_start	3	admin	user	394	{"targetEmail": "e2e-phase37-builder@test.local"}
233	2026-09-10 07:29:58.31	reliability_recompute	3	admin	user	88	\N
465	2026-09-10 07:47:01.035	admin_impersonate_start	3	admin	user	129	{"targetEmail": "e2e-p34sec-builder@test.local"}
245	2026-09-10 07:35:37.281	admin_impersonate_start	3	admin	user	92	{"targetEmail": "e2e-admin-builder@test.local"}
249	2026-09-10 07:35:38.127	reliability_recompute	3	admin	user	94	\N
254	2026-09-10 07:35:50.884	admin_impersonate_start	3	admin	user	95	{"targetEmail": "e2e-admin-builder@test.local"}
258	2026-09-10 07:35:51.701	reliability_recompute	3	admin	user	97	\N
822	2026-09-10 08:12:13.859	admin_impersonate_start	3	admin	user	191	{"targetEmail": "e2e-p34sec-builder@test.local"}
824	2026-09-10 08:12:14.4	admin_impersonate_stop	3	admin	user	191	\N
949	2026-09-10 08:59:27	reliability_recompute	3	admin	user	243	\N
844	2026-09-10 08:17:51.949	admin_impersonate_start	3	admin	user	201	{"targetEmail": "e2e-p34sec-builder@test.local"}
846	2026-09-10 08:17:52.507	admin_impersonate_stop	3	admin	user	201	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.notifications (id, created_at, user_id, type, payload, read_at, addressee_club_id, addressee_trainer_id, addressee_kind, read_by_user_id) FROM stdin;
12689	2026-09-17 11:08:05.23	12	publication_verified_for_owner	{"subjectId": 85, "subjectType": "trainer", "publicationName": "Павел Тренеров"}	\N	\N	85	trainer	\N
1	2026-04-23 08:56:28.671	2	link_rejected	{"subjectId": 2, "subjectType": "link"}	2026-04-23 09:48:04.171	\N	\N	personal	\N
6	2026-04-23 10:44:30.112	7	booking_confirmed	{"subjectId": 3, "subjectType": "booking"}	2026-04-23 10:44:57.049	\N	\N	personal	\N
13	2026-04-23 17:10:39.17	2	booking_requested	{"subjectId": 6, "scheduleId": 3, "subjectType": "booking", "athleteUserId": 1}	2026-04-23 17:47:16.525	\N	\N	personal	\N
14	2026-04-23 17:10:40.033	1	booking_confirmed	{"subjectId": 6, "subjectType": "booking"}	2026-04-23 17:13:32.67	\N	\N	personal	\N
15	2026-04-23 17:19:40.629	1	booking_cancelled_by_athlete	{"subjectId": 6, "subjectType": "booking", "cancelReason": "late"}	2026-04-23 23:47:18.37	\N	\N	personal	\N
16	2026-04-23 17:19:40.629	2	booking_cancelled_by_athlete_to_provider	{"subjectId": 6, "subjectType": "booking", "cancelReason": "late", "athleteUserId": 1}	2026-04-23 17:47:16.147	\N	\N	personal	\N
17	2026-04-23 17:20:04.662	2	booking_requested	{"subjectId": 7, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 1}	2026-04-23 17:47:15.369	\N	\N	personal	\N
18	2026-04-23 17:20:04.978	1	booking_confirmed	{"subjectId": 7, "subjectType": "booking"}	2026-04-23 23:47:18.37	\N	\N	personal	\N
19	2026-04-23 17:20:05.097	1	booking_cancelled_by_provider	{"subjectId": 7, "subjectType": "booking"}	2026-04-23 23:47:18.37	\N	\N	personal	\N
20	2026-04-23 17:20:35.562	2	booking_requested	{"subjectId": 8, "scheduleId": 3, "subjectType": "booking", "athleteUserId": 1}	2026-04-23 17:47:14.765	\N	\N	personal	\N
21	2026-04-23 17:21:40.707	1	booking_confirmed	{"subjectId": 8, "subjectType": "booking"}	2026-04-23 23:47:18.37	\N	\N	personal	\N
22	2026-04-23 17:22:15.127	7	booking_completed	{"subjectId": 3, "subjectType": "booking"}	2026-04-23 17:50:17.473	\N	\N	personal	\N
24	2026-04-23 17:50:33.925	2	booking_requested	{"subjectId": 9, "scheduleId": 1, "subjectType": "booking", "athleteUserId": 7}	2026-04-23 17:54:17.866	\N	\N	personal	\N
25	2026-04-23 18:00:33.244	7	booking_auto_expired	{"subjectId": 9, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
26	2026-04-23 18:00:33.263	2	booking_auto_expired_to_provider	{"subjectId": 9, "subjectType": "booking", "athleteUserId": 7}	2026-04-23 18:24:47.752	\N	\N	personal	\N
28	2026-04-23 23:45:16.854	2	booking_requested	{"subjectId": 10, "scheduleId": 3, "subjectType": "booking", "athleteUserId": 1}	2026-04-24 00:00:33.949	\N	\N	personal	\N
31	2026-04-23 23:50:14.958	2	booking_requested	{"subjectId": 11, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 1}	2026-04-24 00:00:33.633	\N	\N	personal	\N
34	2026-04-23 23:50:16.973	2	booking_cancelled_by_athlete_to_provider	{"subjectId": 11, "subjectType": "booking", "cancelReason": "late", "athleteUserId": 1}	2026-04-24 00:00:33.333	\N	\N	personal	\N
12690	2026-09-17 11:11:59.367	2	publication_verified_for_owner	{"subjectId": 3, "subjectType": "club", "publicationName": "Невесомость"}	\N	3	\N	club	\N
35	2026-04-23 23:50:17.174	2	booking_requested	{"subjectId": 12, "scheduleId": 1, "subjectType": "booking", "athleteUserId": 1}	2026-04-24 00:00:32.191	\N	\N	personal	\N
38	2026-04-23 23:50:17.753	2	booking_requested	{"subjectId": 13, "scheduleId": 4, "subjectType": "booking", "athleteUserId": 1}	2026-04-24 00:00:31.48	\N	\N	personal	\N
40	2026-04-23 23:50:18.018	2	booking_auto_expired_to_provider	{"subjectId": 13, "subjectType": "booking", "athleteUserId": 1}	2026-04-24 00:00:31.205	\N	\N	personal	\N
41	2026-04-23 23:52:53.102	2	booking_requested	{"subjectId": 14, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 6}	2026-04-24 00:00:30.222	\N	\N	personal	\N
42	2026-04-23 23:52:53.112	2	booking_requested	{"subjectId": 15, "scheduleId": 3, "subjectType": "booking", "athleteUserId": 7}	2026-04-24 00:00:29.314	\N	\N	personal	\N
43	2026-04-23 23:52:53.381	6	booking_auto_expired	{"subjectId": 14, "subjectType": "booking"}	\N	\N	\N	personal	\N
44	2026-04-23 23:52:53.387	2	booking_auto_expired_to_provider	{"subjectId": 14, "subjectType": "booking", "athleteUserId": 6}	2026-04-24 00:00:28.872	\N	\N	personal	\N
45	2026-04-23 23:52:53.431	7	booking_auto_expired	{"subjectId": 15, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
46	2026-04-23 23:52:53.442	2	booking_auto_expired_to_provider	{"subjectId": 15, "subjectType": "booking", "athleteUserId": 7}	2026-04-24 00:00:28.148	\N	\N	personal	\N
47	2026-04-23 23:53:05.891	2	booking_requested	{"subjectId": 16, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 6}	2026-04-24 00:00:09.139	\N	\N	personal	\N
48	2026-04-23 23:53:06.256	6	booking_confirmed	{"subjectId": 16, "subjectType": "booking"}	\N	\N	\N	personal	\N
49	2026-04-23 23:53:06.38	2	booking_requested	{"subjectId": 17, "scheduleId": 3, "subjectType": "booking", "athleteUserId": 7}	2026-04-24 00:00:03.255	\N	\N	personal	\N
50	2026-04-23 23:53:06.451	7	booking_confirmed	{"subjectId": 17, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
51	2026-04-23 23:53:06.548	2	booking_requested	{"subjectId": 18, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 7}	2026-04-24 00:00:00.778	\N	\N	personal	\N
52	2026-04-23 23:53:06.656	7	booking_confirmed	{"subjectId": 18, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
53	2026-04-23 23:53:23.447	7	booking_completed	{"subjectId": 17, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
89	2026-04-27 12:43:35.861	2	booking_cancelled_by_athlete_to_provider	{"subjectId": 23, "subjectType": "booking", "cancelReason": "on_time", "athleteUserId": 1}	2026-05-05 05:26:39.275	\N	\N	personal	\N
95	2026-04-27 12:44:58.954	7	booking_confirmed	{"subjectId": 25, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
96	2026-04-27 12:44:59.23	7	booking_cancelled_by_provider	{"subjectId": 25, "subjectType": "booking"}	2026-05-07 15:04:05.868	\N	\N	personal	\N
98	2026-04-27 12:46:59.766	7	booking_cancelled_by_athlete	{"subjectId": 26, "subjectType": "booking", "cancelReason": "on_time"}	2026-05-07 15:03:52.152	\N	\N	personal	\N
101	2026-04-27 21:47:52.783	6	booking_rejected	{"reason": "не хочу", "subjectId": 27, "subjectType": "booking"}	\N	\N	\N	personal	\N
123	2026-04-27 22:32:57.317	7	booking_cancelled_by_athlete	{"subjectId": 1006, "subjectType": "booking", "cancelReason": "late"}	2026-04-29 09:16:14.36	\N	\N	personal	\N
126	2026-04-27 22:34:19.863	8	booking_cancelled_by_athlete	{"subjectId": 1007, "subjectType": "booking", "cancelReason": "on_time"}	\N	\N	\N	personal	\N
131	2026-05-07 15:33:06.021	6	review_published_for_athlete	{"subjectId": 2, "entityName": "Амстафф", "subjectType": "review"}	\N	\N	\N	personal	\N
132	2026-05-08 09:37:57.162	2	booking_requested	{"subjectId": 31, "scheduleId": 1, "subjectType": "booking", "athleteUserId": 1}	2026-05-08 09:38:29.774	\N	\N	personal	\N
133	2026-05-08 09:38:39.208	1	booking_confirmed	{"subjectId": 31, "subjectType": "booking"}	2026-05-08 09:39:25.651	\N	\N	personal	\N
134	2026-08-13 11:53:55.63	2	booking_requested	{"subjectId": 32, "scheduleId": 6, "subjectType": "booking", "athleteUserId": 6}	\N	\N	\N	personal	\N
135	2026-08-18 14:44:26.522	6	booking_auto_expired	{"subjectId": 32, "subjectType": "booking"}	\N	\N	\N	personal	\N
136	2026-08-18 14:44:26.523	2	booking_auto_expired_to_provider	{"subjectId": 32, "subjectType": "booking", "athleteUserId": 6}	\N	\N	\N	personal	\N
137	2026-08-18 14:45:30.661	4	booking_requested	{"subjectId": 33, "scheduleId": 9, "subjectType": "booking", "athleteUserId": 1}	\N	\N	\N	personal	\N
139	2026-08-18 14:45:30.805	4	booking_cancelled_by_athlete_to_provider	{"subjectId": 33, "subjectType": "booking", "cancelReason": "late", "athleteUserId": 1}	\N	\N	\N	personal	\N
147	2026-09-09 04:39:33.738	2	review_received_by_provider	{"rating": 5, "subjectId": 4, "authorName": "Алексей Смирнов", "entityName": "Амстафф", "fromUserId": 1, "subjectType": "review"}	\N	\N	\N	personal	\N
149	2026-09-09 04:39:33.885	2	review_received_by_provider	{"rating": 4, "subjectId": 5, "authorName": "Алексей Смирнов", "entityName": "Амстафф", "fromUserId": 1, "subjectType": "review"}	\N	\N	\N	personal	\N
200	2026-09-09 09:17:21.394	2	link_requested	{"subjectId": 19, "initiatedBy": "club", "subjectType": "link"}	\N	\N	\N	personal	\N
201	2026-09-09 09:17:21.513	2	link_approved	{"subjectId": 19, "initiatedBy": "club", "subjectType": "link"}	\N	\N	\N	personal	\N
207	2026-09-10 07:00:06.236	2	booking_requested	{"subjectId": 1038, "scheduleId": 6, "subjectType": "booking", "athleteUserId": 53}	\N	3	\N	club	\N
794	2026-09-10 18:38:27.05	2	link_requested	{"subjectId": 110, "initiatedBy": "trainer", "subjectType": "link"}	\N	1	\N	club	\N
795	2026-09-10 18:38:48.993	12	link_approved	{"subjectId": 110, "initiatedBy": "trainer", "subjectType": "link"}	\N	\N	85	trainer	\N
54	2026-04-23 23:53:42.68	7	booking_completed	{"subjectId": 18, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
1021	2026-09-11 08:01:04.946	3	publication_recheck_requested	{"subjectId": 207, "subjectType": "club", "publicationName": "e2e-notif9 Клуб А"}	\N	\N	\N	personal	\N
74	2026-04-27 12:27:36.24	2	booking_requested	{"subjectId": 18, "scheduleId": 1, "subjectType": "booking", "athleteUserId": 1}	2026-05-05 05:26:39.275	\N	\N	personal	\N
76	2026-04-27 12:29:42.768	2	booking_requested	{"subjectId": 19, "scheduleId": 6, "subjectType": "booking", "athleteUserId": 1}	2026-05-05 05:26:39.275	\N	\N	personal	\N
79	2026-04-27 12:35:52.391	2	booking_requested	{"subjectId": 20, "scheduleId": 1, "subjectType": "booking", "athleteUserId": 6}	2026-05-05 05:26:39.275	\N	\N	personal	\N
80	2026-04-27 12:35:53.158	6	booking_confirmed	{"subjectId": 20, "subjectType": "booking"}	\N	\N	\N	personal	\N
81	2026-04-27 12:35:53.765	6	booking_no_show	{"subjectId": 20, "subjectType": "booking"}	\N	\N	\N	personal	\N
82	2026-04-27 12:36:12.438	2	booking_requested	{"subjectId": 21, "scheduleId": 2, "subjectType": "booking", "athleteUserId": 7}	2026-05-05 05:26:39.275	\N	\N	personal	\N
83	2026-04-27 12:36:12.464	7	booking_confirmed	{"subjectId": 21, "subjectType": "booking"}	2026-05-07 15:04:18.402	\N	\N	personal	\N
87	2026-04-27 12:43:34.487	2	booking_requested	{"subjectId": 23, "scheduleId": 6, "subjectType": "booking", "athleteUserId": 1}	2026-05-05 05:26:39.275	\N	\N	personal	\N
138	2026-08-18 14:45:30.804	1	booking_cancelled_by_athlete	{"subjectId": 33, "subjectType": "booking", "cancelReason": "late"}	2026-09-10 11:23:26.209	\N	\N	personal	\N
148	2026-09-09 04:39:33.738	1	review_published_for_athlete	{"subjectId": 4, "entityName": "Амстафф", "subjectType": "review"}	2026-09-10 11:23:26.209	\N	\N	personal	\N
150	2026-09-09 04:39:33.885	1	review_published_for_athlete	{"subjectId": 5, "entityName": "Амстафф", "subjectType": "review"}	2026-09-10 11:23:26.209	\N	\N	personal	\N
\.


--
-- Data for Name: offerings; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.offerings (id, created_at, owner_club_id, owner_trainer_id, venue_club_id, trainer_club_link_id, cancellation_policy, sport_id, title, description, format, price, duration_minutes, capacity, address, latitude, longitude) FROM stdin;
1	2026-04-15 11:33:02.245	1	\N	\N	\N	free_until_24h	7	Занятия — Самарская федерация Айкидо ёшинкан	Спортивный клуб «Самарская федерация Айкидо ёшинкан» — это место, где вы можете погрузиться в японскую культуру, занимаясь боевыми искусствами. Здесь вы научитесь не только физическим упражнениям, но и моральным принципам.\n\nВ клубе царит дух творчества, гармонии и взаимоуважения. Инструкторы школы — мастера высочайшего класса. Каждый год в клуб приезжает прославленный сенсей из Японии, чтобы провести мастер-класс.	group	1000	60	20	Ново-Садовая ул., 106М	53.22102	50.151918
2	2026-04-15 11:38:03.619	2	\N	\N	\N	free_until_24h	2	Занятия — Амстафф	Фитнес-клуб «Амстафф» — это место, где каждый найдет занятие по душе. Здесь проводятся тренировки по кроссфиту, тайскому боксу, кикбоксингу и другим видам спорта.\n\nКроме того, в клубе есть детская секция бокса. Клиенты отмечают, что в «Амстаффе» чисто и уютно, а персонал всегда готов помочь и пойти навстречу.	group	500	60	20	Киевская улица, 13	53.202373	50.151343
4	2026-04-15 11:46:15.212	3	\N	\N	\N	free_until_24h	1	Занятия — Невесомость	Спортивный клуб «Невесомость» — это место, где вы можете заниматься различными видами спорта, такими как акробатика, танцы на пилоне и фитнес.\nВ клубе работают опытные тренеры, которые помогут вам достичь ваших целей в спорте.	group	800	60	20	Ново-Садовая ул., 106, корп. З	53.21771	50.148585
3	2026-04-15 11:42:40.411	\N	1	2	1	free_anytime	1	Йога	Оздоровительные тренировки по растяжке, йоге	group	1000	60	1	Киевская ул., 1	53.202373	50.151343
5	2026-04-16 09:31:52.314	\N	2	\N	\N	no_refund	8	ПрофессиОНАЛЬНЫЙ пилатес	пилатируем ваш анал пилатируем ваш анал пилатируем ваш анал пилатируем ваш аналпилатируем ваш аналпилатируем ваш аналпилатируем ваш анал	group	2500	75	1	проспект Ст. Разина 14	53.529032	49.296282
537	2026-01-01 09:00:00	388	\N	\N	\N	free_until_24h	4	Кроссфит — групповая тренировка	Функциональный круг с прогрессией нагрузки. Группы до двенадцати человек.	group	900	60	12	Ново-Садовая ул., 106	53.22102	50.151918
538	2026-01-01 09:00:00	389	\N	\N	\N	free_until_24h	1	Йога для начинающих	Спокойный темп, разбор базовых положений, работа с дыханием.	group	700	75	10	Молодогвардейская ул., 204	53.202373	50.151343
539	2026-01-01 09:00:00	\N	156	388	210	free_until_2h	8	Пилатес — индивидуально	Персональное занятие с разбором осанки и подбором программы.	personal	1500	55	1	Ново-Садовая ул., 106	53.22102	50.151918
540	2026-01-01 09:00:00	391	\N	\N	\N	free_until_24h	2	Бокс — групповая тренировка	Работа в парах, лапы, техника защиты. Группы до десяти человек.	group	2000	60	10	Московское ш., 41	53.2112	50.1932
541	2026-01-01 09:00:00	392	\N	\N	\N	free_until_24h	3	Плавание — техника кроля	Постановка дыхания и гребка, дорожка на группу до восьми человек.	group	900	60	8	ул. Ново-Вокзальная, 62	53.2201	50.2201
542	2026-01-01 09:00:00	393	\N	\N	\N	free_until_24h	5	Хип-хоп — открытый класс	Базовые связки и импровизация, любой уровень.	group	1500	60	14	ул. Ленинградская, 77	53.1876	50.0942
543	2026-01-01 09:00:00	\N	158	391	211	free_until_2h	2	Бокс — персональная тренировка	Индивидуальная работа на лапах и технике, разбор боя.	personal	3000	60	1	Московское ш., 41	53.2112	50.1932
544	2026-01-01 09:00:00	\N	159	388	212	free_until_2h	6	Силовая — персональная тренировка	Техника базовых движений и программа под цель.	personal	2800	60	1	Ново-Садовая ул., 106	53.22102	50.151918
232	2026-09-10 18:38:06.886	\N	85	\N	\N	\N	2	Персональная тренировка	Занятие один на один с разбором техники и планом на неделю.	personal	1800	60	1	Зал на Ленинградской	0	0
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.password_reset_tokens (id, created_at, token_hash, user_id, expires_at, used_at) FROM stdin;
2	2026-09-09 04:35:34.768	ff185e3bd97df7f09441aa53f823ab4528f8e52c58866d31f094f55960cdda93	2	2026-09-09 05:35:34.767	2026-09-09 04:35:36.198
4	2026-09-09 04:43:09.865	cc4499a6fcedfb4bd081412e6bc7dca9ae587289554a1571592a6ef80ea63c01	2	2026-09-09 05:43:09.864	2026-09-09 04:43:11.31
3	2026-09-09 04:35:36.264	783b3eaea7353d1189ab21f46a6b21b1b8f170003cdb0ee5caa26c055d4f56e0	2	2026-09-09 05:35:36.263	2026-09-09 04:43:11.31
6	2026-09-09 05:19:02.183	2517d620d6dacc70fce26970164ce5f286ffa41f3ca9fe6ec7d0877fe112c698	2	2026-09-09 06:19:02.181	2026-09-09 05:19:03.619
5	2026-09-07 04:43:11.424	1303f28023cd0c7172f3d84bcaa156a57a8a95e6d1e725b4d10fa57e0f9fa1c2	2	2026-09-08 04:43:11.424	2026-09-09 05:19:03.619
8	2026-09-09 05:23:19.232	6b2786059d3d4afa1a5542b7ba5bce295a9f14bb74c317f7d17b412c4f18ea20	2	2026-09-09 06:23:19.231	2026-09-09 05:23:20.724
7	2026-09-07 05:19:03.74	e5ab7c0e43709fe492824f87109f5e37444d3752176161cc9f46c15392469568	2	2026-09-08 05:19:03.74	2026-09-09 05:23:20.724
12	2026-09-09 05:42:46.721	cb85182dd30c47d225f1af9c104489afe826e37dc7880214a28017c4d2380083	2	2026-09-09 06:42:46.721	2026-09-09 05:42:48.17
9	2026-09-07 05:23:20.837	434ed30becedd8f25b7265f7edada9c4c57d0337868d20fab12ba2570e832226	2	2026-09-08 05:23:20.837	2026-09-09 05:42:48.17
10	2026-09-09 05:27:51.106	9fad310b082007a0e579125b956437484d438f98907d1553a4144717bbea7bdc	2	2026-09-09 06:27:51.105	2026-09-09 05:42:48.17
11	2026-09-07 05:27:52.751	35aa78c97efd52176017d6946941987915257f93ca9c9e769bc0a15f35a117d9	2	2026-09-08 05:27:52.751	2026-09-09 05:42:48.17
14	2026-09-09 05:58:51.708	000725c3263dd81c3a79e6d2550bf91d1f906ac8c26fe29184b450dbf473d15e	2	2026-09-09 06:58:51.706	2026-09-09 05:58:53.158
13	2026-09-07 05:42:48.293	0d6ccee6fa81f3248b0b3304b74e7d48a036086e6ff1d5ab09ffcc38ba94bd7b	2	2026-09-08 05:42:48.293	2026-09-09 05:58:53.158
15	2026-09-07 05:58:53.274	301a00496ab5912b88c63f72af90872df74fe74668768fb223aa2977a2c10b5a	2	2026-09-08 05:58:53.274	\N
\.


--
-- Data for Name: provider_client_notes; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.provider_client_notes (id, created_at, updated_at, provider_user_id, client_user_id, note, booking_id, face_club_id, face_trainer_id) FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.reviews (id, created_at, user_id, club_id, trainer_id, rating, text) FROM stdin;
1	2026-04-29 09:22:34.962	6	1	\N	2	Максим сергеич хреновый тренер
2	2026-05-07 15:33:06.003	6	2	\N	5	Отличный клуб, проверка уведомлений из Phase 29 Step 29.4!
3	2026-05-07 16:11:58.579	1	1	\N	4	ну ничо там
4	2026-09-09 04:39:33.733	1	2	\N	5	Занятие прошло отлично, проверка правила отзыва после посещения.
5	2026-09-09 04:39:33.881	1	2	\N	4	Повторная попытка оставить отзыв тому же клубу.
17	2026-01-10 10:00:00	585	388	\N	5	Чисто, удобное расписание, записалась за минуту.
18	2026-02-11 10:00:00	586	388	\N	5	Хорошая атмосфера, группы небольшие — внимание каждому.
19	2026-03-12 10:00:00	587	388	\N	4	Пришёл новичком, через месяц уже видна разница.
20	2026-04-13 10:00:00	588	388	\N	5	Занятия вовремя, зал просторный, есть парковка.
21	2026-01-10 10:00:00	585	389	\N	5	Хорошая атмосфера, группы небольшие — внимание каждому.
22	2026-02-11 10:00:00	586	389	\N	5	Пришёл новичком, через месяц уже видна разница.
23	2026-03-12 10:00:00	587	389	\N	4	Занятия вовремя, зал просторный, есть парковка.
24	2026-04-13 10:00:00	588	389	\N	5	Отличные тренеры, всё по делу и без воды.
25	2026-01-10 10:00:00	585	390	\N	5	Пришёл новичком, через месяц уже видна разница.
26	2026-02-11 10:00:00	586	390	\N	5	Занятия вовремя, зал просторный, есть парковка.
27	2026-03-12 10:00:00	587	390	\N	4	Отличные тренеры, всё по делу и без воды.
28	2026-01-10 10:00:00	585	391	\N	5	Занятия вовремя, зал просторный, есть парковка.
29	2026-02-11 10:00:00	586	391	\N	5	Отличные тренеры, всё по делу и без воды.
30	2026-03-12 10:00:00	587	391	\N	4	Чисто, удобное расписание, записалась за минуту.
31	2026-04-13 10:00:00	588	391	\N	5	Хорошая атмосфера, группы небольшие — внимание каждому.
32	2026-01-10 10:00:00	585	392	\N	5	Отличные тренеры, всё по делу и без воды.
33	2026-02-11 10:00:00	586	392	\N	5	Чисто, удобное расписание, записалась за минуту.
34	2026-03-12 10:00:00	587	392	\N	4	Хорошая атмосфера, группы небольшие — внимание каждому.
35	2026-04-13 10:00:00	588	392	\N	5	Пришёл новичком, через месяц уже видна разница.
36	2026-01-10 10:00:00	585	393	\N	5	Чисто, удобное расписание, записалась за минуту.
37	2026-02-11 10:00:00	586	393	\N	5	Хорошая атмосфера, группы небольшие — внимание каждому.
38	2026-03-12 10:00:00	587	393	\N	4	Пришёл новичком, через месяц уже видна разница.
39	2026-01-10 10:00:00	585	\N	156	5	Чисто, удобное расписание, записалась за минуту.
40	2026-02-11 10:00:00	586	\N	156	5	Хорошая атмосфера, группы небольшие — внимание каждому.
41	2026-03-12 10:00:00	587	\N	156	4	Пришёл новичком, через месяц уже видна разница.
42	2026-04-13 10:00:00	588	\N	156	5	Занятия вовремя, зал просторный, есть парковка.
43	2026-01-10 10:00:00	585	\N	157	5	Хорошая атмосфера, группы небольшие — внимание каждому.
44	2026-02-11 10:00:00	586	\N	157	5	Пришёл новичком, через месяц уже видна разница.
45	2026-03-12 10:00:00	587	\N	157	4	Занятия вовремя, зал просторный, есть парковка.
46	2026-04-13 10:00:00	588	\N	157	5	Отличные тренеры, всё по делу и без воды.
47	2026-01-10 10:00:00	585	\N	158	5	Пришёл новичком, через месяц уже видна разница.
48	2026-02-11 10:00:00	586	\N	158	5	Занятия вовремя, зал просторный, есть парковка.
49	2026-03-12 10:00:00	587	\N	158	4	Отличные тренеры, всё по делу и без воды.
50	2026-01-10 10:00:00	585	\N	159	5	Занятия вовремя, зал просторный, есть парковка.
51	2026-02-11 10:00:00	586	\N	159	5	Отличные тренеры, всё по делу и без воды.
52	2026-03-12 10:00:00	588	\N	159	4	Чисто, удобное расписание, записалась за минуту.
\.


--
-- Data for Name: schedule; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.schedule (id, created_at, offering_id, owner_club_id, owner_trainer_id, venue_club_id, sport_id, title, description, date, start_time, end_time, duration_minutes, level, capacity, booked_count, price, room, conducted_by_trainer_id) FROM stdin;
4	2026-04-15 11:42:40.411	3	\N	1	2	1	Оздоровительные тренировки для тела	\N	2026-08-13	20:40:00	21:20:00	40	all_levels	8	0	1000	Зал для растяжки	\N
5	2026-04-15 11:42:40.411	3	\N	1	2	1	Оздоровительные тренировки для тела	\N	2026-08-13	20:00:00	20:40:00	40	all_levels	10	0	1000	Зал для растяжки	\N
3	2026-04-15 11:38:03.619	2	2	\N	\N	2	Кроссфит	\N	2026-08-13	21:20:00	22:00:00	40	all_levels	20	0	1000	Зал для кроссфита	\N
2	2026-04-15 11:38:03.619	2	2	\N	\N	7	Бокс	\N	2026-08-13	22:00:00	22:40:00	40	all_levels	15	0	1000	Зал для бокса	\N
7	2026-04-16 09:31:52.314	5	\N	2	\N	8	Пилатес	\N	2026-08-13	22:30:00	23:30:00	60	all_levels	10	0	2500	Малый зал	\N
1	2026-04-15 11:33:02.245	1	1	\N	\N	7	Айкидо	\N	2026-08-14	18:00:00	18:40:00	40	all_levels	15	0	1000	Зал для единоборств	\N
150901	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-17	07:00:00	08:00:00	60	all_levels	12	0	900	Большой зал	\N
150902	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-17	07:00:00	08:00:00	60	intermediate	10	0	2000	Ринг	\N
150903	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-17	07:00:00	08:00:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150904	2026-01-01 09:00:00	538	389	\N	\N	1	Йога для начинающих	\N	2026-09-17	10:00:00	11:00:00	60	beginner	10	0	700	Зал А	\N
150905	2026-01-01 09:00:00	541	392	\N	\N	3	Плавание — техника кроля	\N	2026-09-17	10:00:00	11:00:00	60	all_levels	8	0	900	Дорожка 3	\N
150447	2026-09-10 18:38:06.888	232	\N	85	\N	2	Утренняя персональная	\N	2026-10-06	08:00:00	09:00:00	60	all_levels	1	0	1800	Зал на Ленинградской	\N
150448	2026-09-10 18:38:06.888	232	\N	85	\N	4	Вечерняя персональная	\N	2026-10-06	19:00:00	20:00:00	60	all_levels	1	0	1800	Зал на Ленинградской	\N
150906	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-17	12:30:00	13:30:00	60	all_levels	12	0	900	Большой зал	\N
150907	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-17	12:30:00	13:30:00	60	intermediate	10	0	2000	Ринг	\N
150908	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-17	12:30:00	13:30:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150909	2026-01-01 09:00:00	538	389	\N	\N	1	Йога для начинающих	\N	2026-09-17	15:00:00	16:00:00	60	beginner	10	0	700	Зал А	\N
150910	2026-01-01 09:00:00	541	392	\N	\N	3	Плавание — техника кроля	\N	2026-09-17	15:00:00	16:00:00	60	all_levels	8	0	900	Дорожка 3	\N
150911	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-17	18:00:00	19:00:00	60	all_levels	12	0	900	Большой зал	\N
150912	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-17	18:00:00	19:00:00	60	intermediate	10	0	2000	Ринг	\N
150913	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-17	18:00:00	19:00:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150914	2026-01-01 09:00:00	538	389	\N	\N	1	Йога для начинающих	\N	2026-09-17	19:30:00	20:30:00	60	beginner	10	0	700	Зал А	\N
150915	2026-01-01 09:00:00	541	392	\N	\N	3	Плавание — техника кроля	\N	2026-09-17	19:30:00	20:30:00	60	all_levels	8	0	900	Дорожка 3	\N
150916	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-17	21:00:00	22:00:00	60	all_levels	12	0	900	Большой зал	\N
150917	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-17	21:00:00	22:00:00	60	intermediate	10	0	2000	Ринг	\N
6	2026-04-15 11:46:15.212	4	3	\N	\N	1	Воздушная гимнастика, абонемент на 4 занятия	\N	2026-08-13	18:40:00	19:20:00	40	all_levels	8	1	2800	Общий зал	\N
150918	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-17	21:00:00	22:00:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150919	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-18	08:00:00	09:00:00	60	all_levels	12	0	900	Большой зал	\N
150920	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-18	08:00:00	09:00:00	60	intermediate	10	0	2000	Ринг	\N
150921	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-18	08:00:00	09:00:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150922	2026-01-01 09:00:00	538	389	\N	\N	1	Йога для начинающих	\N	2026-09-18	11:00:00	12:00:00	60	beginner	10	0	700	Зал А	\N
150923	2026-01-01 09:00:00	541	392	\N	\N	3	Плавание — техника кроля	\N	2026-09-18	11:00:00	12:00:00	60	all_levels	8	0	900	Дорожка 3	\N
150924	2026-01-01 09:00:00	537	388	\N	\N	4	Кроссфит — групповая тренировка	\N	2026-09-18	18:00:00	19:00:00	60	all_levels	12	0	900	Большой зал	\N
150925	2026-01-01 09:00:00	540	391	\N	\N	2	Бокс — групповая тренировка	\N	2026-09-18	18:00:00	19:00:00	60	intermediate	10	0	2000	Ринг	\N
150926	2026-01-01 09:00:00	542	393	\N	\N	5	Хип-хоп — открытый класс	\N	2026-09-18	18:00:00	19:00:00	60	all_levels	14	0	1500	Зеркальный зал	\N
150927	2026-01-01 09:00:00	538	389	\N	\N	1	Йога для начинающих	\N	2026-09-18	19:30:00	20:30:00	60	beginner	10	0	700	Зал А	\N
150928	2026-01-01 09:00:00	541	392	\N	\N	3	Плавание — техника кроля	\N	2026-09-18	19:30:00	20:30:00	60	all_levels	8	0	900	Дорожка 3	\N
150929	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-17	08:00:00	09:00:00	60	all_levels	1	0	1500	Малый зал	\N
150930	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-17	13:00:00	14:00:00	60	all_levels	1	0	1500	Малый зал	\N
150931	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-17	17:00:00	18:00:00	60	all_levels	1	0	1500	Малый зал	\N
150932	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-17	20:30:00	21:30:00	60	all_levels	1	0	1500	Малый зал	\N
150933	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-17	08:00:00	09:00:00	60	all_levels	1	0	3000	Ринг	\N
150934	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-17	13:00:00	14:00:00	60	all_levels	1	0	3000	Ринг	\N
150935	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-17	17:00:00	18:00:00	60	all_levels	1	0	3000	Ринг	\N
150936	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-17	20:30:00	21:30:00	60	all_levels	1	0	3000	Ринг	\N
150937	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-17	08:00:00	09:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150938	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-17	13:00:00	14:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150939	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-17	17:00:00	18:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150940	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-17	20:30:00	21:30:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150941	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-18	08:00:00	09:00:00	60	all_levels	1	0	1500	Малый зал	\N
150942	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-18	13:00:00	14:00:00	60	all_levels	1	0	1500	Малый зал	\N
150943	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-18	17:00:00	18:00:00	60	all_levels	1	0	1500	Малый зал	\N
150944	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-18	20:30:00	21:30:00	60	all_levels	1	0	1500	Малый зал	\N
150945	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-18	08:00:00	09:00:00	60	all_levels	1	0	3000	Ринг	\N
150946	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-18	13:00:00	14:00:00	60	all_levels	1	0	3000	Ринг	\N
150947	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-18	17:00:00	18:00:00	60	all_levels	1	0	3000	Ринг	\N
150948	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-18	20:30:00	21:30:00	60	all_levels	1	0	3000	Ринг	\N
150949	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-18	08:00:00	09:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150950	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-18	13:00:00	14:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150951	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-18	17:00:00	18:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150952	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-18	20:30:00	21:30:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150953	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-19	08:00:00	09:00:00	60	all_levels	1	0	1500	Малый зал	\N
150954	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-19	13:00:00	14:00:00	60	all_levels	1	0	1500	Малый зал	\N
150955	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-19	17:00:00	18:00:00	60	all_levels	1	0	1500	Малый зал	\N
150956	2026-01-01 09:00:00	539	\N	156	388	8	Пилатес — индивидуально	\N	2026-09-19	20:30:00	21:30:00	60	all_levels	1	0	1500	Малый зал	\N
150957	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-19	08:00:00	09:00:00	60	all_levels	1	0	3000	Ринг	\N
150958	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-19	13:00:00	14:00:00	60	all_levels	1	0	3000	Ринг	\N
150959	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-19	17:00:00	18:00:00	60	all_levels	1	0	3000	Ринг	\N
150960	2026-01-01 09:00:00	543	\N	158	391	2	Бокс — персональная тренировка	\N	2026-09-19	20:30:00	21:30:00	60	all_levels	1	0	3000	Ринг	\N
150961	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-19	08:00:00	09:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150962	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-19	13:00:00	14:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150963	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-19	17:00:00	18:00:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
150964	2026-01-01 09:00:00	544	\N	159	388	6	Силовая — персональная тренировка	\N	2026-09-19	20:30:00	21:30:00	60	all_levels	1	0	2800	Тренажёрный зал	\N
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.sessions (id, created_at, token_hash, user_id, impersonated_user_id, last_seen_at, expires_at, revoked_at, user_agent, ip) FROM stdin;
41436	2026-09-17 11:07:06.351	b1ea472da51db8641fed5b28eef0d1f3e1a0f28f25b874c1d0e861eefd1098b9	3	\N	2026-09-17 11:17:06.844	2026-10-01 11:07:06.35	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	::ffff:172.20.0.4
41036	2026-09-15 18:59:22.175	f0db224ac41e55021e8d792e763a10d4d61fe75af99d75abcbf58774e88b2c65	3	\N	2026-09-15 18:59:22.174	2026-09-29 18:59:22.174	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41039	2026-09-15 18:59:34.907	e6c046a8a498b524bda8189753ca0afa9b0ea2d202be69b51499d00066844100	3	\N	2026-09-15 18:59:34.906	2026-09-29 18:59:34.906	2026-09-15 19:01:05.146	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41044	2026-09-15 19:01:07.301	243aec203387673b0847358aa2b45495982c4919661db71c2ee3accf49001a27	3	\N	2026-09-15 19:01:07.3	2026-09-29 19:01:07.3	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41043	2026-09-15 19:01:05.149	992ef4c666e54cb0b0831e2929274f0ac5cd5417e8480b4db552097374a5160b	3	\N	2026-09-15 19:01:05.148	2026-09-29 19:01:05.148	2026-09-15 19:01:07.299	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41045	2026-09-15 19:05:01.673	957c1dbd3464706fb729453678af45442d806ef0787a35919a15788e6a1fc198	3	\N	2026-09-15 19:05:01.672	2026-09-29 19:05:01.672	2026-09-15 19:06:43.011	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41050	2026-09-15 19:06:45.145	d376be3944c4847745cfe8d29e83a434425808e36125b5556c7f0649a33dd3ad	3	\N	2026-09-15 19:06:45.145	2026-09-29 19:06:45.145	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41049	2026-09-15 19:06:43.013	bd66a817e10d8ccba04f179bd85664ed13bec56a6bfae24904bd776b8ff247ca	3	\N	2026-09-15 19:06:43.012	2026-09-29 19:06:43.012	2026-09-15 19:06:45.144	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41051	2026-09-15 19:09:51.066	30b471dc05557b0e87ca628a45b786388cec8af7e7340b05eb6d788d83d4cf6f	3	\N	2026-09-15 19:09:51.066	2026-09-29 19:09:51.066	2026-09-15 19:11:35.552	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41056	2026-09-15 19:11:37.688	01ea4018192b728171754995638fc74084daf99c69e546f8acdca651ff413073	3	\N	2026-09-15 19:11:37.688	2026-09-29 19:11:37.688	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41055	2026-09-15 19:11:35.554	2ab51120ed216eb5ad06b17ad5bf22456e8690960e6a069a3ae2b9100974cb1a	3	\N	2026-09-15 19:11:35.554	2026-09-29 19:11:35.554	2026-09-15 19:11:37.685	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41057	2026-09-15 19:14:08.213	dfb26415416c1d9fb994430aa6eacefbc5c7b82f258d5846067c83ef5608fc29	3	\N	2026-09-15 19:14:08.213	2026-09-29 19:14:08.213	2026-09-15 19:15:52.525	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41062	2026-09-15 19:15:54.668	1b9e6169ff2591f797b5bfb113e31b7de2c467b9f747a5a032af397181347e4e	3	\N	2026-09-15 19:15:54.668	2026-09-29 19:15:54.668	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41061	2026-09-15 19:15:52.526	2a9081630dcb4688122bd1bf202361d96171fb66459d65661de78fce4bd2e7d0	3	\N	2026-09-15 19:15:52.526	2026-09-29 19:15:52.526	2026-09-15 19:15:54.666	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41063	2026-09-15 19:20:42.195	5b2c8be68e0614c1168f851d90e5eb58d61c69080294c80c1e37f484428877e4	3	\N	2026-09-15 19:20:42.194	2026-09-29 19:20:42.194	2026-09-15 19:22:26.702	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41068	2026-09-15 19:22:28.84	cbfd04564a696d4b76f6ee981f304acc2a94875ad26f82ff10b794ce182ce919	3	\N	2026-09-15 19:22:28.84	2026-09-29 19:22:28.84	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41067	2026-09-15 19:22:26.703	825f0e443c75841daa3b2d74eaa84776ff08b102388aae0a4f1bff50bc80a152	3	\N	2026-09-15 19:22:26.703	2026-09-29 19:22:26.703	2026-09-15 19:22:28.837	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41091	2026-09-15 20:17:21.795	69c71000e99b230b9a243d10ef0325efe6727ba2019a123ca6231d0b9bb82fb6	3	\N	2026-09-15 20:17:21.794	2026-09-29 20:17:21.794	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41092	2026-09-15 20:17:24.654	020ad4da3cd8688ce8a1f16fbd1d8741d81be3c3dd82e3899f9c1964046e270f	3	\N	2026-09-15 20:17:24.654	2026-09-29 20:17:24.654	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41093	2026-09-15 20:18:56.361	b73696260a290a75d48f2c8037f0c609b9b44cf9e64297983f0aaa1a8bcf1170	3	\N	2026-09-15 20:18:56.361	2026-09-29 20:18:56.361	2026-09-15 20:20:41.218	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41098	2026-09-15 20:20:43.365	4f51280c36b72ae8a95b1ccc0aa65c66b853499c6a849aabae338e7cc321850b	3	\N	2026-09-15 20:20:43.365	2026-09-29 20:20:43.365	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41097	2026-09-15 20:20:41.222	4138f32dd831d7bb72c271805c1d25a35581606c581d684c859a798dcdb49b87	3	\N	2026-09-15 20:20:41.221	2026-09-29 20:20:41.221	2026-09-15 20:20:43.361	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41099	2026-09-16 02:50:17.271	846f4c695e9080b8120bfa0e290a7c17cb50a793793ecfba947690d4197aa434	3	\N	2026-09-16 02:50:17.271	2026-09-30 02:50:17.271	2026-09-16 02:52:02.258	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41104	2026-09-16 02:52:04.405	fe16979c0a91055645d13e14c7a63027ec5e4936b259deaec7c8c402bd4dc592	3	\N	2026-09-16 02:52:04.405	2026-09-30 02:52:04.405	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41103	2026-09-16 02:52:02.26	32275ca52ab9932d7232518867af4b6734b6fc89f01976a6c6c2e1ebf5ee7ca4	3	\N	2026-09-16 02:52:02.26	2026-09-30 02:52:02.26	2026-09-16 02:52:04.404	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41114	2026-09-16 09:25:37.265	0cfc4ccb2038aeb70faf9723d43a829d457cc803d9f84290ff158b95688793cf	3	\N	2026-09-16 09:25:37.258	2026-09-30 09:25:37.258	2026-09-16 09:27:53.501	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41119	2026-09-16 09:27:55.656	1fb003fb9dd3220877c61eed55074b51812bb6bea497d6efc27f3966942d64c1	3	\N	2026-09-16 09:27:55.656	2026-09-30 09:27:55.656	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41118	2026-09-16 09:27:53.502	68ead3cafb162ef90e3b26afa921732efda60dc8f50d3ff09914002ea501f2d4	3	\N	2026-09-16 09:27:53.502	2026-09-30 09:27:53.502	2026-09-16 09:27:55.654	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41120	2026-09-16 09:34:39.423	6d7d6a02c06e9922d1b4d7e2df69f76961794c8de50480a6c08557d6edf957c0	3	\N	2026-09-16 09:34:39.419	2026-09-30 09:34:39.419	2026-09-16 09:36:38.611	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41125	2026-09-16 09:36:40.767	afea782af920e5c3e57768244918bde1ce6674ed8677f951d8ebca64b3246d33	3	\N	2026-09-16 09:36:40.767	2026-09-30 09:36:40.767	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41124	2026-09-16 09:36:38.613	0c1b0124e76eda958e55fba1be9f84d3342b4c0920876027bff8d5011ddf6fff	3	\N	2026-09-16 09:36:38.612	2026-09-30 09:36:38.612	2026-09-16 09:36:40.765	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41126	2026-09-16 09:40:55.896	6cb3463d215b999de955fe701f97989fe0e78a52dfdfc16a856c849733e6f5cf	3	\N	2026-09-16 09:40:55.891	2026-09-30 09:40:55.891	2026-09-16 09:42:56.546	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41131	2026-09-16 09:42:58.731	a335f462bd4a43a710c14a1f2cec834652bd44d8dd61b944ee1cee65c97467ed	3	\N	2026-09-16 09:42:58.731	2026-09-30 09:42:58.731	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41130	2026-09-16 09:42:56.548	6285ab93d6be8855de634f222a00238bf445aaf5d463029eff7e8c5b0c737278	3	\N	2026-09-16 09:42:56.547	2026-09-30 09:42:56.547	2026-09-16 09:42:58.727	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41132	2026-09-16 09:48:59.005	6ba4615305a15a31e900c1eb11235cc6b1bb9e01c238e7f10c831aa969b8a977	3	\N	2026-09-16 09:48:59.004	2026-09-30 09:48:59.004	2026-09-16 09:50:59.794	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41137	2026-09-16 09:51:01.976	3726a1b3091edf7dd1e72ca32a18370d482ede7434d79ccf05fe879984d1d226	3	\N	2026-09-16 09:51:01.976	2026-09-30 09:51:01.976	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41136	2026-09-16 09:50:59.796	0693985fbc25f2ceda37b740577698a2295ec9c9d3b2ff0a982f8ee71d6b5b46	3	\N	2026-09-16 09:50:59.795	2026-09-30 09:50:59.795	2026-09-16 09:51:01.974	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41138	2026-09-16 09:53:23.061	5b3030237eb301e1d3e7347f85d6b71a95d3c5595ee43d086a07c0ea4b99c5ce	3	\N	2026-09-16 09:53:23.061	2026-09-30 09:53:23.061	2026-09-16 09:55:23.624	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41143	2026-09-16 09:55:25.788	e090291ab506a91d52cb2e94e4bf3c287b90399750aa1834f36e134ce7addf3f	3	\N	2026-09-16 09:55:25.788	2026-09-30 09:55:25.788	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41142	2026-09-16 09:55:23.625	b2c04b9c2a480688183a4160807ad08512db3d482cad9e97597c6e304564ca68	3	\N	2026-09-16 09:55:23.625	2026-09-30 09:55:23.625	2026-09-16 09:55:25.785	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41144	2026-09-16 10:01:42.323	e4d646950944715aa21b0a4dae00fcb91d9ceb5e94dc7244e2c42d79ceec3ec9	3	\N	2026-09-16 10:01:42.318	2026-09-30 10:01:42.318	2026-09-16 10:03:43.499	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41149	2026-09-16 10:03:45.646	2bcc85003ef93aede629023bf2fc8e7ce81044e05f54fb88fe2fca1ab078ca32	3	\N	2026-09-16 10:03:45.646	2026-09-30 10:03:45.646	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41148	2026-09-16 10:03:43.502	5e8dc0b051c373a995e3da8bd8db7c81d5ed72441162cffaf4590e7f50e16add	3	\N	2026-09-16 10:03:43.501	2026-09-30 10:03:43.501	2026-09-16 10:03:45.645	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41150	2026-09-16 10:36:44.76	98717e29a044883f7470ac146571e1bc656cc017d7e890fec870e95d505c0b6e	3	\N	2026-09-16 10:36:44.755	2026-09-30 10:36:44.755	2026-09-16 10:39:04.752	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41155	2026-09-16 10:39:06.968	e022fbf9b65bb6cbd19508272fdf2e66e4e0f279dca6e64db33ff389aef818d9	3	\N	2026-09-16 10:39:06.968	2026-09-30 10:39:06.968	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41154	2026-09-16 10:39:04.754	12a3b051421b4e124cd07bf6300ec89f0af6ce7ad86318e73b18d79694187c41	3	\N	2026-09-16 10:39:04.754	2026-09-30 10:39:04.754	2026-09-16 10:39:06.966	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41158	2026-09-16 10:45:14.339	379d03b7227aba741a6cecf409a086aeef19de22729115e48d4e786886ac1742	3	\N	2026-09-16 10:45:14.339	2026-09-30 10:45:14.339	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41160	2026-09-16 10:45:36.423	2c7b9db56517d7fd6b63ea83259740c64837f454f57a33ff76ee14e1f8137aba	3	\N	2026-09-16 10:45:36.422	2026-09-30 10:45:36.422	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41161	2026-09-16 11:03:35.424	5b87f35785ed67bb416c1ad1ebbe57931f98baddecb189615838c031abab998e	3	\N	2026-09-16 11:03:35.418	2026-09-30 11:03:35.418	2026-09-16 11:05:59.962	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41166	2026-09-16 11:06:02.168	4c314e315313089ac993b3dba0c8b00edcd16fafcfb884c3c152c4d319744a3e	3	\N	2026-09-16 11:06:02.167	2026-09-30 11:06:02.167	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41165	2026-09-16 11:05:59.964	eb699894561cfef029425ec626f15b8288aac933ef8d3e974adde93c111a79ab	3	\N	2026-09-16 11:05:59.964	2026-09-30 11:05:59.964	2026-09-16 11:06:02.164	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41167	2026-09-16 11:09:01.896	d2e698bd751e3e51e9a7dace5fd6181dd22d502e0e7215a618aa33983bd9a7cd	3	\N	2026-09-16 11:09:01.896	2026-09-30 11:09:01.896	2026-09-16 11:11:26.179	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41172	2026-09-16 11:11:28.389	cda608c0e966bdad731be832bfb012bf4b96576c24c6b4a8eb0722af6df0c1f6	3	\N	2026-09-16 11:11:28.389	2026-09-30 11:11:28.389	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41171	2026-09-16 11:11:26.182	5c66ae097df352a04f388c2b55be7385269504564f9c15826f356fd2633405d3	3	\N	2026-09-16 11:11:26.181	2026-09-30 11:11:26.181	2026-09-16 11:11:28.387	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41173	2026-09-16 11:14:07.639	d3627b2de9680baa3d95ba8ea4c49bfacb0eadfbc336adf5ca37731448da2da7	3	\N	2026-09-16 11:14:07.638	2026-09-30 11:14:07.638	2026-09-16 11:16:49.299	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41178	2026-09-16 11:16:52.649	b07747f6948c6cb97b87f4161aea99bc32dfd8fb656e0e48029bc2bd3bbd8b4c	3	\N	2026-09-16 11:16:52.648	2026-09-30 11:16:52.648	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
41177	2026-09-16 11:16:49.303	288890f908a088199a29a6fd3e9262964165638bdab8668c979aea1cc421a89c	3	\N	2026-09-16 11:16:49.303	2026-09-30 11:16:49.303	2026-09-16 11:16:52.645	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36	::ffff:172.20.0.4
\.


--
-- Data for Name: specialties; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.specialties (id, created_at, name) FROM stdin;
1	2026-03-17 09:00:00	Подготовка к соревнованиям
2	2026-03-17 09:00:00	Реабилитация
3	2026-03-17 09:00:00	Детские группы
4	2026-03-17 09:00:00	Похудение
5	2026-03-17 09:00:00	Набор мышечной массы
6	2026-03-17 09:00:00	Растяжка и гибкость
7	2026-03-17 09:00:00	Постановка техники
8	2026-03-17 09:00:00	Кроль
9	2026-03-17 09:00:00	Постановка дыхания
10	2026-03-17 09:00:00	Силовые тренировки
11	2026-03-17 09:00:00	Хатха-йога
12	2026-03-17 09:00:00	Функциональный тренинг
13	2026-03-17 09:00:00	Коррекция осанки
14	2026-03-17 09:00:00	Самооборона
15	2026-03-17 09:00:00	ОФП
\.


--
-- Data for Name: sports; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.sports (id, created_at, name, slug, description, icon, image_url, is_popular, color) FROM stdin;
1	2026-03-17 09:00:00	Йога	yoga	Практики для гибкости, дыхания и баланса в спокойном ритме.	🧘	/images/sports/yoga.jpg	t	#8b5cf6
2	2026-03-17 09:00:00	Бокс	boxing	Тренировки на технику ударов, координацию и выносливость.	🥊	/images/sports/boxing.jpg	t	#f59e0b
3	2026-03-17 09:00:00	Плавание	swimming	Групповые и индивидуальные занятия в бассейне для любого уровня.	🏊	/images/sports/swimming.jpg	t	#3b82f6
9	2026-04-18 18:07:36.053	Борьба четкая	borbahetkay				t	#6366f1
4	2026-03-17 09:00:00	Кроссфит	crossfit	Интенсивные функциональные тренировки с прогрессией нагрузки.	🏋️	/images/sports/crossfit.jpg	t	#ef4444
5	2026-03-17 09:00:00	Танцы	dance	Современные танцевальные направления для взрослых и подростков.	💃	/images/sports/dance.jpg	t	#ec4899
6	2026-03-17 09:00:00	Тренажёрный зал	gym	Силовые и общефизические тренировки в зале с программой под цель.	🏋️‍♂️	/images/sports/gym.jpg	t	#6b7280
7	2026-03-17 09:00:00	Единоборства	martial-arts	Группы по технике, выносливости и самообороне.	🥋	/images/sports/martial-arts.jpg	f	#f97316
8	2026-03-17 09:00:00	Пилатес	pilates	Мягкая работа с осанкой, центром тела и контролем движения.	🤸	/images/sports/pilates.jpg	t	#10b981
\.


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.tags (id, created_at, name) FROM stdin;
1	2026-03-17 09:00:00	Для начинающих
2	2026-03-17 09:00:00	Для детей
3	2026-03-17 09:00:00	Для продвинутых
4	2026-03-17 09:00:00	Бассейн
5	2026-03-17 09:00:00	Восстановление
6	2026-03-17 09:00:00	Силовые
7	2026-03-17 09:00:00	Кардио
8	2026-03-17 09:00:00	Йога
9	2026-03-17 09:00:00	Пилатес
10	2026-03-17 09:00:00	Функциональный тренинг
11	2026-03-17 09:00:00	Групповые занятия
12	2026-03-17 09:00:00	Индивидуальный подход
13	2026-03-17 09:00:00	Утренние группы
14	2026-03-17 09:00:00	Вечерние группы
15	2026-03-17 09:00:00	Выходные
\.


--
-- Data for Name: trainer_club_links; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.trainer_club_links (id, created_at, trainer_id, club_id, status, initiated_by, initiated_by_user_id, approved_at, approved_by_user_id, rejected_at, rejected_by_user_id, rejection_reason, revoked_at, revoked_by_user_id, revoked_by) FROM stdin;
1	2026-04-15 11:42:40.411	1	2	confirmed	trainer	2	2026-04-15 11:42:40.411	2	\N	\N	\N	\N	\N	\N
2	2026-04-18 10:00:00	2	1	rejected	trainer	2	\N	\N	2026-04-23 08:56:28.669	2	\N	\N	\N	\N
210	2026-01-01 09:00:00	156	388	confirmed	trainer	\N	2026-01-01 09:00:00	581	\N	\N	\N	\N	\N	\N
211	2026-01-01 09:00:00	158	391	confirmed	trainer	\N	2026-01-01 09:00:00	581	\N	\N	\N	\N	\N	\N
212	2026-01-01 09:00:00	159	388	confirmed	trainer	\N	2026-01-01 09:00:00	581	\N	\N	\N	\N	\N	\N
110	2026-09-10 18:38:27.049	85	1	confirmed	trainer	\N	2026-09-10 18:38:48.989	2	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: trainer_specialties; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.trainer_specialties (trainer_id, specialty_id) FROM stdin;
1	2
1	6
2	2
2	3
2	6
85	1
85	4
156	2
156	6
156	13
157	1
157	5
158	1
158	7
158	14
159	5
159	10
159	7
\.


--
-- Data for Name: trainer_sports; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.trainer_sports (trainer_id, sport_id) FROM stdin;
1	1
2	8
156	1
156	8
157	6
158	2
158	7
159	6
85	2
85	4
\.


--
-- Data for Name: trainer_work_formats; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.trainer_work_formats (trainer_id, work_format_id) FROM stdin;
1	1
2	1
85	1
85	2
156	1
156	3
157	1
157	2
158	1
159	1
159	3
\.


--
-- Data for Name: trainers; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.trainers (id, created_at, name, slug, slug_normalized, bio, avatar_url, experience_years, rating, review_count, price_from, city, address, latitude, longitude, phone, vk, telegram, facebook, sport_id, managed_by_user_id, source, status, hide_reason, hidden_at, hidden_by_user_id, hidden_kind, awaiting_recheck, verified_at, verified_by_user_id) FROM stdin;
1	2026-04-15 11:42:40.411	Тренер Тренеров	тренер-тренеров	тренер-тренеров	Оздоровительные тренировки по растяжке, йоге Оздоровительные тренировки по растяжке, йоге Оздоровительные тренировки по растяжке, йоге Оздоровительные тренировки по растяжке, йоге Оздоровительные тренировки по растяжке, йоге Оздоровительные тренировки по растяжке, йоге		12	0	0	1000	Самара	Киевская ул., 1	53.202373	50.151343	+7 (899) 776-45-65	\N	\N	\N	1	2	provider	published	\N	\N	\N	\N	f	\N	\N
2	2026-04-16 09:31:52.314	Вадим Джонсмитович	вадим-джонсмитович	вадим-джонсмитович	Я вадим вадимы чечня сила, Ахмат сила Я вадим вадимы чечня сила, Ахмат силамм  Я вадим вадимы чечня сила, Ахмат сила Я вадим вадимы чечня сила, Ахмат сила Я вадим вадимы чечня сила, Ахмат сила Я вадим вадимы чечня сила, Ахмат сила Я вадим вадимы чечня сила, Ахмат силаЯ вадим вадимы чечня сила, Ахмат силаЯ вадим вадимы чечня сила, Ахмат силаЯ вадим вадимы чечня сила, Ахмат силаЯ вадим вадимы чечня сила, Ахмат сила		9	0	0	2500	Самара	Ново-Садовая улица, 162В	53.529032	49.296282	+7 (776) 456-46-45	\N	\N	\N	8	2	provider	published	\N	\N	\N	\N	f	\N	\N
156	2026-01-01 09:00:00	Мария Орлова	mariya-orlova	mariya-orlova	Веду йогу и пилатес десять лет. Работаю и в зале клуба, и индивидуально: помогаю вернуть подвижность после долгой сидячей работы.	https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200&h=200&fit=crop&crop=faces	10	4.75	4	1500	Самара	Ново-Садовая ул., 106	53.22102	50.151918	+7 (900) 000-00-03	\N	\N	\N	1	12	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
157	2026-01-01 09:00:00	Егор Двулицев	egor-dvulitsev	egor-dvulitsev	Веду кроссфит в собственном зале и персональные тренировки на выезде — дома у клиента и в чужих залах по договорённости.	https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&h=200&fit=crop&crop=faces	8	4.75	4	2000	Самара	ул. Свободы, 12	53.235	50.19	+7 (900) 000-00-05	\N	\N	\N	6	583	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
158	2026-01-01 09:00:00	Евгений Карпов	evgeniy-karpov	evgeniy-karpov	Мастер спорта по боксу. Ставлю технику удара и защиты с нуля, готовлю к первым боям, работаю с подростками и взрослыми.	https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=200&h=200&fit=crop&crop=faces	12	4.666666666666667	3	3000	Самара	Московское ш., 41	53.2112	50.1932	+7 (900) 000-00-06	\N	\N	\N	2	584	seed	published	\N	\N	\N	\N	f	2026-01-01 09:00:00	1
159	2026-01-01 09:00:00	Мария Белова	mariya-belova	mariya-belova	Кандидат в мастера спорта по пауэрлифтингу. Силовые тренировки для женщин и мужчин: техника базовых движений, набор массы, выход из плато.	https://images.unsplash.com/photo-1521804906057-1df8fdb718b7?w=200&h=200&fit=crop&crop=faces	7	4.666666666666667	3	2800	Самара	Ново-Садовая ул., 106	53.22102	50.151918	+7 (900) 000-00-09	\N	\N	\N	6	587	seed	published	\N	\N	\N	\N	f	\N	\N
85	2026-09-10 18:38:06.882	Павел Тренеров	павел-тренеров	павел-тренеров	Постоянная тестовая карточка тренера: заведена шагом 36.35 фазы 36 взамен семи карточек, оставленных прежними прогонами чек-листов. На неё опираются чек-листы, входящие пользователем trainer@sporthub.local.		7	0	0	1800	Самара	ул. Ленинградская, 10	0	0	+7 (900) 000-00-03	\N	\N	\N	\N	12	provider	published	\N	\N	\N	\N	f	2026-09-17 11:08:05.224	3
\.


--
-- Data for Name: user_favorite_clubs; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.user_favorite_clubs (user_id, club_id, created_at) FROM stdin;
582	388	2026-01-01 09:00:00
585	391	2026-01-01 09:00:00
586	392	2026-01-01 09:00:00
588	393	2026-01-01 09:00:00
\.


--
-- Data for Name: user_notification_preferences; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.user_notification_preferences (user_id, type, enabled, id, face_club_id, face_trainer_id) FROM stdin;
1	booking_cancelled_by_athlete	t	1	\N	\N
1	booking_no_show	t	2	\N	\N
1	booking_auto_expired	t	3	\N	\N
1	booking_requested	t	4	\N	\N
1	booking_cancelled_by_athlete_to_provider	t	5	\N	\N
1	booking_auto_expired_to_provider	t	6	\N	\N
1	link_requested	t	7	\N	\N
1	link_approved	t	8	\N	\N
1	link_rejected	t	9	\N	\N
1	link_revoked	t	10	\N	\N
6	booking_cancelled_by_athlete	t	25	\N	\N
6	booking_no_show	t	26	\N	\N
6	booking_auto_expired	t	27	\N	\N
6	booking_requested	t	28	\N	\N
6	booking_cancelled_by_athlete_to_provider	t	29	\N	\N
6	booking_auto_expired_to_provider	t	30	\N	\N
6	link_requested	t	31	\N	\N
6	link_approved	t	32	\N	\N
6	link_rejected	t	33	\N	\N
6	link_revoked	t	34	\N	\N
1	booking_rejected	t	37	\N	\N
1	booking_completed	t	38	\N	\N
2	booking_requested	f	398	3	\N
2	review_created	t	46	1	\N
6	booking_rejected	t	41	\N	\N
6	booking_completed	t	42	\N	\N
2	review_created	f	45	\N	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.users (id, created_at, status, name, email, phone, password_hash, avatar_url, city, account_kind) FROM stdin;
2	2026-03-17 09:00:00	active	Марина Крылова	marina@studio.local	+7 (927) 000-20-20	$argon2id$v=19$m=19456,t=2,p=1$IGMuurmX9T19akUSZEtmLg$673SDIM1AXu4YfbR+09zXcALJ9o/BgGaJU9MyDi4UxA	/images/users/marina-krylova.jpg	Самара	person
1	2026-03-17 09:00:00	active	Алексей Смирнов	alexey@sporthub.local	+7 (927) 000-20-10	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	/images/users/alexey-smirnov.jpg	Самара	person
4	2026-04-22 10:00:00	active	Дмитрий Соколов	dmitry@arena.local	+7 (927) 000-40-40	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	\N	Самара	person
6	2026-04-22 10:00:00	active	Ольга Белова	olga@sporthub.local	+7 (900) 555-44-33	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	\N	Самара	person
7	2026-04-22 10:00:00	active	Иван Петров	ivan@sporthub.local	+7 (927) 000-70-70	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	\N	Самара	person
8	2026-04-24 10:38:25.336	active	Сергей Кузнецов	sergey@sporthub.local	+7 (900) 123-45-67	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8		Самара	person
5	2026-04-22 10:00:00	active	Анна Иванова	anna@trainer.local	+7 (927) 000-50-50	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	\N	Самара	person
12	2026-09-09 04:19:54.118	active	Павел Тренеров	trainer@sporthub.local	+7 900 000-00-03	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	\N	Самара	person
581	2026-01-01 09:00:00	active	Ольга Владелец	owner@sporthub.local	+7 (900) 000-00-02	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
582	2026-01-01 09:00:00	active	Ирина Спортсменова	athlete@sporthub.local	+7 (900) 000-00-04	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
583	2026-01-01 09:00:00	active	Егор Двулицев	both@sporthub.local	+7 (900) 000-00-05	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
584	2026-01-01 09:00:00	active	Евгений Карпов	karpov@sporthub.local	+7 (900) 000-00-06	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
585	2026-01-01 09:00:00	active	Дмитрий Соколов	sokolov@sporthub.local	+7 (900) 000-00-07	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
586	2026-01-01 09:00:00	active	Анна Лебедева	lebedeva@sporthub.local	+7 (900) 000-00-08	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
587	2026-01-01 09:00:00	active	Мария Белова	belova@sporthub.local	+7 (900) 000-00-09	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
588	2026-01-01 09:00:00	active	Игорь Волков	volkov@sporthub.local	+7 (900) 000-00-10	$argon2id$v=19$m=19456,t=2,p=1$2fWrjHN/g2wfRR5qYyIGwg$EEhu1quqLEpMzu0mZovL92RwwbKr95PQx2VMtXufVnA	\N	Самара	person
3	2026-04-07 09:00:00	active	Администратор SportHub	admin@sporthub.local	+7 (927) 000-30-30	$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8	/images/users/admin.jpg	\N	admin
\.


--
-- Data for Name: work_formats; Type: TABLE DATA; Schema: public; Owner: sporthub
--

COPY public.work_formats (id, created_at, name) FROM stdin;
1	2026-03-17 09:00:00	В зале
2	2026-03-17 09:00:00	На выезде
3	2026-03-17 09:00:00	Онлайн
4	2026-03-17 09:00:00	На открытом воздухе
5	2026-03-17 09:00:00	В бассейне
6	2026-03-17 09:00:00	На стадионе
\.


--
-- Name: amenities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.amenities_id_seq', 16, false);


--
-- Name: booking_status_transitions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.booking_status_transitions_id_seq', 908, true);


--
-- Name: bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.bookings_id_seq', 1491, true);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.cities_id_seq', 13, true);


--
-- Name: club_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.club_images_id_seq', 6, true);


--
-- Name: clubs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.clubs_id_seq', 405, true);


--
-- Name: logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.logs_id_seq', 2385, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.notifications_id_seq', 12690, true);


--
-- Name: offerings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.offerings_id_seq', 560, true);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 32, true);


--
-- Name: provider_client_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.provider_client_notes_id_seq', 9, true);


--
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.reviews_id_seq', 52, true);


--
-- Name: schedule_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.schedule_id_seq', 150984, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.sessions_id_seq', 41436, true);


--
-- Name: specialties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.specialties_id_seq', 16, false);


--
-- Name: sports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.sports_id_seq', 10, false);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.tags_id_seq', 16, false);


--
-- Name: trainer_club_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.trainer_club_links_id_seq', 216, true);


--
-- Name: trainers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.trainers_id_seq', 163, true);


--
-- Name: user_notification_preferences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.user_notification_preferences_id_seq', 599, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.users_id_seq', 600, true);


--
-- Name: work_formats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sporthub
--

SELECT pg_catalog.setval('public.work_formats_id_seq', 7, false);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: amenities amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.amenities
    ADD CONSTRAINT amenities_pkey PRIMARY KEY (id);


--
-- Name: booking_status_transitions booking_status_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.booking_status_transitions
    ADD CONSTRAINT booking_status_transitions_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: club_amenities club_amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_amenities
    ADD CONSTRAINT club_amenities_pkey PRIMARY KEY (club_id, amenity_id);


--
-- Name: club_images club_images_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_images
    ADD CONSTRAINT club_images_pkey PRIMARY KEY (id);


--
-- Name: club_sports club_sports_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_sports
    ADD CONSTRAINT club_sports_pkey PRIMARY KEY (club_id, sport_id);


--
-- Name: club_tags club_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_tags
    ADD CONSTRAINT club_tags_pkey PRIMARY KEY (club_id, tag_id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offerings offerings_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: provider_client_notes provider_client_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: schedule schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: specialties specialties_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.specialties
    ADD CONSTRAINT specialties_pkey PRIMARY KEY (id);


--
-- Name: sports sports_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sports
    ADD CONSTRAINT sports_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: trainer_club_links trainer_club_links_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_pkey PRIMARY KEY (id);


--
-- Name: trainer_specialties trainer_specialties_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_specialties
    ADD CONSTRAINT trainer_specialties_pkey PRIMARY KEY (trainer_id, specialty_id);


--
-- Name: trainer_sports trainer_sports_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_sports
    ADD CONSTRAINT trainer_sports_pkey PRIMARY KEY (trainer_id, sport_id);


--
-- Name: trainer_work_formats trainer_work_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_work_formats
    ADD CONSTRAINT trainer_work_formats_pkey PRIMARY KEY (trainer_id, work_format_id);


--
-- Name: trainers trainers_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers
    ADD CONSTRAINT trainers_pkey PRIMARY KEY (id);


--
-- Name: user_favorite_clubs user_favorite_clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_favorite_clubs
    ADD CONSTRAINT user_favorite_clubs_pkey PRIMARY KEY (user_id, club_id);


--
-- Name: user_notification_preferences user_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: work_formats work_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.work_formats
    ADD CONSTRAINT work_formats_pkey PRIMARY KEY (id);


--
-- Name: amenities_name_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX amenities_name_key ON public.amenities USING btree (name);


--
-- Name: booking_status_transitions_actor_user_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX booking_status_transitions_actor_user_id_idx ON public.booking_status_transitions USING btree (actor_user_id);


--
-- Name: booking_status_transitions_booking_id_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX booking_status_transitions_booking_id_at_idx ON public.booking_status_transitions USING btree (booking_id, at);


--
-- Name: bookings_active_by_slot_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_active_by_slot_idx ON public.bookings USING btree (schedule_id, status) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text]));


--
-- Name: bookings_active_slot_user_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX bookings_active_slot_user_uq ON public.bookings USING btree (schedule_id, user_id) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text]));


--
-- Name: bookings_conducted_by_trainer_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_conducted_by_trainer_id_idx ON public.bookings USING btree (conducted_by_trainer_id);


--
-- Name: bookings_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_created_at_idx ON public.bookings USING btree (created_at);


--
-- Name: bookings_owner_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_owner_club_id_idx ON public.bookings USING btree (owner_club_id);


--
-- Name: bookings_owner_trainer_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_owner_trainer_id_idx ON public.bookings USING btree (owner_trainer_id);


--
-- Name: bookings_schedule_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_schedule_id_idx ON public.bookings USING btree (schedule_id);


--
-- Name: bookings_schedule_id_user_id_status_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_schedule_id_user_id_status_idx ON public.bookings USING btree (schedule_id, user_id, status);


--
-- Name: bookings_sport_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_sport_id_created_at_idx ON public.bookings USING btree (sport_id, created_at);


--
-- Name: bookings_user_id_date_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_user_id_date_created_at_idx ON public.bookings USING btree (user_id, date, created_at);


--
-- Name: bookings_venue_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX bookings_venue_club_id_idx ON public.bookings USING btree (venue_club_id);


--
-- Name: bst_initial_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX bst_initial_uq ON public.booking_status_transitions USING btree (booking_id) WHERE (from_status IS NULL);


--
-- Name: cities_name_normalized_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX cities_name_normalized_key ON public.cities USING btree (name_normalized);


--
-- Name: club_amenities_amenity_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX club_amenities_amenity_id_idx ON public.club_amenities USING btree (amenity_id);


--
-- Name: club_images_club_id_position_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX club_images_club_id_position_idx ON public.club_images USING btree (club_id, "position");


--
-- Name: club_sports_sport_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX club_sports_sport_id_idx ON public.club_sports USING btree (sport_id);


--
-- Name: club_tags_tag_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX club_tags_tag_id_idx ON public.club_tags USING btree (tag_id);


--
-- Name: clubs_awaiting_recheck_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_awaiting_recheck_idx ON public.clubs USING btree (hidden_at DESC) WHERE awaiting_recheck;


--
-- Name: clubs_city_status_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_city_status_idx ON public.clubs USING btree (city, status);


--
-- Name: clubs_managed_by_user_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_managed_by_user_id_idx ON public.clubs USING btree (managed_by_user_id);


--
-- Name: clubs_slug_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX clubs_slug_key ON public.clubs USING btree (slug);


--
-- Name: clubs_slug_normalized_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX clubs_slug_normalized_key ON public.clubs USING btree (slug_normalized);


--
-- Name: clubs_status_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_status_created_at_idx ON public.clubs USING btree (status, created_at DESC);


--
-- Name: clubs_status_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_status_idx ON public.clubs USING btree (status);


--
-- Name: clubs_status_rating_review_count_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX clubs_status_rating_review_count_idx ON public.clubs USING btree (status, rating DESC, review_count DESC);


--
-- Name: links_active_pair_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX links_active_pair_uq ON public.trainer_club_links USING btree (trainer_id, club_id) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text]));


--
-- Name: logs_action_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX logs_action_created_at_idx ON public.logs USING btree (action, created_at DESC);


--
-- Name: logs_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX logs_actor_id_created_at_idx ON public.logs USING btree (actor_id, created_at DESC);


--
-- Name: logs_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX logs_created_at_idx ON public.logs USING btree (created_at DESC);


--
-- Name: notifications_addressee_club_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_addressee_club_id_created_at_idx ON public.notifications USING btree (addressee_club_id, created_at DESC);


--
-- Name: notifications_addressee_kind_type_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_addressee_kind_type_created_at_idx ON public.notifications USING btree (addressee_kind, type, created_at DESC);


--
-- Name: notifications_addressee_trainer_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_addressee_trainer_id_created_at_idx ON public.notifications USING btree (addressee_trainer_id, created_at DESC);


--
-- Name: notifications_club_unread_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_club_unread_idx ON public.notifications USING btree (addressee_club_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: notifications_personal_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_personal_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE ((addressee_kind)::text = 'personal'::text);


--
-- Name: notifications_personal_unread_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_personal_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (((addressee_kind)::text = 'personal'::text) AND (read_at IS NULL));


--
-- Name: notifications_supervision_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_supervision_idx ON public.notifications USING btree (created_at DESC) WHERE ((addressee_kind)::text = 'supervision'::text);


--
-- Name: notifications_supervision_unread_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_supervision_unread_idx ON public.notifications USING btree (created_at DESC) WHERE (((addressee_kind)::text = 'supervision'::text) AND (read_at IS NULL));


--
-- Name: notifications_trainer_unread_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_trainer_unread_idx ON public.notifications USING btree (addressee_trainer_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: notifications_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: offerings_owner_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_owner_club_id_idx ON public.offerings USING btree (owner_club_id);


--
-- Name: offerings_owner_trainer_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_owner_trainer_id_idx ON public.offerings USING btree (owner_trainer_id);


--
-- Name: offerings_owner_trainer_id_price_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_owner_trainer_id_price_idx ON public.offerings USING btree (owner_trainer_id, price);


--
-- Name: offerings_sport_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_sport_id_idx ON public.offerings USING btree (sport_id);


--
-- Name: offerings_trainer_club_link_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_trainer_club_link_id_idx ON public.offerings USING btree (trainer_club_link_id);


--
-- Name: offerings_venue_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX offerings_venue_club_id_idx ON public.offerings USING btree (venue_club_id);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: provider_client_notes_booking_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX provider_client_notes_booking_id_idx ON public.provider_client_notes USING btree (booking_id);


--
-- Name: provider_client_notes_face_club_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX provider_client_notes_face_club_idx ON public.provider_client_notes USING btree (face_club_id, client_user_id, created_at DESC);


--
-- Name: provider_client_notes_face_trainer_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX provider_client_notes_face_trainer_idx ON public.provider_client_notes USING btree (face_trainer_id, client_user_id, created_at DESC);


--
-- Name: provider_client_notes_provider_user_id_client_user_id_creat_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX provider_client_notes_provider_user_id_client_user_id_creat_idx ON public.provider_client_notes USING btree (provider_user_id, client_user_id, created_at DESC);


--
-- Name: reviews_club_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX reviews_club_id_created_at_idx ON public.reviews USING btree (club_id, created_at DESC);


--
-- Name: reviews_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX reviews_created_at_idx ON public.reviews USING btree (created_at);


--
-- Name: reviews_trainer_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX reviews_trainer_id_created_at_idx ON public.reviews USING btree (trainer_id, created_at DESC);


--
-- Name: reviews_user_id_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX reviews_user_id_club_id_idx ON public.reviews USING btree (user_id, club_id);


--
-- Name: reviews_user_id_trainer_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX reviews_user_id_trainer_id_idx ON public.reviews USING btree (user_id, trainer_id);


--
-- Name: schedule_conducted_by_trainer_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_conducted_by_trainer_id_idx ON public.schedule USING btree (conducted_by_trainer_id);


--
-- Name: schedule_date_start_time_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_date_start_time_idx ON public.schedule USING btree (date, start_time);


--
-- Name: schedule_has_free_seats_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_has_free_seats_idx ON public.schedule USING btree (date, start_time) WHERE (booked_count < capacity);


--
-- Name: schedule_offering_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_offering_id_idx ON public.schedule USING btree (offering_id);


--
-- Name: schedule_owner_club_id_date_start_time_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_owner_club_id_date_start_time_idx ON public.schedule USING btree (owner_club_id, date, start_time);


--
-- Name: schedule_owner_trainer_id_date_start_time_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_owner_trainer_id_date_start_time_idx ON public.schedule USING btree (owner_trainer_id, date, start_time);


--
-- Name: schedule_sport_id_date_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_sport_id_date_idx ON public.schedule USING btree (sport_id, date);


--
-- Name: schedule_venue_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX schedule_venue_club_id_idx ON public.schedule USING btree (venue_club_id);


--
-- Name: sessions_active_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX sessions_active_idx ON public.sessions USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_token_hash_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: specialties_name_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX specialties_name_key ON public.specialties USING btree (name);


--
-- Name: sports_name_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX sports_name_key ON public.sports USING btree (name);


--
-- Name: sports_slug_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX sports_slug_key ON public.sports USING btree (slug);


--
-- Name: tags_name_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);


--
-- Name: trainer_club_links_club_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainer_club_links_club_id_status_created_at_idx ON public.trainer_club_links USING btree (club_id, status, created_at DESC);


--
-- Name: trainer_club_links_trainer_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainer_club_links_trainer_id_status_created_at_idx ON public.trainer_club_links USING btree (trainer_id, status, created_at DESC);


--
-- Name: trainer_specialties_specialty_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainer_specialties_specialty_id_idx ON public.trainer_specialties USING btree (specialty_id);


--
-- Name: trainer_sports_sport_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainer_sports_sport_id_idx ON public.trainer_sports USING btree (sport_id);


--
-- Name: trainer_work_formats_work_format_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainer_work_formats_work_format_id_idx ON public.trainer_work_formats USING btree (work_format_id);


--
-- Name: trainers_awaiting_recheck_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_awaiting_recheck_idx ON public.trainers USING btree (hidden_at DESC) WHERE awaiting_recheck;


--
-- Name: trainers_city_status_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_city_status_idx ON public.trainers USING btree (city, status);


--
-- Name: trainers_managed_by_user_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_managed_by_user_id_idx ON public.trainers USING btree (managed_by_user_id);


--
-- Name: trainers_slug_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX trainers_slug_key ON public.trainers USING btree (slug);


--
-- Name: trainers_slug_normalized_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX trainers_slug_normalized_key ON public.trainers USING btree (slug_normalized);


--
-- Name: trainers_status_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_status_created_at_idx ON public.trainers USING btree (status, created_at DESC);


--
-- Name: trainers_status_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_status_idx ON public.trainers USING btree (status);


--
-- Name: trainers_status_rating_review_count_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX trainers_status_rating_review_count_idx ON public.trainers USING btree (status, rating DESC, review_count DESC);


--
-- Name: user_favorite_clubs_club_id_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX user_favorite_clubs_club_id_idx ON public.user_favorite_clubs USING btree (club_id);


--
-- Name: user_favorite_clubs_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE INDEX user_favorite_clubs_user_id_created_at_idx ON public.user_favorite_clubs USING btree (user_id, created_at DESC);


--
-- Name: user_notification_preferences_club_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX user_notification_preferences_club_uq ON public.user_notification_preferences USING btree (user_id, type, face_club_id) WHERE (face_club_id IS NOT NULL);


--
-- Name: user_notification_preferences_personal_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX user_notification_preferences_personal_uq ON public.user_notification_preferences USING btree (user_id, type) WHERE ((face_club_id IS NULL) AND (face_trainer_id IS NULL));


--
-- Name: user_notification_preferences_trainer_uq; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX user_notification_preferences_trainer_uq ON public.user_notification_preferences USING btree (user_id, type, face_trainer_id) WHERE (face_trainer_id IS NOT NULL);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: work_formats_name_key; Type: INDEX; Schema: public; Owner: sporthub
--

CREATE UNIQUE INDEX work_formats_name_key ON public.work_formats USING btree (name);


--
-- Name: booking_status_transitions booking_status_transitions_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.booking_status_transitions
    ADD CONSTRAINT booking_status_transitions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: booking_status_transitions booking_status_transitions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.booking_status_transitions
    ADD CONSTRAINT booking_status_transitions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookings bookings_conducted_by_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_conducted_by_trainer_id_fkey FOREIGN KEY (conducted_by_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookings bookings_offering_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.offerings(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: bookings bookings_owner_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_owner_club_id_fkey FOREIGN KEY (owner_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookings bookings_owner_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_owner_trainer_id_fkey FOREIGN KEY (owner_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookings bookings_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedule(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: bookings bookings_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_venue_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_venue_club_id_fkey FOREIGN KEY (venue_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_amenities club_amenities_amenity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_amenities
    ADD CONSTRAINT club_amenities_amenity_id_fkey FOREIGN KEY (amenity_id) REFERENCES public.amenities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_amenities club_amenities_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_amenities
    ADD CONSTRAINT club_amenities_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_images club_images_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_images
    ADD CONSTRAINT club_images_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_sports club_sports_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_sports
    ADD CONSTRAINT club_sports_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_sports club_sports_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_sports
    ADD CONSTRAINT club_sports_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_tags club_tags_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_tags
    ADD CONSTRAINT club_tags_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_tags club_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.club_tags
    ADD CONSTRAINT club_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: clubs clubs_hidden_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_hidden_by_user_id_fkey FOREIGN KEY (hidden_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: clubs clubs_managed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_managed_by_user_id_fkey FOREIGN KEY (managed_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: clubs clubs_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: logs logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notifications notifications_addressee_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_addressee_club_id_fkey FOREIGN KEY (addressee_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_addressee_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_addressee_trainer_id_fkey FOREIGN KEY (addressee_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_read_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_read_by_user_id_fkey FOREIGN KEY (read_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: offerings offerings_owner_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_owner_club_id_fkey FOREIGN KEY (owner_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: offerings offerings_owner_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_owner_trainer_id_fkey FOREIGN KEY (owner_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: offerings offerings_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: offerings offerings_trainer_club_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_trainer_club_link_id_fkey FOREIGN KEY (trainer_club_link_id) REFERENCES public.trainer_club_links(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: offerings offerings_venue_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT offerings_venue_club_id_fkey FOREIGN KEY (venue_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: provider_client_notes provider_client_notes_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: provider_client_notes provider_client_notes_client_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: provider_client_notes provider_client_notes_face_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_face_club_id_fkey FOREIGN KEY (face_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: provider_client_notes provider_client_notes_face_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_face_trainer_id_fkey FOREIGN KEY (face_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: provider_client_notes provider_client_notes_provider_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.provider_client_notes
    ADD CONSTRAINT provider_client_notes_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reviews reviews_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reviews reviews_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: schedule schedule_conducted_by_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_conducted_by_trainer_id_fkey FOREIGN KEY (conducted_by_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule schedule_offering_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.offerings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule schedule_owner_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_owner_club_id_fkey FOREIGN KEY (owner_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule schedule_owner_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_owner_trainer_id_fkey FOREIGN KEY (owner_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule schedule_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: schedule schedule_venue_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_venue_club_id_fkey FOREIGN KEY (venue_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_impersonated_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_impersonated_user_id_fkey FOREIGN KEY (impersonated_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_club_links trainer_club_links_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainer_club_links trainer_club_links_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_club_links trainer_club_links_initiated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_initiated_by_user_id_fkey FOREIGN KEY (initiated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainer_club_links trainer_club_links_rejected_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_rejected_by_user_id_fkey FOREIGN KEY (rejected_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainer_club_links trainer_club_links_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainer_club_links trainer_club_links_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_club_links
    ADD CONSTRAINT trainer_club_links_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_specialties trainer_specialties_specialty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_specialties
    ADD CONSTRAINT trainer_specialties_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.specialties(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_specialties trainer_specialties_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_specialties
    ADD CONSTRAINT trainer_specialties_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_sports trainer_sports_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_sports
    ADD CONSTRAINT trainer_sports_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: trainer_sports trainer_sports_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_sports
    ADD CONSTRAINT trainer_sports_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_work_formats trainer_work_formats_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_work_formats
    ADD CONSTRAINT trainer_work_formats_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainer_work_formats trainer_work_formats_work_format_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainer_work_formats
    ADD CONSTRAINT trainer_work_formats_work_format_id_fkey FOREIGN KEY (work_format_id) REFERENCES public.work_formats(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trainers trainers_hidden_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers
    ADD CONSTRAINT trainers_hidden_by_user_id_fkey FOREIGN KEY (hidden_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainers trainers_managed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers
    ADD CONSTRAINT trainers_managed_by_user_id_fkey FOREIGN KEY (managed_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainers trainers_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers
    ADD CONSTRAINT trainers_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trainers trainers_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.trainers
    ADD CONSTRAINT trainers_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_favorite_clubs user_favorite_clubs_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_favorite_clubs
    ADD CONSTRAINT user_favorite_clubs_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_favorite_clubs user_favorite_clubs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_favorite_clubs
    ADD CONSTRAINT user_favorite_clubs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_notification_preferences user_notification_preferences_face_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_face_club_id_fkey FOREIGN KEY (face_club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_notification_preferences user_notification_preferences_face_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_face_trainer_id_fkey FOREIGN KEY (face_trainer_id) REFERENCES public.trainers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_notification_preferences user_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sporthub
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: sporthub
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict HsB0SroXnSoExiXeW7oJMhaZ6gihGeedoVJqiGFH0We1xY5Sn7OzRTKywcAVUNG

