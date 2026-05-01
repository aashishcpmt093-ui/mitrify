--
-- PostgreSQL database dump
--

\restrict PijKqMx4Us24XENOvh2dmkdstXdZyIm1FIOEg4DTj2EV0sG6yptqk9dqENs5vBP

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

--
-- Name: stripe; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA stripe;


ALTER SCHEMA stripe OWNER TO postgres;

--
-- Name: invoice_status; Type: TYPE; Schema: stripe; Owner: postgres
--

CREATE TYPE stripe.invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'uncollectible',
    'void',
    'deleted'
);


ALTER TYPE stripe.invoice_status OWNER TO postgres;

--
-- Name: pricing_tiers; Type: TYPE; Schema: stripe; Owner: postgres
--

CREATE TYPE stripe.pricing_tiers AS ENUM (
    'graduated',
    'volume'
);


ALTER TYPE stripe.pricing_tiers OWNER TO postgres;

--
-- Name: pricing_type; Type: TYPE; Schema: stripe; Owner: postgres
--

CREATE TYPE stripe.pricing_type AS ENUM (
    'one_time',
    'recurring'
);


ALTER TYPE stripe.pricing_type OWNER TO postgres;

--
-- Name: subscription_schedule_status; Type: TYPE; Schema: stripe; Owner: postgres
--

CREATE TYPE stripe.subscription_schedule_status AS ENUM (
    'not_started',
    'active',
    'completed',
    'released',
    'canceled'
);


ALTER TYPE stripe.subscription_schedule_status OWNER TO postgres;

--
-- Name: subscription_status; Type: TYPE; Schema: stripe; Owner: postgres
--

CREATE TYPE stripe.subscription_status AS ENUM (
    'trialing',
    'active',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'past_due',
    'unpaid',
    'paused'
);


ALTER TYPE stripe.subscription_status OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new._updated_at = now();
  return NEW;
end;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: set_updated_at_metadata(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return NEW;
end;
$$;


ALTER FUNCTION public.set_updated_at_metadata() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: app_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_notifications (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) DEFAULT 'info'::character varying NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.app_notifications OWNER TO postgres;

--
-- Name: app_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.app_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.app_notifications_id_seq OWNER TO postgres;

--
-- Name: app_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.app_notifications_id_seq OWNED BY public.app_notifications.id;


--
-- Name: calls; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calls (
    id integer NOT NULL,
    customer_id character varying NOT NULL,
    provider_id character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    duration integer DEFAULT 0,
    payment_status character varying(20) DEFAULT 'free'::character varying,
    charge_reason character varying(30) DEFAULT 'normal'::character varying,
    credits_charged integer DEFAULT 1
);


ALTER TABLE public.calls OWNER TO postgres;

--
-- Name: calls_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.calls_id_seq OWNER TO postgres;

--
-- Name: calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.calls_id_seq OWNED BY public.calls.id;


--
-- Name: co_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.co_admins (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'coadmin'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    call_count integer DEFAULT 0 NOT NULL,
    cycle_entry_count integer DEFAULT 0 NOT NULL,
    cycle_approve_count integer DEFAULT 0 NOT NULL,
    cycle_reject_count integer DEFAULT 0 NOT NULL,
    cycle_call_count integer DEFAULT 0 NOT NULL,
    cycle_start_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.co_admins OWNER TO postgres;

--
-- Name: co_admins_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.co_admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.co_admins_id_seq OWNER TO postgres;

--
-- Name: co_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.co_admins_id_seq OWNED BY public.co_admins.id;


--
-- Name: credit_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_payments (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    order_id character varying(255) NOT NULL,
    credits integer NOT NULL,
    amount integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.credit_payments OWNER TO postgres;

--
-- Name: credit_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.credit_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.credit_payments_id_seq OWNER TO postgres;

--
-- Name: credit_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.credit_payments_id_seq OWNED BY public.credit_payments.id;


--
-- Name: credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credits (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    role character varying(20) NOT NULL,
    free_credits integer DEFAULT 5,
    purchased_credits integer DEFAULT 0,
    last_free_reset timestamp without time zone DEFAULT now(),
    credits_frozen boolean DEFAULT false
);


ALTER TABLE public.credits OWNER TO postgres;

--
-- Name: credits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.credits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.credits_id_seq OWNER TO postgres;

--
-- Name: credits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.credits_id_seq OWNED BY public.credits.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    co_admin_id integer NOT NULL,
    name character varying(255) NOT NULL,
    post character varying(255) NOT NULL,
    education character varying(255),
    description text,
    profile_photo text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employees_id_seq OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jobs (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    job_name character varying(200) NOT NULL,
    description text NOT NULL,
    location character varying(300) NOT NULL,
    salary character varying(100),
    work_hours character varying(100),
    contact_phone character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    low_credit boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    state character varying(100),
    district character varying(100),
    num_employees character varying(50),
    work_type character varying(50) DEFAULT 'field'::character varying
);


ALTER TABLE public.jobs OWNER TO postgres;

--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.jobs_id_seq OWNER TO postgres;

--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: local_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.local_users (
    id integer NOT NULL,
    user_id character varying DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(20),
    email character varying(255),
    username character varying(100),
    password character varying(255),
    role character varying(20) DEFAULT 'customer'::character varying NOT NULL,
    auth_method character varying(20) DEFAULT 'password'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    is_blocked boolean DEFAULT false
);


ALTER TABLE public.local_users OWNER TO postgres;

--
-- Name: local_users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.local_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.local_users_id_seq OWNER TO postgres;

--
-- Name: local_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.local_users_id_seq OWNED BY public.local_users.id;


--
-- Name: pending_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_providers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    service_name character varying(255) NOT NULL,
    description text,
    mobile character varying(20),
    mobile_numbers jsonb DEFAULT '[]'::jsonb,
    hashtags jsonb DEFAULT '[]'::jsonb,
    address text,
    latitude real,
    longitude real,
    radius_km integer DEFAULT 10,
    approx_charge character varying(100),
    profile_photo text,
    is_hidden boolean DEFAULT false,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    added_by character varying(100) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    state character varying(100),
    district character varying(100),
    verified_by character varying(100),
    group_label character varying(5),
    source character varying(20)
);


ALTER TABLE public.pending_providers OWNER TO postgres;

--
-- Name: pending_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pending_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pending_providers_id_seq OWNER TO postgres;

--
-- Name: pending_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pending_providers_id_seq OWNED BY public.pending_providers.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    role character varying(20) DEFAULT 'customer'::character varying NOT NULL,
    name character varying(255) NOT NULL,
    mobile character varying(20),
    is_blocked boolean DEFAULT false,
    promo_code character varying(20),
    referred_by character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    latitude real,
    longitude real,
    accept_double_charge boolean DEFAULT false
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.profiles_id_seq OWNER TO postgres;

--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promo_codes (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    owner_id character varying,
    usage_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    type character varying(20) DEFAULT 'admin'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    credit_amount integer DEFAULT 25
);


ALTER TABLE public.promo_codes OWNER TO postgres;

--
-- Name: promo_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.promo_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.promo_codes_id_seq OWNER TO postgres;

--
-- Name: promo_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.promo_codes_id_seq OWNED BY public.promo_codes.id;


--
-- Name: promo_usage_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promo_usage_log (
    id integer NOT NULL,
    promo_code character varying(50) NOT NULL,
    phone character varying(20) NOT NULL,
    used_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.promo_usage_log OWNER TO postgres;

--
-- Name: promo_usage_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.promo_usage_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.promo_usage_log_id_seq OWNER TO postgres;

--
-- Name: promo_usage_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.promo_usage_log_id_seq OWNED BY public.promo_usage_log.id;


--
-- Name: providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.providers (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    service_name character varying(255) NOT NULL,
    description text,
    hashtags text[],
    radius_km integer DEFAULT 10,
    approx_charge character varying(100),
    mobile_numbers text[] NOT NULL,
    latitude real,
    longitude real,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    address text,
    profile_photo text,
    is_hidden boolean DEFAULT false,
    state character varying(100),
    district character varying(100),
    added_by character varying(100) DEFAULT 'self'::character varying,
    approved_by character varying(100)
);


ALTER TABLE public.providers OWNER TO postgres;

--
-- Name: providers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.providers_id_seq OWNER TO postgres;

--
-- Name: providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.providers_id_seq OWNED BY public.providers.id;


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_payments (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    entry_count integer DEFAULT 0 NOT NULL,
    approve_count integer DEFAULT 0 NOT NULL,
    reject_count integer DEFAULT 0 NOT NULL,
    call_count integer DEFAULT 0 NOT NULL,
    total_actions integer DEFAULT 0 NOT NULL,
    rate_per_action integer DEFAULT 3 NOT NULL,
    total_amount integer DEFAULT 0 NOT NULL,
    cycle_start timestamp without time zone,
    cycle_end timestamp without time zone DEFAULT now(),
    paid_by_admin character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.salary_payments OWNER TO postgres;

--
-- Name: salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.salary_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_payments_id_seq OWNER TO postgres;

--
-- Name: salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.salary_payments_id_seq OWNED BY public.salary_payments.id;


--
-- Name: search_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.search_log (
    id integer NOT NULL,
    query character varying(255) NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    last_searched timestamp without time zone DEFAULT now()
);


ALTER TABLE public.search_log OWNER TO postgres;

--
-- Name: search_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.search_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.search_log_id_seq OWNER TO postgres;

--
-- Name: search_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.search_log_id_seq OWNED BY public.search_log.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: site_content; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_content (
    id integer NOT NULL,
    key character varying(50) NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.site_content OWNER TO postgres;

--
-- Name: site_content_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_content_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_content_id_seq OWNER TO postgres;

--
-- Name: site_content_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_content_id_seq OWNED BY public.site_content.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    type character varying(20) NOT NULL,
    start_date timestamp without time zone DEFAULT now(),
    end_date timestamp without time zone NOT NULL,
    payment_id character varying(255),
    amount integer NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscriptions_id_seq OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: visitor_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.visitor_stats (
    id integer NOT NULL,
    date character varying(10) NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.visitor_stats OWNER TO postgres;

--
-- Name: visitor_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.visitor_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.visitor_stats_id_seq OWNER TO postgres;

--
-- Name: visitor_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.visitor_stats_id_seq OWNED BY public.visitor_stats.id;


--
-- Name: _managed_webhooks; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe._managed_webhooks (
    id text NOT NULL,
    object text,
    url text NOT NULL,
    enabled_events jsonb NOT NULL,
    description text,
    enabled boolean,
    livemode boolean,
    metadata jsonb,
    secret text NOT NULL,
    status text,
    api_version text,
    created integer,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_synced_at timestamp with time zone,
    account_id text NOT NULL
);


ALTER TABLE stripe._managed_webhooks OWNER TO postgres;

--
-- Name: _migrations; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe._migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE stripe._migrations OWNER TO postgres;

--
-- Name: _sync_status; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe._sync_status (
    id integer NOT NULL,
    resource text NOT NULL,
    status text DEFAULT 'idle'::text,
    last_synced_at timestamp with time zone DEFAULT now(),
    last_incremental_cursor timestamp with time zone,
    error_message text,
    updated_at timestamp with time zone DEFAULT now(),
    account_id text NOT NULL,
    CONSTRAINT _sync_status_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'running'::text, 'complete'::text, 'error'::text])))
);


ALTER TABLE stripe._sync_status OWNER TO postgres;

--
-- Name: _sync_status_id_seq; Type: SEQUENCE; Schema: stripe; Owner: postgres
--

CREATE SEQUENCE stripe._sync_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE stripe._sync_status_id_seq OWNER TO postgres;

--
-- Name: _sync_status_id_seq; Type: SEQUENCE OWNED BY; Schema: stripe; Owner: postgres
--

ALTER SEQUENCE stripe._sync_status_id_seq OWNED BY stripe._sync_status.id;


--
-- Name: accounts; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.accounts (
    _raw_data jsonb NOT NULL,
    first_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    _last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    _updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_name text GENERATED ALWAYS AS (((_raw_data -> 'business_profile'::text) ->> 'name'::text)) STORED,
    email text GENERATED ALWAYS AS ((_raw_data ->> 'email'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    charges_enabled boolean GENERATED ALWAYS AS (((_raw_data ->> 'charges_enabled'::text))::boolean) STORED,
    payouts_enabled boolean GENERATED ALWAYS AS (((_raw_data ->> 'payouts_enabled'::text))::boolean) STORED,
    details_submitted boolean GENERATED ALWAYS AS (((_raw_data ->> 'details_submitted'::text))::boolean) STORED,
    country text GENERATED ALWAYS AS ((_raw_data ->> 'country'::text)) STORED,
    default_currency text GENERATED ALWAYS AS ((_raw_data ->> 'default_currency'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    api_key_hashes text[] DEFAULT '{}'::text[],
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.accounts OWNER TO postgres;

--
-- Name: active_entitlements; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.active_entitlements (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    feature text GENERATED ALWAYS AS ((_raw_data ->> 'feature'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.active_entitlements OWNER TO postgres;

--
-- Name: charges; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.charges (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    paid boolean GENERATED ALWAYS AS (((_raw_data ->> 'paid'::text))::boolean) STORED,
    "order" text GENERATED ALWAYS AS ((_raw_data ->> 'order'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    review text GENERATED ALWAYS AS ((_raw_data ->> 'review'::text)) STORED,
    source jsonb GENERATED ALWAYS AS ((_raw_data -> 'source'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    dispute text GENERATED ALWAYS AS ((_raw_data ->> 'dispute'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    outcome jsonb GENERATED ALWAYS AS ((_raw_data -> 'outcome'::text)) STORED,
    refunds jsonb GENERATED ALWAYS AS ((_raw_data -> 'refunds'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    captured boolean GENERATED ALWAYS AS (((_raw_data ->> 'captured'::text))::boolean) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    refunded boolean GENERATED ALWAYS AS (((_raw_data ->> 'refunded'::text))::boolean) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    destination text GENERATED ALWAYS AS ((_raw_data ->> 'destination'::text)) STORED,
    failure_code text GENERATED ALWAYS AS ((_raw_data ->> 'failure_code'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    fraud_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'fraud_details'::text)) STORED,
    receipt_email text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_email'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    amount_refunded bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_refunded'::text))::bigint) STORED,
    application_fee text GENERATED ALWAYS AS ((_raw_data ->> 'application_fee'::text)) STORED,
    failure_message text GENERATED ALWAYS AS ((_raw_data ->> 'failure_message'::text)) STORED,
    source_transfer text GENERATED ALWAYS AS ((_raw_data ->> 'source_transfer'::text)) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    payment_method_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_details'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.charges OWNER TO postgres;

--
-- Name: checkout_session_line_items; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.checkout_session_line_items (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount_discount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_discount'::text))::integer) STORED,
    amount_subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_subtotal'::text))::integer) STORED,
    amount_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_tax'::text))::integer) STORED,
    amount_total integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_total'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    price text GENERATED ALWAYS AS ((_raw_data ->> 'price'::text)) STORED,
    quantity integer GENERATED ALWAYS AS (((_raw_data ->> 'quantity'::text))::integer) STORED,
    checkout_session text GENERATED ALWAYS AS ((_raw_data ->> 'checkout_session'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.checkout_session_line_items OWNER TO postgres;

--
-- Name: checkout_sessions; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.checkout_sessions (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    adaptive_pricing jsonb GENERATED ALWAYS AS ((_raw_data -> 'adaptive_pricing'::text)) STORED,
    after_expiration jsonb GENERATED ALWAYS AS ((_raw_data -> 'after_expiration'::text)) STORED,
    allow_promotion_codes boolean GENERATED ALWAYS AS (((_raw_data ->> 'allow_promotion_codes'::text))::boolean) STORED,
    amount_subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_subtotal'::text))::integer) STORED,
    amount_total integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_total'::text))::integer) STORED,
    automatic_tax jsonb GENERATED ALWAYS AS ((_raw_data -> 'automatic_tax'::text)) STORED,
    billing_address_collection text GENERATED ALWAYS AS ((_raw_data ->> 'billing_address_collection'::text)) STORED,
    cancel_url text GENERATED ALWAYS AS ((_raw_data ->> 'cancel_url'::text)) STORED,
    client_reference_id text GENERATED ALWAYS AS ((_raw_data ->> 'client_reference_id'::text)) STORED,
    client_secret text GENERATED ALWAYS AS ((_raw_data ->> 'client_secret'::text)) STORED,
    collected_information jsonb GENERATED ALWAYS AS ((_raw_data -> 'collected_information'::text)) STORED,
    consent jsonb GENERATED ALWAYS AS ((_raw_data -> 'consent'::text)) STORED,
    consent_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'consent_collection'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    currency_conversion jsonb GENERATED ALWAYS AS ((_raw_data -> 'currency_conversion'::text)) STORED,
    custom_fields jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_fields'::text)) STORED,
    custom_text jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_text'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    customer_creation text GENERATED ALWAYS AS ((_raw_data ->> 'customer_creation'::text)) STORED,
    customer_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_details'::text)) STORED,
    customer_email text GENERATED ALWAYS AS ((_raw_data ->> 'customer_email'::text)) STORED,
    discounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discounts'::text)) STORED,
    expires_at integer GENERATED ALWAYS AS (((_raw_data ->> 'expires_at'::text))::integer) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    invoice_creation jsonb GENERATED ALWAYS AS ((_raw_data -> 'invoice_creation'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    locale text GENERATED ALWAYS AS ((_raw_data ->> 'locale'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    mode text GENERATED ALWAYS AS ((_raw_data ->> 'mode'::text)) STORED,
    optional_items jsonb GENERATED ALWAYS AS ((_raw_data -> 'optional_items'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    payment_link text GENERATED ALWAYS AS ((_raw_data ->> 'payment_link'::text)) STORED,
    payment_method_collection text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method_collection'::text)) STORED,
    payment_method_configuration_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_configuration_details'::text)) STORED,
    payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_options'::text)) STORED,
    payment_method_types jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_types'::text)) STORED,
    payment_status text GENERATED ALWAYS AS ((_raw_data ->> 'payment_status'::text)) STORED,
    permissions jsonb GENERATED ALWAYS AS ((_raw_data -> 'permissions'::text)) STORED,
    phone_number_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'phone_number_collection'::text)) STORED,
    presentment_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'presentment_details'::text)) STORED,
    recovered_from text GENERATED ALWAYS AS ((_raw_data ->> 'recovered_from'::text)) STORED,
    redirect_on_completion text GENERATED ALWAYS AS ((_raw_data ->> 'redirect_on_completion'::text)) STORED,
    return_url text GENERATED ALWAYS AS ((_raw_data ->> 'return_url'::text)) STORED,
    saved_payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'saved_payment_method_options'::text)) STORED,
    setup_intent text GENERATED ALWAYS AS ((_raw_data ->> 'setup_intent'::text)) STORED,
    shipping_address_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_address_collection'::text)) STORED,
    shipping_cost jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_cost'::text)) STORED,
    shipping_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_details'::text)) STORED,
    shipping_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_options'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    submit_type text GENERATED ALWAYS AS ((_raw_data ->> 'submit_type'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    success_url text GENERATED ALWAYS AS ((_raw_data ->> 'success_url'::text)) STORED,
    tax_id_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_id_collection'::text)) STORED,
    total_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_details'::text)) STORED,
    ui_mode text GENERATED ALWAYS AS ((_raw_data ->> 'ui_mode'::text)) STORED,
    url text GENERATED ALWAYS AS ((_raw_data ->> 'url'::text)) STORED,
    wallet_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'wallet_options'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.checkout_sessions OWNER TO postgres;

--
-- Name: coupons; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.coupons (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    valid boolean GENERATED ALWAYS AS (((_raw_data ->> 'valid'::text))::boolean) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    duration text GENERATED ALWAYS AS ((_raw_data ->> 'duration'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    redeem_by integer GENERATED ALWAYS AS (((_raw_data ->> 'redeem_by'::text))::integer) STORED,
    amount_off bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_off'::text))::bigint) STORED,
    percent_off double precision GENERATED ALWAYS AS (((_raw_data ->> 'percent_off'::text))::double precision) STORED,
    times_redeemed bigint GENERATED ALWAYS AS (((_raw_data ->> 'times_redeemed'::text))::bigint) STORED,
    max_redemptions bigint GENERATED ALWAYS AS (((_raw_data ->> 'max_redemptions'::text))::bigint) STORED,
    duration_in_months bigint GENERATED ALWAYS AS (((_raw_data ->> 'duration_in_months'::text))::bigint) STORED,
    percent_off_precise double precision GENERATED ALWAYS AS (((_raw_data ->> 'percent_off_precise'::text))::double precision) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.coupons OWNER TO postgres;

--
-- Name: credit_notes; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.credit_notes (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    amount_shipping integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_shipping'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    customer_balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'customer_balance_transaction'::text)) STORED,
    discount_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'discount_amount'::text))::integer) STORED,
    discount_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount_amounts'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    lines jsonb GENERATED ALWAYS AS ((_raw_data -> 'lines'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    memo text GENERATED ALWAYS AS ((_raw_data ->> 'memo'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    number text GENERATED ALWAYS AS ((_raw_data ->> 'number'::text)) STORED,
    out_of_band_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'out_of_band_amount'::text))::integer) STORED,
    pdf text GENERATED ALWAYS AS ((_raw_data ->> 'pdf'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    refund text GENERATED ALWAYS AS ((_raw_data ->> 'refund'::text)) STORED,
    shipping_cost jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_cost'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal'::text))::integer) STORED,
    subtotal_excluding_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal_excluding_tax'::text))::integer) STORED,
    tax_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_amounts'::text)) STORED,
    total integer GENERATED ALWAYS AS (((_raw_data ->> 'total'::text))::integer) STORED,
    total_excluding_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'total_excluding_tax'::text))::integer) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    voided_at text GENERATED ALWAYS AS ((_raw_data ->> 'voided_at'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.credit_notes OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.customers (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    address jsonb GENERATED ALWAYS AS ((_raw_data -> 'address'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    email text GENERATED ALWAYS AS ((_raw_data ->> 'email'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    phone text GENERATED ALWAYS AS ((_raw_data ->> 'phone'::text)) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    balance integer GENERATED ALWAYS AS (((_raw_data ->> 'balance'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    delinquent boolean GENERATED ALWAYS AS (((_raw_data ->> 'delinquent'::text))::boolean) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    invoice_prefix text GENERATED ALWAYS AS ((_raw_data ->> 'invoice_prefix'::text)) STORED,
    invoice_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'invoice_settings'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_invoice_sequence integer GENERATED ALWAYS AS (((_raw_data ->> 'next_invoice_sequence'::text))::integer) STORED,
    preferred_locales jsonb GENERATED ALWAYS AS ((_raw_data -> 'preferred_locales'::text)) STORED,
    tax_exempt text GENERATED ALWAYS AS ((_raw_data ->> 'tax_exempt'::text)) STORED,
    deleted boolean GENERATED ALWAYS AS (((_raw_data ->> 'deleted'::text))::boolean) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.customers OWNER TO postgres;

--
-- Name: disputes; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.disputes (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    evidence jsonb GENERATED ALWAYS AS ((_raw_data -> 'evidence'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    evidence_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'evidence_details'::text)) STORED,
    balance_transactions jsonb GENERATED ALWAYS AS ((_raw_data -> 'balance_transactions'::text)) STORED,
    is_charge_refundable boolean GENERATED ALWAYS AS (((_raw_data ->> 'is_charge_refundable'::text))::boolean) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.disputes OWNER TO postgres;

--
-- Name: early_fraud_warnings; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.early_fraud_warnings (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    actionable boolean GENERATED ALWAYS AS (((_raw_data ->> 'actionable'::text))::boolean) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    fraud_type text GENERATED ALWAYS AS ((_raw_data ->> 'fraud_type'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.early_fraud_warnings OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.events (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    data jsonb GENERATED ALWAYS AS ((_raw_data -> 'data'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    request text GENERATED ALWAYS AS ((_raw_data ->> 'request'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    api_version text GENERATED ALWAYS AS ((_raw_data ->> 'api_version'::text)) STORED,
    pending_webhooks bigint GENERATED ALWAYS AS (((_raw_data ->> 'pending_webhooks'::text))::bigint) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.events OWNER TO postgres;

--
-- Name: features; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.features (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.features OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.invoices (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    auto_advance boolean GENERATED ALWAYS AS (((_raw_data ->> 'auto_advance'::text))::boolean) STORED,
    collection_method text GENERATED ALWAYS AS ((_raw_data ->> 'collection_method'::text)) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    hosted_invoice_url text GENERATED ALWAYS AS ((_raw_data ->> 'hosted_invoice_url'::text)) STORED,
    lines jsonb GENERATED ALWAYS AS ((_raw_data -> 'lines'::text)) STORED,
    period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'period_end'::text))::integer) STORED,
    period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'period_start'::text))::integer) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    total bigint GENERATED ALWAYS AS (((_raw_data ->> 'total'::text))::bigint) STORED,
    account_country text GENERATED ALWAYS AS ((_raw_data ->> 'account_country'::text)) STORED,
    account_name text GENERATED ALWAYS AS ((_raw_data ->> 'account_name'::text)) STORED,
    account_tax_ids jsonb GENERATED ALWAYS AS ((_raw_data -> 'account_tax_ids'::text)) STORED,
    amount_due bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_due'::text))::bigint) STORED,
    amount_paid bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_paid'::text))::bigint) STORED,
    amount_remaining bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_remaining'::text))::bigint) STORED,
    application_fee_amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_amount'::text))::bigint) STORED,
    attempt_count integer GENERATED ALWAYS AS (((_raw_data ->> 'attempt_count'::text))::integer) STORED,
    attempted boolean GENERATED ALWAYS AS (((_raw_data ->> 'attempted'::text))::boolean) STORED,
    billing_reason text GENERATED ALWAYS AS ((_raw_data ->> 'billing_reason'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    custom_fields jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_fields'::text)) STORED,
    customer_address jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_address'::text)) STORED,
    customer_email text GENERATED ALWAYS AS ((_raw_data ->> 'customer_email'::text)) STORED,
    customer_name text GENERATED ALWAYS AS ((_raw_data ->> 'customer_name'::text)) STORED,
    customer_phone text GENERATED ALWAYS AS ((_raw_data ->> 'customer_phone'::text)) STORED,
    customer_shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_shipping'::text)) STORED,
    customer_tax_exempt text GENERATED ALWAYS AS ((_raw_data ->> 'customer_tax_exempt'::text)) STORED,
    customer_tax_ids jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_tax_ids'::text)) STORED,
    default_tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_tax_rates'::text)) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    discounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discounts'::text)) STORED,
    due_date integer GENERATED ALWAYS AS (((_raw_data ->> 'due_date'::text))::integer) STORED,
    ending_balance integer GENERATED ALWAYS AS (((_raw_data ->> 'ending_balance'::text))::integer) STORED,
    footer text GENERATED ALWAYS AS ((_raw_data ->> 'footer'::text)) STORED,
    invoice_pdf text GENERATED ALWAYS AS ((_raw_data ->> 'invoice_pdf'::text)) STORED,
    last_finalization_error jsonb GENERATED ALWAYS AS ((_raw_data -> 'last_finalization_error'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_payment_attempt integer GENERATED ALWAYS AS (((_raw_data ->> 'next_payment_attempt'::text))::integer) STORED,
    number text GENERATED ALWAYS AS ((_raw_data ->> 'number'::text)) STORED,
    paid boolean GENERATED ALWAYS AS (((_raw_data ->> 'paid'::text))::boolean) STORED,
    payment_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_settings'::text)) STORED,
    post_payment_credit_notes_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'post_payment_credit_notes_amount'::text))::integer) STORED,
    pre_payment_credit_notes_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'pre_payment_credit_notes_amount'::text))::integer) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    starting_balance integer GENERATED ALWAYS AS (((_raw_data ->> 'starting_balance'::text))::integer) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    status_transitions jsonb GENERATED ALWAYS AS ((_raw_data -> 'status_transitions'::text)) STORED,
    subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal'::text))::integer) STORED,
    tax integer GENERATED ALWAYS AS (((_raw_data ->> 'tax'::text))::integer) STORED,
    total_discount_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_discount_amounts'::text)) STORED,
    total_tax_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_tax_amounts'::text)) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    webhooks_delivered_at integer GENERATED ALWAYS AS (((_raw_data ->> 'webhooks_delivered_at'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    default_payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'default_payment_method'::text)) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.invoices OWNER TO postgres;

--
-- Name: payment_intents; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.payment_intents (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    amount_capturable integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_capturable'::text))::integer) STORED,
    amount_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'amount_details'::text)) STORED,
    amount_received integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_received'::text))::integer) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    application_fee_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_amount'::text))::integer) STORED,
    automatic_payment_methods text GENERATED ALWAYS AS ((_raw_data ->> 'automatic_payment_methods'::text)) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    cancellation_reason text GENERATED ALWAYS AS ((_raw_data ->> 'cancellation_reason'::text)) STORED,
    capture_method text GENERATED ALWAYS AS ((_raw_data ->> 'capture_method'::text)) STORED,
    client_secret text GENERATED ALWAYS AS ((_raw_data ->> 'client_secret'::text)) STORED,
    confirmation_method text GENERATED ALWAYS AS ((_raw_data ->> 'confirmation_method'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    last_payment_error text GENERATED ALWAYS AS ((_raw_data ->> 'last_payment_error'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    next_action text GENERATED ALWAYS AS ((_raw_data ->> 'next_action'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method'::text)) STORED,
    payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_options'::text)) STORED,
    payment_method_types jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_types'::text)) STORED,
    processing text GENERATED ALWAYS AS ((_raw_data ->> 'processing'::text)) STORED,
    receipt_email text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_email'::text)) STORED,
    review text GENERATED ALWAYS AS ((_raw_data ->> 'review'::text)) STORED,
    setup_future_usage text GENERATED ALWAYS AS ((_raw_data ->> 'setup_future_usage'::text)) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_descriptor_suffix text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor_suffix'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.payment_intents OWNER TO postgres;

--
-- Name: payment_methods; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.payment_methods (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    billing_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_details'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    card jsonb GENERATED ALWAYS AS ((_raw_data -> 'card'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.payment_methods OWNER TO postgres;

--
-- Name: payouts; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.payouts (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    date text GENERATED ALWAYS AS ((_raw_data ->> 'date'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    method text GENERATED ALWAYS AS ((_raw_data ->> 'method'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    automatic boolean GENERATED ALWAYS AS (((_raw_data ->> 'automatic'::text))::boolean) STORED,
    recipient text GENERATED ALWAYS AS ((_raw_data ->> 'recipient'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    destination text GENERATED ALWAYS AS ((_raw_data ->> 'destination'::text)) STORED,
    source_type text GENERATED ALWAYS AS ((_raw_data ->> 'source_type'::text)) STORED,
    arrival_date text GENERATED ALWAYS AS ((_raw_data ->> 'arrival_date'::text)) STORED,
    bank_account jsonb GENERATED ALWAYS AS ((_raw_data -> 'bank_account'::text)) STORED,
    failure_code text GENERATED ALWAYS AS ((_raw_data ->> 'failure_code'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    amount_reversed bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_reversed'::text))::bigint) STORED,
    failure_message text GENERATED ALWAYS AS ((_raw_data ->> 'failure_message'::text)) STORED,
    source_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'source_transaction'::text)) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_description text GENERATED ALWAYS AS ((_raw_data ->> 'statement_description'::text)) STORED,
    failure_balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'failure_balance_transaction'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.payouts OWNER TO postgres;

--
-- Name: plans; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.plans (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    tiers jsonb GENERATED ALWAYS AS ((_raw_data -> 'tiers'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    product text GENERATED ALWAYS AS ((_raw_data ->> 'product'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    "interval" text GENERATED ALWAYS AS ((_raw_data ->> 'interval'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    nickname text GENERATED ALWAYS AS ((_raw_data ->> 'nickname'::text)) STORED,
    tiers_mode text GENERATED ALWAYS AS ((_raw_data ->> 'tiers_mode'::text)) STORED,
    usage_type text GENERATED ALWAYS AS ((_raw_data ->> 'usage_type'::text)) STORED,
    billing_scheme text GENERATED ALWAYS AS ((_raw_data ->> 'billing_scheme'::text)) STORED,
    interval_count bigint GENERATED ALWAYS AS (((_raw_data ->> 'interval_count'::text))::bigint) STORED,
    aggregate_usage text GENERATED ALWAYS AS ((_raw_data ->> 'aggregate_usage'::text)) STORED,
    transform_usage text GENERATED ALWAYS AS ((_raw_data ->> 'transform_usage'::text)) STORED,
    trial_period_days bigint GENERATED ALWAYS AS (((_raw_data ->> 'trial_period_days'::text))::bigint) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_description text GENERATED ALWAYS AS ((_raw_data ->> 'statement_description'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.plans OWNER TO postgres;

--
-- Name: prices; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.prices (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    nickname text GENERATED ALWAYS AS ((_raw_data ->> 'nickname'::text)) STORED,
    recurring jsonb GENERATED ALWAYS AS ((_raw_data -> 'recurring'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    unit_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'unit_amount'::text))::integer) STORED,
    billing_scheme text GENERATED ALWAYS AS ((_raw_data ->> 'billing_scheme'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    tiers_mode text GENERATED ALWAYS AS ((_raw_data ->> 'tiers_mode'::text)) STORED,
    transform_quantity jsonb GENERATED ALWAYS AS ((_raw_data -> 'transform_quantity'::text)) STORED,
    unit_amount_decimal text GENERATED ALWAYS AS ((_raw_data ->> 'unit_amount_decimal'::text)) STORED,
    product text GENERATED ALWAYS AS ((_raw_data ->> 'product'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.prices OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.products (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    default_price text GENERATED ALWAYS AS ((_raw_data ->> 'default_price'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    images jsonb GENERATED ALWAYS AS ((_raw_data -> 'images'::text)) STORED,
    marketing_features jsonb GENERATED ALWAYS AS ((_raw_data -> 'marketing_features'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    package_dimensions jsonb GENERATED ALWAYS AS ((_raw_data -> 'package_dimensions'::text)) STORED,
    shippable boolean GENERATED ALWAYS AS (((_raw_data ->> 'shippable'::text))::boolean) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    unit_label text GENERATED ALWAYS AS ((_raw_data ->> 'unit_label'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    url text GENERATED ALWAYS AS ((_raw_data ->> 'url'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.products OWNER TO postgres;

--
-- Name: refunds; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.refunds (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    destination_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'destination_details'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    source_transfer_reversal text GENERATED ALWAYS AS ((_raw_data ->> 'source_transfer_reversal'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    transfer_reversal text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_reversal'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.refunds OWNER TO postgres;

--
-- Name: reviews; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.reviews (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    billing_zip text GENERATED ALWAYS AS ((_raw_data ->> 'billing_zip'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    closed_reason text GENERATED ALWAYS AS ((_raw_data ->> 'closed_reason'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    ip_address text GENERATED ALWAYS AS ((_raw_data ->> 'ip_address'::text)) STORED,
    ip_address_location jsonb GENERATED ALWAYS AS ((_raw_data -> 'ip_address_location'::text)) STORED,
    open boolean GENERATED ALWAYS AS (((_raw_data ->> 'open'::text))::boolean) STORED,
    opened_reason text GENERATED ALWAYS AS ((_raw_data ->> 'opened_reason'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    session text GENERATED ALWAYS AS ((_raw_data ->> 'session'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.reviews OWNER TO postgres;

--
-- Name: setup_intents; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.setup_intents (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    usage text GENERATED ALWAYS AS ((_raw_data ->> 'usage'::text)) STORED,
    cancellation_reason text GENERATED ALWAYS AS ((_raw_data ->> 'cancellation_reason'::text)) STORED,
    latest_attempt text GENERATED ALWAYS AS ((_raw_data ->> 'latest_attempt'::text)) STORED,
    mandate text GENERATED ALWAYS AS ((_raw_data ->> 'mandate'::text)) STORED,
    single_use_mandate text GENERATED ALWAYS AS ((_raw_data ->> 'single_use_mandate'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.setup_intents OWNER TO postgres;

--
-- Name: subscription_items; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.subscription_items (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    billing_thresholds jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_thresholds'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    deleted boolean GENERATED ALWAYS AS (((_raw_data ->> 'deleted'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    quantity integer GENERATED ALWAYS AS (((_raw_data ->> 'quantity'::text))::integer) STORED,
    price text GENERATED ALWAYS AS ((_raw_data ->> 'price'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_rates'::text)) STORED,
    current_period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_end'::text))::integer) STORED,
    current_period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_start'::text))::integer) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.subscription_items OWNER TO postgres;

--
-- Name: subscription_schedules; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.subscription_schedules (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    completed_at integer GENERATED ALWAYS AS (((_raw_data ->> 'completed_at'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    current_phase jsonb GENERATED ALWAYS AS ((_raw_data -> 'current_phase'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    default_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_settings'::text)) STORED,
    end_behavior text GENERATED ALWAYS AS ((_raw_data ->> 'end_behavior'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    phases jsonb GENERATED ALWAYS AS ((_raw_data -> 'phases'::text)) STORED,
    released_at integer GENERATED ALWAYS AS (((_raw_data ->> 'released_at'::text))::integer) STORED,
    released_subscription text GENERATED ALWAYS AS ((_raw_data ->> 'released_subscription'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    test_clock text GENERATED ALWAYS AS ((_raw_data ->> 'test_clock'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.subscription_schedules OWNER TO postgres;

--
-- Name: subscriptions; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.subscriptions (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    cancel_at_period_end boolean GENERATED ALWAYS AS (((_raw_data ->> 'cancel_at_period_end'::text))::boolean) STORED,
    current_period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_end'::text))::integer) STORED,
    current_period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_start'::text))::integer) STORED,
    default_payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'default_payment_method'::text)) STORED,
    items jsonb GENERATED ALWAYS AS ((_raw_data -> 'items'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    pending_setup_intent text GENERATED ALWAYS AS ((_raw_data ->> 'pending_setup_intent'::text)) STORED,
    pending_update jsonb GENERATED ALWAYS AS ((_raw_data -> 'pending_update'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    application_fee_percent double precision GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_percent'::text))::double precision) STORED,
    billing_cycle_anchor integer GENERATED ALWAYS AS (((_raw_data ->> 'billing_cycle_anchor'::text))::integer) STORED,
    billing_thresholds jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_thresholds'::text)) STORED,
    cancel_at integer GENERATED ALWAYS AS (((_raw_data ->> 'cancel_at'::text))::integer) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    collection_method text GENERATED ALWAYS AS ((_raw_data ->> 'collection_method'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    days_until_due integer GENERATED ALWAYS AS (((_raw_data ->> 'days_until_due'::text))::integer) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    default_tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_tax_rates'::text)) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    ended_at integer GENERATED ALWAYS AS (((_raw_data ->> 'ended_at'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_pending_invoice_item_invoice integer GENERATED ALWAYS AS (((_raw_data ->> 'next_pending_invoice_item_invoice'::text))::integer) STORED,
    pause_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'pause_collection'::text)) STORED,
    pending_invoice_item_interval jsonb GENERATED ALWAYS AS ((_raw_data -> 'pending_invoice_item_interval'::text)) STORED,
    start_date integer GENERATED ALWAYS AS (((_raw_data ->> 'start_date'::text))::integer) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    trial_end jsonb GENERATED ALWAYS AS ((_raw_data -> 'trial_end'::text)) STORED,
    trial_start jsonb GENERATED ALWAYS AS ((_raw_data -> 'trial_start'::text)) STORED,
    schedule text GENERATED ALWAYS AS ((_raw_data ->> 'schedule'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    latest_invoice text GENERATED ALWAYS AS ((_raw_data ->> 'latest_invoice'::text)) STORED,
    plan text GENERATED ALWAYS AS ((_raw_data ->> 'plan'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.subscriptions OWNER TO postgres;

--
-- Name: tax_ids; Type: TABLE; Schema: stripe; Owner: postgres
--

CREATE TABLE stripe.tax_ids (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    country text GENERATED ALWAYS AS ((_raw_data ->> 'country'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    value text GENERATED ALWAYS AS ((_raw_data ->> 'value'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    owner jsonb GENERATED ALWAYS AS ((_raw_data -> 'owner'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


ALTER TABLE stripe.tax_ids OWNER TO postgres;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: app_notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications ALTER COLUMN id SET DEFAULT nextval('public.app_notifications_id_seq'::regclass);


--
-- Name: calls id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calls ALTER COLUMN id SET DEFAULT nextval('public.calls_id_seq'::regclass);


--
-- Name: co_admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_admins ALTER COLUMN id SET DEFAULT nextval('public.co_admins_id_seq'::regclass);


--
-- Name: credit_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_payments ALTER COLUMN id SET DEFAULT nextval('public.credit_payments_id_seq'::regclass);


--
-- Name: credits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credits ALTER COLUMN id SET DEFAULT nextval('public.credits_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: local_users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users ALTER COLUMN id SET DEFAULT nextval('public.local_users_id_seq'::regclass);


--
-- Name: pending_providers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_providers ALTER COLUMN id SET DEFAULT nextval('public.pending_providers_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: promo_codes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_codes ALTER COLUMN id SET DEFAULT nextval('public.promo_codes_id_seq'::regclass);


--
-- Name: promo_usage_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_usage_log ALTER COLUMN id SET DEFAULT nextval('public.promo_usage_log_id_seq'::regclass);


--
-- Name: providers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.providers ALTER COLUMN id SET DEFAULT nextval('public.providers_id_seq'::regclass);


--
-- Name: salary_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_payments ALTER COLUMN id SET DEFAULT nextval('public.salary_payments_id_seq'::regclass);


--
-- Name: search_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.search_log ALTER COLUMN id SET DEFAULT nextval('public.search_log_id_seq'::regclass);


--
-- Name: site_content id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_content ALTER COLUMN id SET DEFAULT nextval('public.site_content_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: visitor_stats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.visitor_stats ALTER COLUMN id SET DEFAULT nextval('public.visitor_stats_id_seq'::regclass);


--
-- Name: _sync_status id; Type: DEFAULT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._sync_status ALTER COLUMN id SET DEFAULT nextval('stripe._sync_status_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: postgres
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	fa669970eeaac4f5e0edbceb137c48fc2b651c5ebdf5d0505255d4ca38a01e70	1771601017032
\.


--
-- Data for Name: app_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_notifications (id, user_id, title, message, type, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: calls; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.calls (id, customer_id, provider_id, "timestamp", duration, payment_status, charge_reason, credits_charged) FROM stdin;
1	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	aff7a381-20a9-41cb-9af8-b8d65f96a8fd	2026-02-20 11:08:25.975945	91	free	normal	1
2	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	93fd825c-d9b8-440d-8615-32714665081c	2026-02-20 11:08:47.61492	173	paid	normal	1
3	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	aff7a381-20a9-41cb-9af8-b8d65f96a8fd	2026-02-20 11:54:52.160312	62	paid	normal	1
4	55052673	93fd825c-d9b8-440d-8615-32714665081c	2026-02-20 18:36:06.593129	318	free	normal	1
5	c2e1416d-26f3-4253-b7bd-f09a3900ae06	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	2026-03-13 14:35:05.671379	307	credit	normal	1
6	c2e1416d-26f3-4253-b7bd-f09a3900ae06	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	2026-03-18 13:36:27.356	247	credit	normal	1
7	c2e1416d-26f3-4253-b7bd-f09a3900ae06	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	2026-03-18 13:37:12.725302	222	credit	normal	1
8	c2e1416d-26f3-4253-b7bd-f09a3900ae06	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	2026-03-18 13:46:20.619979	44	credit	normal	1
9	c2e1416d-26f3-4253-b7bd-f09a3900ae06	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	2026-03-18 13:47:07.247629	189	credit	normal	1
\.


--
-- Data for Name: co_admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.co_admins (id, username, password, role, is_active, created_at, call_count, cycle_entry_count, cycle_approve_count, cycle_reject_count, cycle_call_count, cycle_start_at) FROM stdin;
2	mitrifyadmin1	$2b$10$VdfZVHE9hiDyt/WI3P0b5eRm9oSoCHN7UC14pgTUCxFyxEkhcQ.Am	coadmin	t	2026-03-12 11:04:08.496738	0	0	0	0	0	2026-04-11 06:57:56.953929
3	testadmin1	$2b$10$y/Bbd6/t9OpI6/N3wWWlBOdDJT5mLaQEH4a66/umlx3KlnhbKVuDu	testadmin	t	2026-03-12 11:04:08.641544	0	0	0	0	0	2026-04-11 06:57:56.953929
\.


--
-- Data for Name: credit_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_payments (id, user_id, order_id, credits, amount, status, paid_at, created_at) FROM stdin;
\.


--
-- Data for Name: credits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credits (id, user_id, role, free_credits, purchased_credits, last_free_reset, credits_frozen) FROM stdin;
1	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	provider	5	0	2026-02-22 15:48:08.565024	f
2	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	customer	5	0	2026-02-23 02:56:21.937593	f
3	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	provider	5	0	2026-02-23 02:57:49.132939	f
4	293f4778-1059-4c3e-bb90-03a0a5c49d5d	customer	5	0	2026-02-24 17:12:05.59814	f
5	7baac0f3-fff8-408a-bcf8-00a61a3b72e0	customer	5	0	2026-02-24 17:19:26.716392	f
6	b83b99e3-849b-4da9-a23d-fe63413b0322	customer	0	0	2026-02-24 18:24:19.258703	f
7	c2e1416d-26f3-4253-b7bd-f09a3900ae06	customer	5	0	2026-03-12 10:30:20.669	f
8	c2e1416d-26f3-4253-b7bd-f09a3900ae06	user	20	0	2026-03-13 14:18:22.715324	f
9	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	user	20	0	2026-03-13 14:35:05.659455	f
10	93fd825c-d9b8-440d-8615-32714665081c	user	25	0	2026-03-21 07:34:41.237634	f
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, co_admin_id, name, post, education, description, profile_photo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jobs (id, user_id, job_name, description, location, salary, work_hours, contact_phone, is_active, low_credit, created_at, state, district, num_employees, work_type) FROM stdin;
\.


--
-- Data for Name: local_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.local_users (id, user_id, phone, email, username, password, role, auth_method, created_at, is_blocked) FROM stdin;
1	0f979790-8b9a-4e16-8bb1-d583cd9454ad	9876543210	\N	\N	\N	customer	otp	2026-02-20 10:51:30.09308	f
2	bcbd8ddf-1b91-46ce-ab23-6c9a9e8d7839	\N	\N	testprovider_WzYhkM	$2b$10$Cxkoq3q2RDuvb95L38psd.i88xvMR8Q7Hxi4nC9qrwdxYVxyLJ0rK	provider	password	2026-02-20 10:52:35.519339	f
3	93fd825c-d9b8-440d-8615-32714665081c	8888888888	\N	\N	\N	customer	otp	2026-02-20 10:54:44.477836	f
4	aff7a381-20a9-41cb-9af8-b8d65f96a8fd	7777700001	\N	\N	\N	provider	otp	2026-02-20 11:03:51.771597	f
5	8d8f39fd-543b-4c4d-ab18-6f4397a26be8	7777700002	\N	\N	\N	customer	otp	2026-02-20 11:04:48.89868	f
6	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	1111111111	\N	\N	\N	customer	otp	2026-02-20 11:07:57.772746	f
7	37f704d2-8e53-46ed-aeb0-c047ec216d51	9999900001	\N	\N	\N	provider	otp	2026-02-20 11:16:20.709253	f
8	c7e03646-e337-45e6-b973-c3215ba81b3e	9999900099	\N	\N	\N	customer	otp	2026-02-20 11:17:13.869657	f
9	f8f6ec86-a916-475c-977b-aa2746f1c9bc	8888811111	\N	\N	\N	customer	otp	2026-02-20 11:30:25.854812	f
10	e9c1d6c5-ddf8-4515-82d5-e1cc211124f4	9876500001	\N	\N	\N	customer	otp	2026-02-20 18:17:40.039104	f
11	75a177bc-39fe-4192-9cfe-7f9c9a8c48c5	9876543000	\N	\N	\N	customer	otp	2026-02-20 18:29:31.551611	f
12	507b1aa0-6749-4c32-91d6-dfd984ecc802	0000000000	\N	asheesh	$2b$10$GGdvBtpsNC3CHFHjRb515OVGbpBZn87bpCO52uzNePzwV0DQgTUgi	customer	password	2026-02-20 18:48:10.602456	f
13	c70a0195-5717-49b6-bcf3-33c3fb0fb23e	+917742039808	\N	\N	\N	customer	otp	2026-02-20 18:52:10.042767	f
14	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	7742039808	\N	\N	\N	customer	otp	2026-02-20 18:56:11.588079	f
15	8c3f6187-b59a-42bf-92eb-3f55edfdef74	+919876543210	\N	testuser_otp_1771680216578	$2b$10$F7CTRBIqgNyrDIjObEz1ceVxpaPWrDLhAO07iMMXJdPKrUj2OCms6	customer	password	2026-02-21 13:23:41.505614	f
16	58e0968b-4ce9-4105-88ba-a430c2f0798e	+919999988888	\N	\N	\N	customer	otp	2026-02-21 16:25:36.254707	f
17	940ce0fe-a32f-4e40-9e34-e3e2374bb1c7	+919999911111	\N	\N	\N	customer	otp	2026-02-21 16:30:35.775155	f
18	2c439a35-bd16-4389-b5e5-e3ed7e9e7b1d	+919999922222	\N	\N	\N	customer	otp	2026-02-21 16:41:40.008573	f
19	88025c5d-4490-4a43-a1fe-bc9c84bf66fa	+919876500001	\N	\N	\N	provider	otp	2026-02-21 16:50:39.448615	f
20	a022c76c-b24c-4a19-87b3-28422ea25d11	+919876500002	\N	\N	\N	customer	otp	2026-02-21 16:51:11.927866	f
21	33de239d-2216-47a9-a3ee-0cc796ac8034	+919876500099	\N	\N	\N	provider	otp	2026-02-21 17:03:42.707972	f
22	237fb93a-1fd8-48b3-abf4-75f9efab2b61	+919876500077	\N	\N	\N	provider	otp	2026-02-21 17:26:19.736807	f
23	293f4778-1059-4c3e-bb90-03a0a5c49d5d	\N	ab@bh.com	\N	\N	customer	otp	2026-02-24 17:11:53.483139	f
24	7baac0f3-fff8-408a-bcf8-00a61a3b72e0	\N	you@gmai.com	\N	\N	customer	otp	2026-02-24 17:19:18.231559	f
25	b83b99e3-849b-4da9-a23d-fe63413b0322	\N	Aashishcpmt09@gmail.com	\N	\N	customer	otp	2026-02-24 18:24:06.320455	f
26	c2e1416d-26f3-4253-b7bd-f09a3900ae06	\N	aashidhcpmt09@gmail.com	aashishcpmt09	$2b$10$fF0SvTptSfe5t.mW0rHh9u93T.HvK4XGzfE/UholQVm9KErq6gmSi	customer	password	2026-02-25 12:12:00.470128	f
\.


--
-- Data for Name: pending_providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pending_providers (id, name, service_name, description, mobile, mobile_numbers, hashtags, address, latitude, longitude, radius_km, approx_charge, profile_photo, is_hidden, status, added_by, notes, created_at, state, district, verified_by, group_label, source) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, user_id, role, name, mobile, is_blocked, promo_code, referred_by, created_at, latitude, longitude, accept_double_charge) FROM stdin;
29	b83b99e3-849b-4da9-a23d-fe63413b0322	customer	Doctor Aashish Rathore	\N	f	MITRIFYA8E63E	\N	2026-02-24 18:24:18.141288	\N	\N	f
30	c2e1416d-26f3-4253-b7bd-f09a3900ae06	customer	aashishcpmt09	\N	f	MITRIFY6D8E5F	\N	2026-02-25 12:12:11.376838	28.03174	79.12761	f
33	93fd825c-d9b8-440d-8615-32714665081c	provider	kaun	8888888888	f	\N	\N	2026-03-21 07:34:41.229484	\N	\N	f
34	93fd825c-d9b8-440d-8615-32714665081c	customer	kaun	8888888888	f	\N	\N	2026-03-21 07:34:41.652622	28.007545	79.149254	f
31	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	provider	Al	7742039808	f	MITRIFYC6018B	\N	2026-02-26 17:46:13.676009	\N	\N	f
32	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	customer	ashu	7742039808	f	MITRIFY0083B2	\N	2026-02-26 17:46:45.03898	\N	\N	f
\.


--
-- Data for Name: promo_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.promo_codes (id, code, owner_id, usage_count, is_active, type, created_at, credit_amount) FROM stdin;
4	FATAQ25D11C	93fd825c-d9b8-440d-8615-32714665081c	1	t	referral	2026-02-20 11:07:14.552451	25
6	FATAQ2E0EBF	37f704d2-8e53-46ed-aeb0-c047ec216d51	0	t	referral	2026-02-20 11:16:26.929915	25
7	FATAQ8CF051	c7e03646-e337-45e6-b973-c3215ba81b3e	0	t	referral	2026-02-20 11:17:25.702234	25
8	FATAQD673A4	f8f6ec86-a916-475c-977b-aa2746f1c9bc	0	t	referral	2026-02-20 11:30:51.350957	25
9	MITRIFYD6FC45	e9c1d6c5-ddf8-4515-82d5-e1cc211124f4	0	t	referral	2026-02-20 18:18:01.571791	25
10	MITRIFYB72115	75a177bc-39fe-4192-9cfe-7f9c9a8c48c5	0	t	referral	2026-02-20 18:29:53.215533	25
11	MITRIFY120920	507b1aa0-6749-4c32-91d6-dfd984ecc802	0	t	referral	2026-02-20 18:48:37.289925	25
12	MITRIFY79FF01	c70a0195-5717-49b6-bcf3-33c3fb0fb23e	0	t	referral	2026-02-20 18:52:25.171339	25
13	MITRIFY7B269E	55014709	0	t	referral	2026-02-20 18:55:40.147819	25
14	MITRIFY93A554	58e0968b-4ce9-4105-88ba-a430c2f0798e	0	t	referral	2026-02-21 16:25:57.111947	25
15	MITRIFY1A0A28	940ce0fe-a32f-4e40-9e34-e3e2374bb1c7	0	t	referral	2026-02-21 16:30:42.642297	25
16	MITRIFYAF7D99	2c439a35-bd16-4389-b5e5-e3ed7e9e7b1d	0	t	referral	2026-02-21 16:41:46.287431	25
17	MITRIFY3F9B45	88025c5d-4490-4a43-a1fe-bc9c84bf66fa	0	t	referral	2026-02-21 16:50:46.830805	25
18	MITRIFY8BCF44	a022c76c-b24c-4a19-87b3-28422ea25d11	0	t	referral	2026-02-21 16:51:28.938837	25
19	MITRIFYFAC1A6	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	0	t	referral	2026-02-23 02:56:21.096879	25
20	MITRIFYF90652	293f4778-1059-4c3e-bb90-03a0a5c49d5d	0	t	referral	2026-02-24 17:12:03.827097	25
21	MITRIFY868A4F	7baac0f3-fff8-408a-bcf8-00a61a3b72e0	0	t	referral	2026-02-24 17:19:25.399638	25
22	MITRIFYA8E63E	b83b99e3-849b-4da9-a23d-fe63413b0322	0	t	referral	2026-02-24 18:24:18.167849	25
23	MITRIFY6D8E5F	c2e1416d-26f3-4253-b7bd-f09a3900ae06	0	t	referral	2026-02-25 12:12:11.402446	25
24	Asheesh%77420	\N	0	t	admin	2026-03-13 12:05:17.820557	25
\.


--
-- Data for Name: promo_usage_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.promo_usage_log (id, promo_code, phone, used_at) FROM stdin;
\.


--
-- Data for Name: providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.providers (id, user_id, service_name, description, hashtags, radius_km, approx_charge, mobile_numbers, latitude, longitude, is_active, created_at, address, profile_photo, is_hidden, state, district, added_by, approved_by) FROM stdin;
11	4c175d96-64ee-47b7-adf6-39f6dbdfa2c7	plumber 	love	{pani,plumber}	10	\N	{7742039808}	\N	\N	t	2026-02-26 17:46:14.020086	\N	\N	f	\N	\N	self	\N
12	93fd825c-d9b8-440d-8615-32714665081c	hai re	kaun hai re	{kon,hai,re}	10	\N	{8888888888}	\N	\N	t	2026-03-21 07:34:41.648544	\N	\N	f	\N	\N	self	\N
\.


--
-- Data for Name: salary_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salary_payments (id, username, entry_count, approve_count, reject_count, call_count, total_actions, rate_per_action, total_amount, cycle_start, cycle_end, paid_by_admin, created_at) FROM stdin;
\.


--
-- Data for Name: search_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.search_log (id, query, count, last_searched) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (sid, sess, expire) FROM stdin;
97tWSQtu58k1qfG-rFBu_ZzCQ_dqkuN2	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-19T18:00:28.344Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-19 18:00:29
ZXWqUYVpuyugF9g0BkSEH_pz0cP-79Lz	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-21T17:43:46.250Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-21 17:43:47
yCQYec1T8T6sJmC_t5yjYEPgfIUCGFtZ	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-22T03:15:38.285Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-22 03:15:39
pSUKL_tLy9rLhrvo85BezheQlGALVkNn	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-22T11:43:52.169Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-22 11:43:53
gwsjjlbX39M63GGUNHugoFcCS9qVbArY	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T11:23:04.057Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 11:23:05
N1xiGL0kNCx4ll9AN3v2421InLLOQknE	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T12:27:27.207Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 12:27:28
gXZVhWlY4FXqOfRb-SntqBatcd7YhNbc	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T17:56:10.185Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 17:56:11
3chrZflzmHWtoWU_lIq2gKLOoInX69Mo	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T19:53:29.678Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 19:53:30
lYyDLYB6PmV3dWryHUYckxKXY5Zx5QuJ	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T20:31:12.304Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 20:35:27
1JuVFHYsKOvFqBhz3JulhPeWBPUWA6-E	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-26T19:44:20.674Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-26 19:44:23
hXJcJeDfN_2Cp5onC-UUGq_n5G9AYuk9	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-24T07:30:10.244Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-24 07:30:11
ZmRN_fx5Taw7-oEsDpxa9GDP772jk0sS	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-24T08:06:07.060Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-24 08:06:08
TvL141K-KP6XB1lE89VrvUn0NMo48egQ	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-24T11:13:32.077Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-24 11:13:33
hU8ypdJNpctjbqaNJfyJfhBznP891nYL	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T04:54:38.182Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 04:54:39
uaskqz1uUlENjTDUi6wgf5mSnieHbWjJ	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-28T15:17:24.177Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-28 15:17:25
4Z4TOShBWcX1Dx_KZT4zCDFadiWSbIRG	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-30T18:28:39.292Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-30 18:28:40
lHKgpEhlJODuSV4PiSCWU4ZB4ax0apSe	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-31T10:01:26.541Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-31 10:01:42
mqjy0Y7Ao0PrBhGSrEQ_voVrdf7Nze2m	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T06:11:35.350Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 06:11:36
DIYtzWEMWvxFLlqsncHVu6hIdz_Ovjmz	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T09:34:49.452Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 09:34:50
tHE0QUpwo9qgUv4Px7Jm1WC4SkcZLuIn	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-29T07:39:09.379Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-29 07:39:10
Py2nRivRiQHVaquBbt8id4f72k6goVhe	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-12T05:07:21.227Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-12 05:07:22
-HomEwGfbHJiOPsY9G-0hCTnHmcEt79U	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-12T10:07:49.129Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-12 10:07:50
gwY6andbZdBbs2jDjFUIWbR8sLoYpdrf	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T12:31:28.372Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "adminAuth": true}	2026-05-23 12:31:38
agYQzHvVxSmL5PJcjXEey34ZLAzx1wwe	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-13T03:59:50.607Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-13 03:59:51
szJz_qOSEhLUPf-umET2gxLHOlg-eGO4	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-13T06:50:26.074Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-13 06:50:27
sMUkiWeWah9z4te64IzDW32sh7s47NM-	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-13T09:54:32.149Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-13 09:54:33
YDHQnisNqleCw2buD-F0Ge3UnFpKBzDO	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-13T20:51:52.745Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-13 20:51:53
qWQyc8hQNb1_fwvTURh6N81f7Q4mEG9A	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-14T05:31:58.799Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-14 05:31:59
uFE3fr4JkwJEJynfDhDmUlTfZFAchIZj	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T18:42:56.047Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-23 18:42:57
EtEq9mt_iX_FqdCY5gBZkXtEobQ4d46c	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-14T18:17:26.806Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-14 18:17:27
PRWGRz81kLs3I5ozeUrrK6cU1SwxfDx_	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-15T09:56:08.143Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-15 09:56:09
gS2t9dMwQkKIRErmALCqXWJn1fhX3iM9	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-16T09:25:53.296Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-16 09:25:54
GHvvO8A1I7W4bwzXRjzDRR8dX-7yZnIh	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-16T17:15:25.717Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-16 17:15:26
CEMqKrac7Pg5d4KeOCA0gMeWqxxO7WPe	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-16T18:08:43.989Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-16 18:08:44
Lk-kAP2y__EEFhIsDeBHvFo-TizTf8Ly	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-19T10:44:12.436Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-19 10:44:13
SKJbRfMYMKeIbvk67xCqp0k5ykGMabzy	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T12:32:53.326Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "adminAuth": true}	2026-05-23 12:32:54
xVtEDEpaitcuvVxHWtHJcA_FnCN_xg2Y	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-24T04:37:18.274Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-24 04:43:04
t8IKtDe5L_4cDe1XMHeFqja4dpyq4UAY	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T05:26:57.638Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 05:26:58
d2vJ80znvGsefaFBgJED3rebR6up4zl_	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T06:08:11.900Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 06:08:12
FwCp33D6F3VBo-Etmt3-uqR-6j6kUvOz	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T06:49:46.230Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 06:49:47
ai-nf1eVdyfyjNAV65ceSE51Gerl_3K2	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T07:38:37.414Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 07:38:38
L5dz8G74ledg1lMpPs3_TlOq_qSfZTTZ	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T09:02:30.585Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 09:02:31
kr-QZXzNcSDBY8kE79OCDYpN6lZcVVVE	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T07:41:49.103Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 07:41:50
faAbStiDPLZduz127VwWumgiGS_IJeEN	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T13:47:59.306Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 13:48:00
TjzTItoZsb9jd1RHKrRnzO0-wDn-GXXE	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-25T19:39:58.592Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-25 19:39:59
E5NmxM1oaVgrD9WRqScdMImF4Y81M1oS	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-26T03:47:40.920Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-26 03:47:41
3fz0Pp8DTWJHSlZAiATydb-whgltyXja	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-26T07:35:46.478Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-26 07:35:47
NxDmKzh2rWiTyACRg8jxOwI0gF9YBx-J	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-27T12:31:59.729Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-27 12:32:00
Ll0ri0juqlrHH7uqlf8LEZMTPKJzI0VX	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T09:18:09.302Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 09:18:10
YoAiVJvj3KUHhjljDNzzZyZqrnysGwld	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-04T13:31:50.106Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-04 13:31:51
OSRfTi3XcZWRvzRQB8Kfu0jUHEwPFUYO	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T04:14:47.102Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 04:14:48
IHt-f45b-l0VTlGyCEhMOODvFBAlY6Ch	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T05:06:02.893Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 05:06:03
P_9ippW6OLaWMvtc293gRHTcc544vjLv	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T09:57:44.756Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 09:57:45
EEoyOGnERvlRSaSu28VZx-TCtqdFrm0H	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T07:35:38.933Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 07:35:39
_6kEyyyESASFhfR5cwtmag_HK8rleefK	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T09:20:16.334Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 09:20:17
Uc6Wsr4dsWfygX04ooMyzi9afCwWNAKx	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T19:28:59.174Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 19:29:00
B6fH6A6VmOV69Lgqzgj-4H_1CswMV5PO	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-11T06:16:16.080Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-11 06:16:17
VcqqCdiJR_4eyI_W3fHn8lk36FoFHu4L	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-11T06:54:10.508Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-11 06:54:11
N1xsZ6XEeL7rpbutDXQ8TW7_JiIRa7fj	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-02T08:16:32.428Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-02 08:16:33
NCo5ZJOBE-z39H2UciXsTwMOy1vaEyUp	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-23T12:33:28.183Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "adminAuth": true}	2026-05-23 12:33:29
ko8Z6UsjT7OjLtiQsnQ-lryl7whSYZD0	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-27T13:05:22.949Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-27 13:08:19
qf9Y3pn8-facRkBhsYLdxtY6pitTpTYe	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-10T08:07:36.117Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-10 08:07:37
o2XDyClk4etN_ZIgeNBxhdKNyc4JT5iH	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-27T19:45:27.993Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-27 19:45:29
3PyU9bHiTBOc6t_zda3Yno8_IFPDGKZ6	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-28T05:06:38.835Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-28 05:06:39
qWNJSSW52h8odvk_VF7pkUyePUyaqwVQ	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-28T14:37:40.311Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-04-28 14:37:41
JViIkMKHWFAm5aGic90ZI_BaaukCh0Dr	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-11T07:35:38.884Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-11 07:35:39
1LdymooEFZULyUisjk1j_1Vp3th1N6Lv	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-13T07:23:28.027Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-13 07:23:29
6ETc6Ny_RYNHaJxu_euZSfmoXQ6KmbFS	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-14T06:09:50.358Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-14 06:09:51
TGlKsO0-bPrAcbOi97POZdnUv4juDXBE	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-16T18:46:33.746Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-16 18:46:34
1X6HB1HkU6jM7TgYYXbaGFngd2bj1AXr	{"cookie": {"path": "/", "secure": false, "expires": "2026-05-19T12:23:35.152Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "visitCounted": true}	2026-05-19 12:23:36
Z_pHkWMHsyFQJYrORflQIU6_14gAIPpI	{"cookie": {"path": "/", "secure": false, "expires": "2026-04-20T07:51:20.521Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 2592000000}, "adminAuth": false, "coAdminId": 3, "coAdminRole": "testadmin", "localUserId": "93fd825c-d9b8-440d-8615-32714665081c", "visitCounted": true, "coAdminUsername": "testadmin1"}	2026-05-19 12:31:34
\.


--
-- Data for Name: site_content; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_content (id, key, value, updated_at) FROM stdin;
1	backup_status	{"history": [{"size": 57799, "emailed": true, "filename": "mitrify-backup-2026-04-23-2030.sql", "gcsError": "GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing", "alertSent": false, "durationMs": 1734, "gcsUploaded": false, "generatedAt": "2026-04-23T20:30:00.010Z"}], "lastError": null, "lastSuccess": {"size": 57799, "emailed": true, "filename": "mitrify-backup-2026-04-23-2030.sql", "gcsError": "GCS not configured — GCS_SERVICE_ACCOUNT_KEY / GCS_BUCKET_NAME missing", "alertSent": false, "durationMs": 1734, "gcsUploaded": false, "generatedAt": "2026-04-23T20:30:00.010Z"}, "lastSuccessAt": "2026-04-23T20:30:00.010Z"}	2026-04-23 20:30:01.746
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscriptions (id, user_id, type, start_date, end_date, payment_id, amount, status) FROM stdin;
1	02e609e4-e817-42cd-a85a-34d8c5c6b8d3	daily	2026-02-20 11:08:45.431355	2026-02-21 23:59:59.999	sim_81f8eda3-b7c3-40af-ab55-78543e107405	1	active
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at) FROM stdin;
55014709	aashishcpmt09@gmail.com	\N	\N	\N	2026-02-20 10:27:31.170547	2026-02-20 10:28:29.693
55052673	aashishcpmt093@gmail.com	\N	\N	\N	2026-02-20 10:24:24.414487	2026-02-21 03:34:10.899
\.


--
-- Data for Name: visitor_stats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.visitor_stats (id, date, count) FROM stdin;
1	2026-03-12	2
3	2026-03-13	6
9	2026-03-14	1
10	2026-03-18	3
13	2026-03-21	4
17	2026-03-22	2
19	2026-03-25	3
22	2026-03-26	7
29	2026-03-27	2
31	2026-03-28	3
34	2026-03-29	3
37	2026-03-30	1
38	2026-04-02	6
44	2026-04-04	1
45	2026-04-10	7
52	2026-04-11	3
55	2026-04-12	2
57	2026-04-13	5
62	2026-04-14	3
65	2026-04-15	1
66	2026-04-16	4
70	2026-04-19	3
73	2026-04-21	1
74	2026-04-22	2
76	2026-04-23	6
82	2026-04-24	1
83	2026-04-26	1
84	2026-04-30	1
85	2026-05-01	1
\.


--
-- Data for Name: _managed_webhooks; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe._managed_webhooks (id, object, url, enabled_events, description, enabled, livemode, metadata, secret, status, api_version, created, updated_at, last_synced_at, account_id) FROM stdin;
we_1T385cPuUdNZYxm3DnWb3etb	webhook_endpoint	https://e6f3862e-662e-4283-94f6-f02568de8aed-00-14z5emt1bdw3t.worf.replit.dev/api/stripe/webhook	["charge.captured", "charge.dispute.closed", "charge.dispute.created", "charge.dispute.funds_reinstated", "charge.dispute.funds_withdrawn", "charge.dispute.updated", "charge.expired", "charge.failed", "charge.pending", "charge.refund.updated", "charge.refunded", "charge.succeeded", "charge.updated", "checkout.session.async_payment_failed", "checkout.session.async_payment_succeeded", "checkout.session.completed", "checkout.session.expired", "credit_note.created", "credit_note.updated", "credit_note.voided", "customer.created", "customer.deleted", "customer.subscription.created", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.pending_update_applied", "customer.subscription.pending_update_expired", "customer.subscription.resumed", "customer.subscription.trial_will_end", "customer.subscription.updated", "customer.tax_id.created", "customer.tax_id.deleted", "customer.tax_id.updated", "customer.updated", "entitlements.active_entitlement_summary.updated", "invoice.created", "invoice.deleted", "invoice.finalization_failed", "invoice.finalized", "invoice.marked_uncollectible", "invoice.paid", "invoice.payment_action_required", "invoice.payment_failed", "invoice.payment_succeeded", "invoice.sent", "invoice.upcoming", "invoice.updated", "invoice.voided", "payment_intent.amount_capturable_updated", "payment_intent.canceled", "payment_intent.created", "payment_intent.partially_funded", "payment_intent.payment_failed", "payment_intent.processing", "payment_intent.requires_action", "payment_intent.succeeded", "payment_method.attached", "payment_method.automatically_updated", "payment_method.card_automatically_updated", "payment_method.detached", "payment_method.updated", "plan.created", "plan.deleted", "plan.updated", "price.created", "price.deleted", "price.updated", "product.created", "product.deleted", "product.updated", "radar.early_fraud_warning.created", "radar.early_fraud_warning.updated", "refund.created", "refund.failed", "refund.updated", "review.closed", "review.opened", "setup_intent.canceled", "setup_intent.created", "setup_intent.requires_action", "setup_intent.setup_failed", "setup_intent.succeeded", "subscription_schedule.aborted", "subscription_schedule.canceled", "subscription_schedule.completed", "subscription_schedule.created", "subscription_schedule.expiring", "subscription_schedule.released", "subscription_schedule.updated"]	\N	\N	f	{"managed_by": "stripe-sync"}	whsec_GAxFDO76jDMdWFle2zdvuDgeyZNIkx3K	enabled	\N	1771649208	2026-02-21 04:46:48.182037+00	2026-02-21 04:46:48.18+00	acct_1T37QHPuUdNZYxm3
\.


--
-- Data for Name: _migrations; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe._migrations (id, name, hash, executed_at) FROM stdin;
0	initial_migration	c18983eedaa79cc2f6d92727d70c4f772256ef3d	2026-02-21 04:46:38.023642
1	products	b99ffc23df668166b94156f438bfa41818d4e80c	2026-02-21 04:46:38.028899
2	customers	33e481247ddc217f4e27ad10dfe5430097981670	2026-02-21 04:46:38.039822
3	prices	7d5ff35640651606cc24cec8a73ff7c02492ecdf	2026-02-21 04:46:38.052812
4	subscriptions	2cc6121a943c2a623c604e5ab12118a57a6c329a	2026-02-21 04:46:38.071774
5	invoices	7fbb4ccb4ed76a830552520739aaa163559771b1	2026-02-21 04:46:38.086214
6	charges	fb284ed969f033f5ce19f479b7a7e27871bddf09	2026-02-21 04:46:38.098709
7	coupons	7ed6ec4133f120675fd7888c0477b6281743fede	2026-02-21 04:46:38.109281
8	disputes	29bdb083725efe84252647f043f5f91cd0dabf43	2026-02-21 04:46:38.119545
9	events	b28cb55b5b69a9f52ef519260210cd76eea3c84e	2026-02-21 04:46:38.128928
10	payouts	69d1050b88bba1024cea4a671f9633ce7bfe25ff	2026-02-21 04:46:38.139115
11	plans	fc1ae945e86d1222a59cbcd3ae7e81a3a282a60c	2026-02-21 04:46:38.15133
12	add_updated_at	1d80945ef050a17a26e35e9983a58178262470f2	2026-02-21 04:46:38.160552
13	add_subscription_items	2aa63409bfe910add833155ad7468cdab844e0f1	2026-02-21 04:46:38.170317
14	migrate_subscription_items	8c2a798b44a8a0d83ede6f50ea7113064ecc1807	2026-02-21 04:46:38.178455
15	add_customer_deleted	6886ddfd8c129d3c4b39b59519f92618b397b395	2026-02-21 04:46:38.183092
16	add_invoice_indexes	d6bb9a09d5bdf580986ed14f55db71227a4d356d	2026-02-21 04:46:38.186751
17	drop_charges_unavailable_columns	61cd5adec4ae2c308d2c33d1b0ed203c7d074d6a	2026-02-21 04:46:38.27994
18	setup_intents	1d45d0fa47fc145f636c9e3c1ea692417fbb870d	2026-02-21 04:46:38.287749
19	payment_methods	705bdb15b50f1a97260b4f243008b8a34d23fb09	2026-02-21 04:46:38.298068
20	disputes_payment_intent_created_idx	18b2cecd7c097a7ea3b3f125f228e8790288d5ca	2026-02-21 04:46:38.308366
21	payment_intent	b1f194ff521b373c4c7cf220c0feadc253ebff0b	2026-02-21 04:46:38.314563
22	adjust_plans	e4eae536b0bc98ee14d78e818003952636ee877c	2026-02-21 04:46:38.329734
23	invoice_deleted	78e864c3146174fee7d08f05226b02d931d5b2ae	2026-02-21 04:46:38.333351
24	subscription_schedules	85fa6adb3815619bb17e1dafb00956ff548f7332	2026-02-21 04:46:38.336913
25	tax_ids	3f9a1163533f9e60a53d61dae5e451ab937584d9	2026-02-21 04:46:38.346388
26	credit_notes	e099b6b04ee607ee868d82af5193373c3fc266d2	2026-02-21 04:46:38.358825
27	add_marketing_features_to_products	6ed1774b0a9606c5937b2385d61057408193e8a7	2026-02-21 04:46:38.374428
28	early_fraud_warning	e615b0b73fa13d3b0508a1956d496d516f0ebf40	2026-02-21 04:46:38.378459
29	reviews	dd3f914139725a7934dc1062de4cc05aece77aea	2026-02-21 04:46:38.392885
30	refunds	f76c4e273eccdc96616424d73967a9bea3baac4e	2026-02-21 04:46:38.409177
31	add_default_price	6d10566a68bc632831fa25332727d8ff842caec5	2026-02-21 04:46:38.424038
32	update_subscription_items	e894858d46840ba4be5ea093cdc150728bd1d66f	2026-02-21 04:46:38.428446
33	add_last_synced_at	43124eb65b18b70c54d57d2b4fcd5dae718a200f	2026-02-21 04:46:38.431823
34	remove_foreign_keys	e72ec19f3232cf6e6b7308ebab80341c2341745f	2026-02-21 04:46:38.438056
35	checkout_sessions	dc294f5bb1a4d613be695160b38a714986800a75	2026-02-21 04:46:38.442527
36	checkout_session_line_items	82c8cfce86d68db63a9fa8de973bfe60c91342dd	2026-02-21 04:46:38.461209
37	add_features	c68a2c2b7e3808eed28c8828b2ffd3a2c9bf2bd4	2026-02-21 04:46:38.476315
38	active_entitlement	5b3858e7a52212b01e7f338cf08e29767ab362af	2026-02-21 04:46:38.488956
39	add_paused_to_subscription_status	09012b5d128f6ba25b0c8f69a1203546cf1c9f10	2026-02-21 04:46:38.507709
40	managed_webhooks	1d453dfd0e27ff0c2de97955c4ec03919af0af7f	2026-02-21 04:46:38.51153
41	rename_managed_webhooks	ad7cd1e4971a50790bf997cd157f3403d294484f	2026-02-21 04:46:38.531973
42	convert_to_jsonb_generated_columns	e0703a0e5cd9d97db53d773ada1983553e37813c	2026-02-21 04:46:38.535569
43	add_account_id	9a6beffdd0972e3657b7118b2c5001be1f815faf	2026-02-21 04:46:42.520492
44	make_account_id_required	05c1e9145220e905e0c1ca5329851acaf7e9e506	2026-02-21 04:46:42.529667
45	sync_status	2f88c4883fa885a6eaa23b8b02da958ca77a1c21	2026-02-21 04:46:42.53868
46	sync_status_per_account	b1f1f3d4fdb4b4cf4e489d4b195c7f0f97f9f27c	2026-02-21 04:46:42.55059
47	api_key_hashes	8046e4c57544b8eae277b057d201a28a4529ffe3	2026-02-21 04:46:42.582368
48	rename_reserved_columns	e32290f655550ed308a7f2dcb5b0114e49a0558e	2026-02-21 04:46:42.586344
49	remove_redundant_underscores_from_metadata_tables	96d6f3a54e17d8e19abd022a030a95a6161bf73e	2026-02-21 04:46:46.737068
50	rename_id_to_match_stripe_api	c5300c5a10081c033dab9961f4e3cd6a2440c2b6	2026-02-21 04:46:46.749668
51	remove_webhook_uuid	289bee08167858dbf4d04ca184f42681660ebb66	2026-02-21 04:46:47.114977
52	webhook_url_uniqueness	d02aec1815ce3a108b8a1def1ff24e865b26db70	2026-02-21 04:46:47.119311
\.


--
-- Data for Name: _sync_status; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe._sync_status (id, resource, status, last_synced_at, last_incremental_cursor, error_message, updated_at, account_id) FROM stdin;
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.accounts (_raw_data, first_synced_at, _last_synced_at, _updated_at, api_key_hashes) FROM stdin;
{"id": "acct_1T37QHPuUdNZYxm3", "type": "standard", "email": null, "object": "account", "country": "US", "settings": {"payouts": {"schedule": {"interval": "daily", "delay_days": 2}, "statement_descriptor": null, "debit_negative_balances": true}, "branding": {"icon": null, "logo": null, "primary_color": null, "secondary_color": null}, "invoices": {"default_account_tax_ids": null, "hosted_payment_method_save": "offer"}, "payments": {"statement_descriptor": null, "statement_descriptor_kana": null, "statement_descriptor_kanji": null}, "dashboard": {"timezone": "Etc/UTC", "display_name": "Service Connect Sandbox"}, "card_issuing": {"tos_acceptance": {"ip": null, "date": null}}, "card_payments": {"statement_descriptor_prefix": null, "statement_descriptor_prefix_kana": null, "statement_descriptor_prefix_kanji": null}, "bacs_debit_payments": {"display_name": null, "service_user_number": null}, "sepa_debit_payments": {}}, "controller": {"type": "account"}, "capabilities": {}, "business_type": null, "charges_enabled": false, "payouts_enabled": false, "business_profile": {"mcc": null, "url": null, "name": null, "support_url": null, "support_email": null, "support_phone": null, "annual_revenue": null, "support_address": null, "estimated_worker_count": null, "minority_owned_business_designation": null}, "default_currency": "usd", "details_submitted": false}	2026-02-21 04:46:47.755221+00	2026-02-21 04:46:47.755221+00	2026-02-21 04:46:47.755221+00	{a5c2f5f139e4d820f0069466ea16305bdd32e1fad5e05d3c2cbd55946f7f0418}
\.


--
-- Data for Name: active_entitlements; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.active_entitlements (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: charges; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.charges (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: checkout_session_line_items; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.checkout_session_line_items (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: checkout_sessions; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.checkout_sessions (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.coupons (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: credit_notes; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.credit_notes (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.customers (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: disputes; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.disputes (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: early_fraud_warnings; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.early_fraud_warnings (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.events (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: features; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.features (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.invoices (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payment_intents; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.payment_intents (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.payment_methods (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payouts; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.payouts (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.plans (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: prices; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.prices (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.products (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: refunds; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.refunds (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.reviews (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: setup_intents; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.setup_intents (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscription_items; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.subscription_items (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscription_schedules; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.subscription_schedules (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.subscriptions (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: tax_ids; Type: TABLE DATA; Schema: stripe; Owner: postgres
--

COPY stripe.tax_ids (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1, true);


--
-- Name: app_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_notifications_id_seq', 1, false);


--
-- Name: calls_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.calls_id_seq', 9, true);


--
-- Name: co_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.co_admins_id_seq', 3, true);


--
-- Name: credit_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.credit_payments_id_seq', 1, false);


--
-- Name: credits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.credits_id_seq', 10, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employees_id_seq', 1, false);


--
-- Name: jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.jobs_id_seq', 1, false);


--
-- Name: local_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.local_users_id_seq', 26, true);


--
-- Name: pending_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pending_providers_id_seq', 1, false);


--
-- Name: profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_id_seq', 34, true);


--
-- Name: promo_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.promo_codes_id_seq', 24, true);


--
-- Name: promo_usage_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.promo_usage_log_id_seq', 1, false);


--
-- Name: providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.providers_id_seq', 12, true);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.salary_payments_id_seq', 1, false);


--
-- Name: search_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.search_log_id_seq', 3, true);


--
-- Name: site_content_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.site_content_id_seq', 1, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 1, true);


--
-- Name: visitor_stats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.visitor_stats_id_seq', 85, true);


--
-- Name: _sync_status_id_seq; Type: SEQUENCE SET; Schema: stripe; Owner: postgres
--

SELECT pg_catalog.setval('stripe._sync_status_id_seq', 1, false);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: app_notifications app_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_pkey PRIMARY KEY (id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: co_admins co_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_admins
    ADD CONSTRAINT co_admins_pkey PRIMARY KEY (id);


--
-- Name: co_admins co_admins_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_admins
    ADD CONSTRAINT co_admins_username_unique UNIQUE (username);


--
-- Name: credit_payments credit_payments_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_order_id_unique UNIQUE (order_id);


--
-- Name: credit_payments credit_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_pkey PRIMARY KEY (id);


--
-- Name: credits credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credits
    ADD CONSTRAINT credits_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: local_users local_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_email_unique UNIQUE (email);


--
-- Name: local_users local_users_phone_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_phone_unique UNIQUE (phone);


--
-- Name: local_users local_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_pkey PRIMARY KEY (id);


--
-- Name: local_users local_users_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_user_id_unique UNIQUE (user_id);


--
-- Name: local_users local_users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_username_unique UNIQUE (username);


--
-- Name: pending_providers pending_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_providers
    ADD CONSTRAINT pending_providers_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_promo_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_promo_code_unique UNIQUE (promo_code);


--
-- Name: promo_codes promo_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_unique UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_usage_log promo_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_usage_log
    ADD CONSTRAINT promo_usage_log_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: providers providers_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_user_id_unique UNIQUE (user_id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: search_log search_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.search_log
    ADD CONSTRAINT search_log_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: site_content site_content_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_key_unique UNIQUE (key);


--
-- Name: site_content site_content_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visitor_stats visitor_stats_date_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.visitor_stats
    ADD CONSTRAINT visitor_stats_date_unique UNIQUE (date);


--
-- Name: visitor_stats visitor_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.visitor_stats
    ADD CONSTRAINT visitor_stats_pkey PRIMARY KEY (id);


--
-- Name: _migrations _migrations_name_key; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._migrations
    ADD CONSTRAINT _migrations_name_key UNIQUE (name);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: _sync_status _sync_status_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT _sync_status_pkey PRIMARY KEY (id);


--
-- Name: _sync_status _sync_status_resource_account_key; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT _sync_status_resource_account_key UNIQUE (resource, account_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: active_entitlements active_entitlements_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.active_entitlements
    ADD CONSTRAINT active_entitlements_pkey PRIMARY KEY (id);


--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.charges
    ADD CONSTRAINT charges_pkey PRIMARY KEY (id);


--
-- Name: checkout_session_line_items checkout_session_line_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.checkout_session_line_items
    ADD CONSTRAINT checkout_session_line_items_pkey PRIMARY KEY (id);


--
-- Name: checkout_sessions checkout_sessions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.checkout_sessions
    ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: early_fraud_warnings early_fraud_warnings_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.early_fraud_warnings
    ADD CONSTRAINT early_fraud_warnings_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: _managed_webhooks managed_webhooks_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT managed_webhooks_pkey PRIMARY KEY (id);


--
-- Name: _managed_webhooks managed_webhooks_url_account_unique; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT managed_webhooks_url_account_unique UNIQUE (url, account_id);


--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: prices prices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.prices
    ADD CONSTRAINT prices_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: setup_intents setup_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.setup_intents
    ADD CONSTRAINT setup_intents_pkey PRIMARY KEY (id);


--
-- Name: subscription_items subscription_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscription_items
    ADD CONSTRAINT subscription_items_pkey PRIMARY KEY (id);


--
-- Name: subscription_schedules subscription_schedules_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscription_schedules
    ADD CONSTRAINT subscription_schedules_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tax_ids tax_ids_pkey; Type: CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.tax_ids
    ADD CONSTRAINT tax_ids_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: credits_user_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX credits_user_role_idx ON public.credits USING btree (user_id, role);


--
-- Name: profiles_user_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX profiles_user_role_idx ON public.profiles USING btree (user_id, role);


--
-- Name: active_entitlements_lookup_key_key; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE UNIQUE INDEX active_entitlements_lookup_key_key ON stripe.active_entitlements USING btree (lookup_key) WHERE (lookup_key IS NOT NULL);


--
-- Name: features_lookup_key_key; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE UNIQUE INDEX features_lookup_key_key ON stripe.features USING btree (lookup_key) WHERE (lookup_key IS NOT NULL);


--
-- Name: idx_accounts_api_key_hashes; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX idx_accounts_api_key_hashes ON stripe.accounts USING gin (api_key_hashes);


--
-- Name: idx_accounts_business_name; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX idx_accounts_business_name ON stripe.accounts USING btree (business_name);


--
-- Name: idx_sync_status_resource_account; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX idx_sync_status_resource_account ON stripe._sync_status USING btree (resource, account_id);


--
-- Name: stripe_active_entitlements_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_active_entitlements_customer_idx ON stripe.active_entitlements USING btree (customer);


--
-- Name: stripe_active_entitlements_feature_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_active_entitlements_feature_idx ON stripe.active_entitlements USING btree (feature);


--
-- Name: stripe_checkout_session_line_items_price_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_session_line_items_price_idx ON stripe.checkout_session_line_items USING btree (price);


--
-- Name: stripe_checkout_session_line_items_session_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_session_line_items_session_idx ON stripe.checkout_session_line_items USING btree (checkout_session);


--
-- Name: stripe_checkout_sessions_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_sessions_customer_idx ON stripe.checkout_sessions USING btree (customer);


--
-- Name: stripe_checkout_sessions_invoice_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_sessions_invoice_idx ON stripe.checkout_sessions USING btree (invoice);


--
-- Name: stripe_checkout_sessions_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_sessions_payment_intent_idx ON stripe.checkout_sessions USING btree (payment_intent);


--
-- Name: stripe_checkout_sessions_subscription_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_checkout_sessions_subscription_idx ON stripe.checkout_sessions USING btree (subscription);


--
-- Name: stripe_credit_notes_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_credit_notes_customer_idx ON stripe.credit_notes USING btree (customer);


--
-- Name: stripe_credit_notes_invoice_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_credit_notes_invoice_idx ON stripe.credit_notes USING btree (invoice);


--
-- Name: stripe_dispute_created_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_dispute_created_idx ON stripe.disputes USING btree (created);


--
-- Name: stripe_early_fraud_warnings_charge_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_early_fraud_warnings_charge_idx ON stripe.early_fraud_warnings USING btree (charge);


--
-- Name: stripe_early_fraud_warnings_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_early_fraud_warnings_payment_intent_idx ON stripe.early_fraud_warnings USING btree (payment_intent);


--
-- Name: stripe_invoices_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_invoices_customer_idx ON stripe.invoices USING btree (customer);


--
-- Name: stripe_invoices_subscription_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_invoices_subscription_idx ON stripe.invoices USING btree (subscription);


--
-- Name: stripe_managed_webhooks_enabled_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_managed_webhooks_enabled_idx ON stripe._managed_webhooks USING btree (enabled);


--
-- Name: stripe_managed_webhooks_status_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_managed_webhooks_status_idx ON stripe._managed_webhooks USING btree (status);


--
-- Name: stripe_payment_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_payment_intents_customer_idx ON stripe.payment_intents USING btree (customer);


--
-- Name: stripe_payment_intents_invoice_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_payment_intents_invoice_idx ON stripe.payment_intents USING btree (invoice);


--
-- Name: stripe_payment_methods_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_payment_methods_customer_idx ON stripe.payment_methods USING btree (customer);


--
-- Name: stripe_refunds_charge_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_refunds_charge_idx ON stripe.refunds USING btree (charge);


--
-- Name: stripe_refunds_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_refunds_payment_intent_idx ON stripe.refunds USING btree (payment_intent);


--
-- Name: stripe_reviews_charge_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_reviews_charge_idx ON stripe.reviews USING btree (charge);


--
-- Name: stripe_reviews_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_reviews_payment_intent_idx ON stripe.reviews USING btree (payment_intent);


--
-- Name: stripe_setup_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_setup_intents_customer_idx ON stripe.setup_intents USING btree (customer);


--
-- Name: stripe_tax_ids_customer_idx; Type: INDEX; Schema: stripe; Owner: postgres
--

CREATE INDEX stripe_tax_ids_customer_idx ON stripe.tax_ids USING btree (customer);


--
-- Name: _managed_webhooks handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe._managed_webhooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_metadata();


--
-- Name: _sync_status handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe._sync_status FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_metadata();


--
-- Name: accounts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: active_entitlements handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.active_entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: charges handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.charges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: checkout_session_line_items handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.checkout_session_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: checkout_sessions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.checkout_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coupons handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: disputes handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: early_fraud_warnings handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.early_fraud_warnings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: events handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: features handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.features FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payouts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.payouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plans handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: refunds handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.refunds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reviews handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscriptions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: active_entitlements fk_active_entitlements_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.active_entitlements
    ADD CONSTRAINT fk_active_entitlements_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: charges fk_charges_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.charges
    ADD CONSTRAINT fk_charges_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: checkout_session_line_items fk_checkout_session_line_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.checkout_session_line_items
    ADD CONSTRAINT fk_checkout_session_line_items_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: checkout_sessions fk_checkout_sessions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.checkout_sessions
    ADD CONSTRAINT fk_checkout_sessions_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: credit_notes fk_credit_notes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.credit_notes
    ADD CONSTRAINT fk_credit_notes_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: customers fk_customers_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.customers
    ADD CONSTRAINT fk_customers_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: disputes fk_disputes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.disputes
    ADD CONSTRAINT fk_disputes_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: early_fraud_warnings fk_early_fraud_warnings_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.early_fraud_warnings
    ADD CONSTRAINT fk_early_fraud_warnings_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: features fk_features_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.features
    ADD CONSTRAINT fk_features_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: invoices fk_invoices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.invoices
    ADD CONSTRAINT fk_invoices_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: _managed_webhooks fk_managed_webhooks_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT fk_managed_webhooks_account FOREIGN KEY (account_id) REFERENCES stripe.accounts(id);


--
-- Name: payment_intents fk_payment_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.payment_intents
    ADD CONSTRAINT fk_payment_intents_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: payment_methods fk_payment_methods_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.payment_methods
    ADD CONSTRAINT fk_payment_methods_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: plans fk_plans_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.plans
    ADD CONSTRAINT fk_plans_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: prices fk_prices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.prices
    ADD CONSTRAINT fk_prices_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: products fk_products_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.products
    ADD CONSTRAINT fk_products_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: refunds fk_refunds_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.refunds
    ADD CONSTRAINT fk_refunds_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: reviews fk_reviews_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.reviews
    ADD CONSTRAINT fk_reviews_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: setup_intents fk_setup_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.setup_intents
    ADD CONSTRAINT fk_setup_intents_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscription_items fk_subscription_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscription_items
    ADD CONSTRAINT fk_subscription_items_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscription_schedules fk_subscription_schedules_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscription_schedules
    ADD CONSTRAINT fk_subscription_schedules_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscriptions fk_subscriptions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.subscriptions
    ADD CONSTRAINT fk_subscriptions_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: _sync_status fk_sync_status_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT fk_sync_status_account FOREIGN KEY (account_id) REFERENCES stripe.accounts(id);


--
-- Name: tax_ids fk_tax_ids_account; Type: FK CONSTRAINT; Schema: stripe; Owner: postgres
--

ALTER TABLE ONLY stripe.tax_ids
    ADD CONSTRAINT fk_tax_ids_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- PostgreSQL database dump complete
--

\unrestrict PijKqMx4Us24XENOvh2dmkdstXdZyIm1FIOEg4DTj2EV0sG6yptqk9dqENs5vBP

