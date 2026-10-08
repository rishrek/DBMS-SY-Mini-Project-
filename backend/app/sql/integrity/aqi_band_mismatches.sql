-- Stored AQI vs the CPCB bands  (poster Table 4: "Stored Air_Condition vs the CPCB bands")
-- Every reading that has an AQI must fall in EXACTLY one band. For each
-- reading, the correlated subquery counts the bands whose range contains its
-- AQI; any count other than 1 is a mismatch.  Expected: 0 mismatches.
SELECT count(*)                                                         AS readings_checked,
       count(*) FILTER (WHERE (SELECT count(*)
                                 FROM AQI_CATEGORY c
                                WHERE w.aqi BETWEEN c.aqi_min AND c.aqi_max) <> 1) AS mismatches
FROM WEATHER_DATA w
WHERE w.aqi IS NOT NULL;
