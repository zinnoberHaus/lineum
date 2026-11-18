select
    cast(day as date) as date_day,
    extract(year from day) as year,
    extract(quarter from day) as quarter,
    extract(month from day) as month,
    cast(date_trunc('month', day) as date) as month_start,
    cast(date_trunc('week', day) as date) as week_start,
    dayname(day) as day_name,
    extract(isodow from day) in (6, 7) as is_weekend
from generate_series(timestamp '2023-01-01', timestamp '2026-12-31', interval 1 day) as days(day)
