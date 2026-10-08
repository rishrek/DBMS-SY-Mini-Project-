-- Start listening on the channel the live-update triggers write to
-- (database/05_live_updates.sql). From now on PostgreSQL sends this connection
-- every pg_notify('climate_live', ...) message, as soon as its transaction commits.
LISTEN climate_live;
