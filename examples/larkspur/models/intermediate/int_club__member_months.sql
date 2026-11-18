-- One row per membership per active calendar month.
select
    memberships.membership_id,
    memberships.customer_id,
    memberships.plan,
    cast(month_start as date) as month,
    memberships.monthly_price as mrr
from {{ ref('stg_club__memberships') }} as memberships,
    generate_series(
        date_trunc('month', memberships.started_at),
        date_trunc('month', coalesce(memberships.cancelled_at, timestamp '2026-10-31')),
        interval 1 month
    ) as months(month_start)
