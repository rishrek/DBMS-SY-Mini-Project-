-- The CPCB AQI bands (for the AQI badge legend).
SELECT category, aqi_min, aqi_max
FROM AQI_CATEGORY
ORDER BY aqi_min;
