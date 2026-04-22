-- Mitrify Database Export for Railway
-- Generated: 2026-03-03T22:46:30.735Z
-- STEP 1: Run migrations on Railway PostgreSQL first
-- STEP 2: Then run this file

SET session_replication_role = 'replica';

-- Table: local_users (26 rows)
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (1, '0f979790-8b9a-4e16-8bb1-d583cd9454ad', '9876543210', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T10:51:30.09308') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (2, 'bcbd8ddf-1b91-46ce-ab23-6c9a9e8d7839', NULL, NULL, 'testprovider_WzYhkM', '$2b$10$Cxkoq3q2RDuvb95L38psd.i88xvMR8Q7Hxi4nC9qrwdxYVxyLJ0rK', 'provider', 'password', '2026-02-20T10:52:35.519339') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (3, '93fd825c-d9b8-440d-8615-32714665081c', '8888888888', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T10:54:44.477836') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (4, 'aff7a381-20a9-41cb-9af8-b8d65f96a8fd', '7777700001', NULL, NULL, NULL, 'provider', 'otp', '2026-02-20T11:03:51.771597') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (5, '8d8f39fd-543b-4c4d-ab18-6f4397a26be8', '7777700002', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T11:04:48.89868') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (6, '02e609e4-e817-42cd-a85a-34d8c5c6b8d3', '1111111111', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T11:07:57.772746') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (7, '37f704d2-8e53-46ed-aeb0-c047ec216d51', '9999900001', NULL, NULL, NULL, 'provider', 'otp', '2026-02-20T11:16:20.709253') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (8, 'c7e03646-e337-45e6-b973-c3215ba81b3e', '9999900099', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T11:17:13.869657') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (9, 'f8f6ec86-a916-475c-977b-aa2746f1c9bc', '8888811111', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T11:30:25.854812') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (10, 'e9c1d6c5-ddf8-4515-82d5-e1cc211124f4', '9876500001', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T18:17:40.039104') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (11, '75a177bc-39fe-4192-9cfe-7f9c9a8c48c5', '9876543000', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T18:29:31.551611') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (12, '507b1aa0-6749-4c32-91d6-dfd984ecc802', '0000000000', NULL, 'asheesh', '$2b$10$GGdvBtpsNC3CHFHjRb515OVGbpBZn87bpCO52uzNePzwV0DQgTUgi', 'customer', 'password', '2026-02-20T18:48:10.602456') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (13, 'c70a0195-5717-49b6-bcf3-33c3fb0fb23e', '+917742039808', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T18:52:10.042767') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (14, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', '7742039808', NULL, NULL, NULL, 'customer', 'otp', '2026-02-20T18:56:11.588079') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (15, '8c3f6187-b59a-42bf-92eb-3f55edfdef74', '+919876543210', NULL, 'testuser_otp_1771680216578', '$2b$10$F7CTRBIqgNyrDIjObEz1ceVxpaPWrDLhAO07iMMXJdPKrUj2OCms6', 'customer', 'password', '2026-02-21T13:23:41.505614') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (16, '58e0968b-4ce9-4105-88ba-a430c2f0798e', '+919999988888', NULL, NULL, NULL, 'customer', 'otp', '2026-02-21T16:25:36.254707') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (17, '940ce0fe-a32f-4e40-9e34-e3e2374bb1c7', '+919999911111', NULL, NULL, NULL, 'customer', 'otp', '2026-02-21T16:30:35.775155') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (18, '2c439a35-bd16-4389-b5e5-e3ed7e9e7b1d', '+919999922222', NULL, NULL, NULL, 'customer', 'otp', '2026-02-21T16:41:40.008573') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (19, '88025c5d-4490-4a43-a1fe-bc9c84bf66fa', '+919876500001', NULL, NULL, NULL, 'provider', 'otp', '2026-02-21T16:50:39.448615') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (20, 'a022c76c-b24c-4a19-87b3-28422ea25d11', '+919876500002', NULL, NULL, NULL, 'customer', 'otp', '2026-02-21T16:51:11.927866') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (21, '33de239d-2216-47a9-a3ee-0cc796ac8034', '+919876500099', NULL, NULL, NULL, 'provider', 'otp', '2026-02-21T17:03:42.707972') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (22, '237fb93a-1fd8-48b3-abf4-75f9efab2b61', '+919876500077', NULL, NULL, NULL, 'provider', 'otp', '2026-02-21T17:26:19.736807') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (23, '293f4778-1059-4c3e-bb90-03a0a5c49d5d', NULL, 'ab@bh.com', NULL, NULL, 'customer', 'otp', '2026-02-24T17:11:53.483139') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (24, '7baac0f3-fff8-408a-bcf8-00a61a3b72e0', NULL, 'you@gmai.com', NULL, NULL, 'customer', 'otp', '2026-02-24T17:19:18.231559') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (25, 'b83b99e3-849b-4da9-a23d-fe63413b0322', NULL, 'Aashishcpmt09@gmail.com', NULL, NULL, 'customer', 'otp', '2026-02-24T18:24:06.320455') ON CONFLICT DO NOTHING;
INSERT INTO "local_users" ("id", "user_id", "phone", "email", "username", "password", "role", "auth_method", "created_at") VALUES (26, 'c2e1416d-26f3-4253-b7bd-f09a3900ae06', NULL, 'aashidhcpmt09@gmail.com', 'aashishcpmt09', '$2b$10$fF0SvTptSfe5t.mW0rHh9u93T.HvK4XGzfE/UholQVm9KErq6gmSi', 'customer', 'password', '2026-02-25T12:12:00.470128') ON CONFLICT DO NOTHING;
-- 26 rows inserted

-- Table: profiles (4 rows)
INSERT INTO "profiles" ("id", "user_id", "role", "name", "mobile", "is_blocked", "promo_code", "referred_by", "created_at", "latitude", "longitude") VALUES (29, 'b83b99e3-849b-4da9-a23d-fe63413b0322', 'customer', 'Doctor Aashish Rathore', NULL, FALSE, 'MITRIFYA8E63E', NULL, '2026-02-24T18:24:18.141288', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "profiles" ("id", "user_id", "role", "name", "mobile", "is_blocked", "promo_code", "referred_by", "created_at", "latitude", "longitude") VALUES (30, 'c2e1416d-26f3-4253-b7bd-f09a3900ae06', 'customer', 'aashishcpmt09', NULL, FALSE, 'MITRIFY6D8E5F', NULL, '2026-02-25T12:12:11.376838', 28.007608, 79.14951) ON CONFLICT DO NOTHING;
INSERT INTO "profiles" ("id", "user_id", "role", "name", "mobile", "is_blocked", "promo_code", "referred_by", "created_at", "latitude", "longitude") VALUES (31, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 'provider', 'Al', '7742039808', FALSE, 'MITRIFYC6018B', NULL, '2026-02-26T17:46:13.676009', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "profiles" ("id", "user_id", "role", "name", "mobile", "is_blocked", "promo_code", "referred_by", "created_at", "latitude", "longitude") VALUES (32, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 'customer', 'ashu', '7742039808', FALSE, 'MITRIFY0083B2', NULL, '2026-02-26T17:46:45.03898', NULL, NULL) ON CONFLICT DO NOTHING;
-- 4 rows inserted

-- Table: providers (1 rows)
INSERT INTO "providers" ("id", "user_id", "service_name", "description", "hashtags", "radius_km", "approx_charge", "mobile_numbers", "latitude", "longitude", "is_active", "created_at", "address", "profile_photo") VALUES (11, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 'plumber ', 'love', '["pani","plumber"]', 10, NULL, '["7742039808"]', NULL, NULL, TRUE, '2026-02-26T17:46:14.020086', NULL, NULL) ON CONFLICT DO NOTHING;
-- 1 rows inserted

-- Table: credits (7 rows)
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (1, '02e609e4-e817-42cd-a85a-34d8c5c6b8d3', 'provider', 5, 0, '2026-02-22T15:48:08.565024', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (2, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 'customer', 5, 0, '2026-02-23T02:56:21.937593', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (3, '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 'provider', 5, 0, '2026-02-23T02:57:49.132939', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (4, '293f4778-1059-4c3e-bb90-03a0a5c49d5d', 'customer', 5, 0, '2026-02-24T17:12:05.59814', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (5, '7baac0f3-fff8-408a-bcf8-00a61a3b72e0', 'customer', 5, 0, '2026-02-24T17:19:26.716392', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (6, 'b83b99e3-849b-4da9-a23d-fe63413b0322', 'customer', 0, 0, '2026-02-24T18:24:19.258703', FALSE) ON CONFLICT DO NOTHING;
INSERT INTO "credits" ("id", "user_id", "role", "free_credits", "purchased_credits", "last_free_reset", "credits_frozen") VALUES (7, 'c2e1416d-26f3-4253-b7bd-f09a3900ae06', 'customer', 0, 0, '2026-02-25T12:12:12.26353', FALSE) ON CONFLICT DO NOTHING;
-- 7 rows inserted

-- Table: calls (4 rows)
INSERT INTO "calls" ("id", "customer_id", "provider_id", "timestamp", "duration", "payment_status") VALUES (1, '02e609e4-e817-42cd-a85a-34d8c5c6b8d3', 'aff7a381-20a9-41cb-9af8-b8d65f96a8fd', '2026-02-20T11:08:25.975945', 91, 'free') ON CONFLICT DO NOTHING;
INSERT INTO "calls" ("id", "customer_id", "provider_id", "timestamp", "duration", "payment_status") VALUES (2, '02e609e4-e817-42cd-a85a-34d8c5c6b8d3', '93fd825c-d9b8-440d-8615-32714665081c', '2026-02-20T11:08:47.61492', 173, 'paid') ON CONFLICT DO NOTHING;
INSERT INTO "calls" ("id", "customer_id", "provider_id", "timestamp", "duration", "payment_status") VALUES (3, '02e609e4-e817-42cd-a85a-34d8c5c6b8d3', 'aff7a381-20a9-41cb-9af8-b8d65f96a8fd', '2026-02-20T11:54:52.160312', 62, 'paid') ON CONFLICT DO NOTHING;
INSERT INTO "calls" ("id", "customer_id", "provider_id", "timestamp", "duration", "payment_status") VALUES (4, '55052673', '93fd825c-d9b8-440d-8615-32714665081c', '2026-02-20T18:36:06.593129', 318, 'free') ON CONFLICT DO NOTHING;
-- 4 rows inserted

-- Table: promo_codes (19 rows)
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (4, 'FATAQ25D11C', '93fd825c-d9b8-440d-8615-32714665081c', 1, TRUE, 'referral', '2026-02-20T11:07:14.552451') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (6, 'FATAQ2E0EBF', '37f704d2-8e53-46ed-aeb0-c047ec216d51', 0, TRUE, 'referral', '2026-02-20T11:16:26.929915') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (7, 'FATAQ8CF051', 'c7e03646-e337-45e6-b973-c3215ba81b3e', 0, TRUE, 'referral', '2026-02-20T11:17:25.702234') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (8, 'FATAQD673A4', 'f8f6ec86-a916-475c-977b-aa2746f1c9bc', 0, TRUE, 'referral', '2026-02-20T11:30:51.350957') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (9, 'MITRIFYD6FC45', 'e9c1d6c5-ddf8-4515-82d5-e1cc211124f4', 0, TRUE, 'referral', '2026-02-20T18:18:01.571791') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (10, 'MITRIFYB72115', '75a177bc-39fe-4192-9cfe-7f9c9a8c48c5', 0, TRUE, 'referral', '2026-02-20T18:29:53.215533') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (11, 'MITRIFY120920', '507b1aa0-6749-4c32-91d6-dfd984ecc802', 0, TRUE, 'referral', '2026-02-20T18:48:37.289925') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (12, 'MITRIFY79FF01', 'c70a0195-5717-49b6-bcf3-33c3fb0fb23e', 0, TRUE, 'referral', '2026-02-20T18:52:25.171339') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (13, 'MITRIFY7B269E', '55014709', 0, TRUE, 'referral', '2026-02-20T18:55:40.147819') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (14, 'MITRIFY93A554', '58e0968b-4ce9-4105-88ba-a430c2f0798e', 0, TRUE, 'referral', '2026-02-21T16:25:57.111947') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (15, 'MITRIFY1A0A28', '940ce0fe-a32f-4e40-9e34-e3e2374bb1c7', 0, TRUE, 'referral', '2026-02-21T16:30:42.642297') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (16, 'MITRIFYAF7D99', '2c439a35-bd16-4389-b5e5-e3ed7e9e7b1d', 0, TRUE, 'referral', '2026-02-21T16:41:46.287431') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (17, 'MITRIFY3F9B45', '88025c5d-4490-4a43-a1fe-bc9c84bf66fa', 0, TRUE, 'referral', '2026-02-21T16:50:46.830805') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (18, 'MITRIFY8BCF44', 'a022c76c-b24c-4a19-87b3-28422ea25d11', 0, TRUE, 'referral', '2026-02-21T16:51:28.938837') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (19, 'MITRIFYFAC1A6', '4c175d96-64ee-47b7-adf6-39f6dbdfa2c7', 0, TRUE, 'referral', '2026-02-23T02:56:21.096879') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (20, 'MITRIFYF90652', '293f4778-1059-4c3e-bb90-03a0a5c49d5d', 0, TRUE, 'referral', '2026-02-24T17:12:03.827097') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (21, 'MITRIFY868A4F', '7baac0f3-fff8-408a-bcf8-00a61a3b72e0', 0, TRUE, 'referral', '2026-02-24T17:19:25.399638') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (22, 'MITRIFYA8E63E', 'b83b99e3-849b-4da9-a23d-fe63413b0322', 0, TRUE, 'referral', '2026-02-24T18:24:18.167849') ON CONFLICT DO NOTHING;
INSERT INTO "promo_codes" ("id", "code", "owner_id", "usage_count", "is_active", "type", "created_at") VALUES (23, 'MITRIFY6D8E5F', 'c2e1416d-26f3-4253-b7bd-f09a3900ae06', 0, TRUE, 'referral', '2026-02-25T12:12:11.402446') ON CONFLICT DO NOTHING;
-- 19 rows inserted

-- site_content: empty

SET session_replication_role = 'DEFAULT';
