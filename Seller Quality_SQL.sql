/*
JP Seller Quality Monitoring System - Production Query
==========================================================================
This query tracks the most recent JP marketplace seller quality status for the PREVIOUS WEEK,
calculates streak lengths based on weekly data, and determines appropriate email actions.

The query uses:
- Current Monday's date (current week) as the data reference point (DATE_KPI)
- Previous week (last completed week) as the reporting period

Email notification rules:
- Streak 1: Send First Warning
- Streak 2-3: No Action (silent monitoring)
- Streak 4: Send Last Warning Email
- Streak 5: Send Suspension Notice
- Streak > 5: Excluded from results (already suspended)

STREAK CALCULATION LOGIC:
- Streaks increment only for consecutive weeks with issues
- Any week without issues resets the streak to 0
- If issues occur again after a gap, the streak starts from 1
- Actions are based on the length of the most recent consecutive streak

Final email action considers the most severe action between both dimensions based on the latest data.
*/

-- Tracking start date (Subject to change)
DECLARE start_date DATE DEFAULT DATE '2025-03-10';

-- Calculate the date for the CURRENT week's Monday (data reference point)
DECLARE current_monday DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL (EXTRACT(DAYOFWEEK FROM CURRENT_DATE()) - 2) DAY);

-- Calculate the dates for the PREVIOUS week (reporting period)
DECLARE prev_week_monday DATE DEFAULT DATE_SUB(current_monday, INTERVAL 7 DAY);
DECLARE prev_week_sunday DATE DEFAULT DATE_SUB(current_monday, INTERVAL 1 DAY);

-- Use current_monday as the data reference point for DATE_KPI
DECLARE data_date DATE DEFAULT current_monday;

WITH
  -- Base seller information with the latest DATE_KPI (which will be the current Monday)
  SellerInfo AS (
    SELECT DISTINCT
      h.DATE_KPI,
      h.MARKET,
      h.SELLER_ID,
      s.SELLER_NAME,
      s.SELLER_OWNER_NAME,
      s.SELLER_TIERING,
      s.TYPE_OF_ACTIVITY,
      ROW_NUMBER() OVER (PARTITION BY h.SELLER_ID ORDER BY h.DATE_KPI DESC) AS rn
    FROM
      `manual-queries-prod-230608.legacy_tables.historic_quality_order_management` AS h
      LEFT JOIN `universe-prod-20220914.supply.universe_sellers_and_prospects_markets` AS s
        ON h.SELLER_ID = s.SELLER_ID AND h.MARKET = s.MARKET
    WHERE
      h.MARKET = 'JP'
      AND h.DATE_KPI = data_date -- Use the calculated date variable
  ),

  LatestSellerInfo AS (
    SELECT
      DATE_KPI,
      MARKET,
      SELLER_ID,
      SELLER_NAME,
      SELLER_OWNER_NAME,
      SELLER_TIERING,
      TYPE_OF_ACTIVITY
    FROM SellerInfo
    WHERE rn = 1
  ),

  -- 30-day defective metrics (using the current Monday's DATE_KPI for context)
  Defective30D AS (
    SELECT
      ls.DATE_KPI,
      h.MARKET,
      h.SELLER_ID,
      SUM(h.NB_DEFECTIVE_ISSUE) AS NB_DEFECTIVE_30D,
      SUM(h.NB_ORDERLINE_DELIVERED_30D) AS NB_ORDERLINE_DELIVERED_30D,
      ROUND(
        SUM(h.NB_DEFECTIVE_ISSUE) / NULLIF(SUM(h.NB_ORDERLINE_DELIVERED_30D), 0),
        6
      ) AS DEFECTIVE_RATE_30D
    FROM
      `manual-queries-prod-230608.legacy_tables.historic_quality_order_management` AS h
      INNER JOIN LatestSellerInfo AS ls
        ON h.SELLER_ID = ls.SELLER_ID AND h.MARKET = ls.MARKET AND h.DATE_KPI = ls.DATE_KPI
    WHERE
      h.MARKET = 'JP'
      -- 30-day window ending on the current Monday
      AND h.DATE_KPI BETWEEN DATE_SUB(ls.DATE_KPI, INTERVAL 30 DAY) AND ls.DATE_KPI
    GROUP BY
      1,2,3
  ),

  -- 30-day appearance metrics
  Appearance30D AS (
    SELECT
      ls.DATE_KPI,
      h.MARKET,
      h.SELLER_ID,
      SUM(h.NB_APPEARANCE_ISSUE) AS NB_APPEARANCE_ISSUE_30D,
      SUM(h.NB_ORDERLINE_DELIVERED_30D) AS NB_ORDERLINE_DELIVERED_30D,
      ROUND(
        SUM(h.NB_APPEARANCE_ISSUE) / NULLIF(SUM(h.NB_ORDERLINE_DELIVERED_30D), 0),
        6
      ) AS APPEARANCE_ISSUE_RATE_30D
    FROM
      `manual-queries-prod-230608.legacy_tables.historic_quality_order_management` AS h
      INNER JOIN LatestSellerInfo AS ls
        ON h.SELLER_ID = ls.SELLER_ID AND h.MARKET = ls.MARKET AND h.DATE_KPI = ls.DATE_KPI
    WHERE
      h.MARKET = 'JP'
      -- 30-day window ending on the current Monday
      AND h.DATE_KPI BETWEEN DATE_SUB(ls.DATE_KPI, INTERVAL 30 DAY) AND ls.DATE_KPI
    GROUP BY
      1,2,3
  ),

  -- Current threshold status flags (based on latest 30D data ending on the current Monday)
  CurrentStatus AS (
    SELECT
      ls.SELLER_ID,
      ls.DATE_KPI, -- Include DATE_KPI for joining
      CASE
        WHEN COALESCE(d30.NB_DEFECTIVE_30D, 0) >= 2
            AND COALESCE(d30.DEFECTIVE_RATE_30D, 0) > 0.03 THEN 1
        ELSE 0
      END AS CURRENT_DEFECTIVE_STATUS,
      CASE
        WHEN COALESCE(a30.NB_APPEARANCE_ISSUE_30D, 0) >= 2
            AND COALESCE(a30.APPEARANCE_ISSUE_RATE_30D, 0) > 0.0075 THEN 1
        ELSE 0
      END AS CURRENT_APPEARANCE_STATUS
    FROM
      LatestSellerInfo ls
      LEFT JOIN Defective30D d30 ON ls.SELLER_ID = d30.SELLER_ID AND ls.DATE_KPI = d30.DATE_KPI
      LEFT JOIN Appearance30D a30 ON ls.SELLER_ID = a30.SELLER_ID AND ls.DATE_KPI = a30.DATE_KPI
  ),

  -- Weekly threshold status tracking for the period starting from the declared start date
  WeeklyData AS (
    SELECT
      DATE_KPI,
      SELLER_ID,
      -- Check if *any* day in the week exceeded the appearance threshold
      CASE
        WHEN SUM(NB_APPEARANCE_ISSUE) >= 2
            AND ROUND(SUM(NB_APPEARANCE_ISSUE) / NULLIF(SUM(NB_ORDERLINE_DELIVERED_30D), 0), 6) > 0.0075 THEN 1
        ELSE 0
      END AS HAD_APPEARANCE_ISSUE,
      -- Check if *any* day in the week exceeded the defective threshold
      CASE
        WHEN SUM(NB_DEFECTIVE_ISSUE) >= 2
            AND ROUND(SUM(NB_DEFECTIVE_ISSUE) / NULLIF(SUM(NB_ORDERLINE_DELIVERED_30D), 0), 6) > 0.03 THEN 1
        ELSE 0
      END AS HAD_DEFECTIVE_ISSUE
    FROM
      `manual-queries-prod-230608.legacy_tables.historic_quality_order_management`
    WHERE
      MARKET = 'JP'
      AND DATE_KPI >= start_date -- Use the declared start date
      -- Filter for the relevant period to calculate streaks up to the current week
      AND EXTRACT(DAYOFWEEK FROM DATE_KPI) = 2
    GROUP BY ALL
  ),

  -- Assign week numbers relative to the start date to track progression
  NumberedWeeks AS (
    SELECT
      SELLER_ID,
      DATE_KPI,
      HAD_APPEARANCE_ISSUE,
      HAD_DEFECTIVE_ISSUE,
      -- Number weeks sequentially for each seller
      ROW_NUMBER() OVER (PARTITION BY SELLER_ID ORDER BY DATE_KPI) AS WEEK_NUM_RELATIVE
    FROM
      WeeklyData
  ),

  -- Group consecutive appearance issues
  AppearanceRuns AS (
    SELECT
      SELLER_ID,
      DATE_KPI,
      WEEK_NUM_RELATIVE,
      HAD_APPEARANCE_ISSUE,
      -- Create a group ID that increments only when a '0' (no issue) week occurs
      SUM(CASE WHEN HAD_APPEARANCE_ISSUE = 0 THEN 1 ELSE 0 END)
        OVER (PARTITION BY SELLER_ID ORDER BY DATE_KPI ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS APPEARANCE_GROUP
    FROM
      NumberedWeeks
  ),

  -- Group consecutive defective issues
  DefectiveRuns AS (
    SELECT
      SELLER_ID,
      DATE_KPI,
      WEEK_NUM_RELATIVE,
      HAD_DEFECTIVE_ISSUE,
      -- Create a group ID that increments only when a '0' (no issue) week occurs
      SUM(CASE WHEN HAD_DEFECTIVE_ISSUE = 0 THEN 1 ELSE 0 END)
        OVER (PARTITION BY SELLER_ID ORDER BY DATE_KPI ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS DEFECTIVE_GROUP
    FROM
      NumberedWeeks
  ),

  -- Calculate appearance streak lengths within each group (only for weeks WITH issues)
  AppearanceStreaks AS (
    SELECT
      ar.SELLER_ID,
      ar.DATE_KPI,
      ar.APPEARANCE_GROUP,
      ar.HAD_APPEARANCE_ISSUE,
      -- Calculate streak length within the group
      ROW_NUMBER() OVER (
        PARTITION BY ar.SELLER_ID, ar.APPEARANCE_GROUP
        ORDER BY ar.DATE_KPI
      ) AS STREAK_LENGTH,
      -- Rank weeks by recency for each seller
      ROW_NUMBER() OVER (PARTITION BY ar.SELLER_ID ORDER BY ar.DATE_KPI DESC) AS RECENCY_RANK
    FROM
      AppearanceRuns AS ar
    WHERE
      ar.HAD_APPEARANCE_ISSUE = 1 -- Only count weeks with issues towards the streak
  ),

  -- Calculate defective streak lengths within each group (only for weeks WITH issues)
  DefectiveStreaks AS (
    SELECT
      dr.SELLER_ID,
      dr.DATE_KPI,
      dr.DEFECTIVE_GROUP,
      dr.HAD_DEFECTIVE_ISSUE,
      -- Calculate streak length within the group
      ROW_NUMBER() OVER (
        PARTITION BY dr.SELLER_ID, dr.DEFECTIVE_GROUP
        ORDER BY dr.DATE_KPI
      ) AS STREAK_LENGTH,
      -- Rank weeks by recency for each seller
      ROW_NUMBER() OVER (PARTITION BY dr.SELLER_ID ORDER BY dr.DATE_KPI DESC) AS RECENCY_RANK
    FROM
      DefectiveRuns AS dr
    WHERE
      dr.HAD_DEFECTIVE_ISSUE = 1 -- Only count weeks with issues towards the streak
  ),

  -- Get the most recent appearance streak's length
  LatestAppearanceStreak AS (
    SELECT
      SELLER_ID,
      DATE_KPI,
      STREAK_LENGTH AS LATEST_APPEARANCE_STREAK
    FROM
      AppearanceStreaks
    WHERE
      RECENCY_RANK = 1
     -- No date restriction to match original defective logic
  ),

  -- Get the most recent defective streak's length
  LatestDefectiveStreak AS (
    SELECT
      SELLER_ID,
      DATE_KPI,
      STREAK_LENGTH AS LATEST_DEFECTIVE_STREAK
    FROM
      DefectiveStreaks
    WHERE
      RECENCY_RANK = 1
      -- No date restriction to match original defective logic
  ),

  -- Determine the *effective* streak length, considering the current status
  EffectiveStreaks AS (
    SELECT
      ls.SELLER_ID,
      cs.CURRENT_DEFECTIVE_STATUS,
      cs.CURRENT_APPEARANCE_STATUS,
      COALESCE(lds.LATEST_DEFECTIVE_STREAK, 0) AS HISTORICAL_DEFECTIVE_STREAK,
      COALESCE(las.LATEST_APPEARANCE_STREAK, 0) AS HISTORICAL_APPEARANCE_STREAK,

      -- Calculate effective defective streak
      CASE
        -- If currently failing AND no historical streak exists -> start new streak at 1
        WHEN cs.CURRENT_DEFECTIVE_STATUS = 1 AND
             (lds.DATE_KPI IS NULL) THEN 1
        -- If currently failing AND historical streak exists -> continue streak
        WHEN cs.CURRENT_DEFECTIVE_STATUS = 1 THEN lds.LATEST_DEFECTIVE_STREAK
        -- If not currently failing -> streak is 0
        ELSE 0
      END AS EFFECTIVE_DEFECTIVE_STREAK,

      -- Calculate effective appearance streak (following same logic as defective)
      CASE
        -- If currently failing AND no historical streak exists -> start new streak at 1
        WHEN cs.CURRENT_APPEARANCE_STATUS = 1 AND
             (las.DATE_KPI IS NULL) THEN 1
        -- If currently failing AND historical streak exists -> continue streak
        WHEN cs.CURRENT_APPEARANCE_STATUS = 1 THEN las.LATEST_APPEARANCE_STREAK
        -- If not currently failing -> streak is 0
        ELSE 0
      END AS EFFECTIVE_APPEARANCE_STREAK

    FROM
      LatestSellerInfo AS ls
      INNER JOIN CurrentStatus AS cs ON ls.SELLER_ID = cs.SELLER_ID AND ls.DATE_KPI = cs.DATE_KPI
      LEFT JOIN LatestAppearanceStreak AS las ON TRIM(ls.SELLER_ID) = TRIM(las.SELLER_ID)
      LEFT JOIN LatestDefectiveStreak AS lds ON TRIM(ls.SELLER_ID) = TRIM(lds.SELLER_ID)
  ),

  -- Calculate email actions based on effective streaks
  EmailActions AS (
    SELECT
      es.SELLER_ID,

      -- Defective email action
      CASE
        WHEN es.CURRENT_DEFECTIVE_STATUS = 1 THEN -- Only trigger action if currently failing
          CASE
            WHEN es.EFFECTIVE_DEFECTIVE_STREAK = 1 THEN 'Send First Warning'
            WHEN es.EFFECTIVE_DEFECTIVE_STREAK = 4 THEN 'Send Last Warning'
            WHEN es.EFFECTIVE_DEFECTIVE_STREAK = 5 THEN 'Send Suspension Notice'
            ELSE 'No Action' -- Streaks 2, 3 (or theoretically > 5 if filter removed)
          END
        ELSE 'No Action' -- Not currently failing threshold
      END AS DEFECTIVE_EMAIL_ACTION,

      -- Appearance email action
      CASE
        WHEN es.CURRENT_APPEARANCE_STATUS = 1 THEN -- Only trigger action if currently failing
          CASE
            WHEN es.EFFECTIVE_APPEARANCE_STREAK = 1 THEN 'Send First Warning'
            WHEN es.EFFECTIVE_APPEARANCE_STREAK = 4 THEN 'Send Last Warning'
            WHEN es.EFFECTIVE_APPEARANCE_STREAK = 5 THEN 'Send Suspension Notice'
            ELSE 'No Action' -- Streaks 2, 3 (or theoretically > 5 if filter removed)
          END
        ELSE 'No Action' -- Not currently failing threshold
      END AS APPEARANCE_EMAIL_ACTION,

      -- Determine the single most severe final action needed
      CASE
        -- Priority 1: Suspension Notice (if *either* streak is 5 AND currently failing that metric)
        WHEN (es.EFFECTIVE_DEFECTIVE_STREAK = 5 AND es.CURRENT_DEFECTIVE_STATUS = 1) OR
             (es.EFFECTIVE_APPEARANCE_STREAK = 5 AND es.CURRENT_APPEARANCE_STATUS = 1)
          THEN 'Send Suspension Notice'
        -- Priority 2: Last Warning (if *either* streak is 4 AND currently failing that metric)
        WHEN (es.EFFECTIVE_DEFECTIVE_STREAK = 4 AND es.CURRENT_DEFECTIVE_STATUS = 1) OR
             (es.EFFECTIVE_APPEARANCE_STREAK = 4 AND es.CURRENT_APPEARANCE_STATUS = 1)
          THEN 'Send Last Warning'
        -- Priority 3: First Warning (if *either* streak is 1 AND currently failing that metric)
        WHEN (es.EFFECTIVE_DEFECTIVE_STREAK = 1 AND es.CURRENT_DEFECTIVE_STATUS = 1) OR
             (es.EFFECTIVE_APPEARANCE_STREAK = 1 AND es.CURRENT_APPEARANCE_STATUS = 1)
          THEN 'Send First Warning'
        -- Default: No Action needed
        ELSE 'No Action'
      END AS FINAL_EMAIL_ACTION

    FROM
      EffectiveStreaks es
  ),

  -- Current week number calculation BASED ON START_DATE
  CurrentWeekNumber AS (
    SELECT
      -- Match the previous week numbering scheme
      DATE_DIFF(current_monday, start_date, WEEK(MONDAY)) + 1 AS OVERALL_WEEK_NUM
  )

-- Final selection and formatting
SELECT
  ls.DATE_KPI,
  -- Format time period for the PREVIOUS week (Monday to Sunday) as a single column
  CONCAT(FORMAT_DATE('%Y-%m-%d', prev_week_monday), ' to ', FORMAT_DATE('%Y-%m-%d', prev_week_sunday)) AS TIME_PERIOD,

  -- Format seller ID (remove AP suffix)
  CASE
    WHEN RIGHT(TRIM(ls.SELLER_ID), 2) = 'AP' THEN LEFT(TRIM(ls.SELLER_ID), LENGTH(TRIM(ls.SELLER_ID)) - 2)
    ELSE TRIM(ls.SELLER_ID)
  END AS SELLER_ID,

  -- Seller details
  ls.SELLER_NAME,
  ls.SELLER_OWNER_NAME,
  ls.SELLER_TIERING,
  ls.TYPE_OF_ACTIVITY,

  -- Defective metrics and streak
  COALESCE(d30.DEFECTIVE_RATE_30D, 0) AS DEFECTIVE_RATE_30D,
  COALESCE(d30.NB_DEFECTIVE_30D, 0) AS NB_DEFECTIVE_30D,
  es.EFFECTIVE_DEFECTIVE_STREAK AS CONSECUTIVE_DEFECTIVE_WEEKS,

  -- Defective label (based on current 30D status)
  CASE
    WHEN es.CURRENT_DEFECTIVE_STATUS = 1 AND COALESCE(d30.DEFECTIVE_RATE_30D, 0) > 0.04 THEN 'Critical'
    WHEN es.CURRENT_DEFECTIVE_STATUS = 1 THEN 'Alerting' -- Rate is > 0.03 and >= 2 issues (implied by CURRENT_DEFECTIVE_STATUS = 1)
    WHEN es.HISTORICAL_DEFECTIVE_STREAK > 0 THEN 'Historical' -- Had issues previously, but not currently above threshold
    ELSE ''
  END AS DEFECTIVE_30D_LABEL,

  -- Defective email action
  ea.DEFECTIVE_EMAIL_ACTION,

  -- Appearance metrics and streak
  COALESCE(a30.APPEARANCE_ISSUE_RATE_30D, 0) AS APPEARANCE_ISSUE_RATE_30D,
  COALESCE(a30.NB_APPEARANCE_ISSUE_30D, 0) AS NB_APPEARANCE_ISSUE_30D,
  es.EFFECTIVE_APPEARANCE_STREAK AS CONSECUTIVE_APPEARANCE_WEEKS,

  -- Appearance label (based on current 30D status)
  CASE
    WHEN es.CURRENT_APPEARANCE_STATUS = 1 AND COALESCE(a30.APPEARANCE_ISSUE_RATE_30D, 0) > 0.01 THEN 'Critical'
    WHEN es.CURRENT_APPEARANCE_STATUS = 1 THEN 'Alerting' -- Rate is > 0.0075 and >= 2 issues (implied by CURRENT_APPEARANCE_STATUS = 1)
    WHEN es.HISTORICAL_APPEARANCE_STREAK > 0 THEN 'Historical' -- Had issues previously, but not currently above threshold
    ELSE ''
  END AS APPEARANCE_ISSUE_LABEL,

  -- Appearance email action
  ea.APPEARANCE_EMAIL_ACTION,

  -- Week number based on start_date
  CONCAT('Week ', cw.OVERALL_WEEK_NUM) AS WEEK_NUMBER,

  -- Final combined email action
  ea.FINAL_EMAIL_ACTION,

  -- Seller contact email
  c.EMAIL

FROM
  LatestSellerInfo AS ls
  LEFT JOIN Defective30D AS d30
    ON ls.SELLER_ID = d30.SELLER_ID AND ls.DATE_KPI = d30.DATE_KPI
  LEFT JOIN Appearance30D AS a30
    ON ls.SELLER_ID = a30.SELLER_ID AND ls.DATE_KPI = a30.DATE_KPI
  LEFT JOIN EffectiveStreaks AS es
    ON ls.SELLER_ID = es.SELLER_ID
  LEFT JOIN EmailActions AS ea
    ON ls.SELLER_ID = ea.SELLER_ID
  LEFT JOIN `data-champions-prod-230414.jp_data.jp_sellers_contact` AS c
    ON TRIM(ls.SELLER_ID) = TRIM(c.SELLER_ID)
  CROSS JOIN CurrentWeekNumber AS cw

WHERE TRUE
  -- Include sellers with an active streak in EITHER metric (defective OR appearance)
  -- but exclude any where either streak exceeds 5
  AND (
      (es.EFFECTIVE_DEFECTIVE_STREAK > 0) OR 
      (es.EFFECTIVE_APPEARANCE_STREAK > 0)
  )
  AND es.EFFECTIVE_DEFECTIVE_STREAK <= 5
  AND es.EFFECTIVE_APPEARANCE_STREAK <= 5

ORDER BY
  -- Sort by final email action severity (most severe first)
  CASE
    WHEN ea.FINAL_EMAIL_ACTION = 'Send Suspension Notice' THEN 1
    WHEN ea.FINAL_EMAIL_ACTION = 'Send Last Warning' THEN 2
    WHEN ea.FINAL_EMAIL_ACTION = 'Send First Warning' THEN 3
    ELSE 4 -- 'No Action' (though filtered out by WHERE) or unexpected values
  END,

  -- Then by sellers failing both metrics currently
  es.CURRENT_DEFECTIVE_STATUS + es.CURRENT_APPEARANCE_STATUS DESC,

  -- Then by the highest effective streak between the two metrics
  GREATEST(
    es.EFFECTIVE_DEFECTIVE_STREAK,
    es.EFFECTIVE_APPEARANCE_STREAK
  ) DESC,

  -- Finally by the rates (highest rates first)
  COALESCE(d30.DEFECTIVE_RATE_30D, 0) DESC,
  COALESCE(a30.APPEARANCE_ISSUE_RATE_30D, 0) DESC;
