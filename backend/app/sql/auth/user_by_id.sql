-- The logged-in user, with their region's name (JOIN to LOCATION: the region
-- name is stored once, in LOCATION, not copied into APP_USER).
SELECT u.user_id,
       u.region_id,
       l.region,
       u.name,
       u.email,
       u.role,
       u.created_at
FROM APP_USER u
JOIN LOCATION l ON l.region_id = u.region_id
WHERE u.user_id = %(user_id)s;
