select
    customers.customer_id,
    customers.email,
    customers.full_name,
    customers.country_code,
    countries.country_name,
    countries.region,
    customers.signed_up_at,
    customers.accepts_marketing,
    history.first_ordered_at,
    history.last_ordered_at,
    coalesce(history.order_count, 0) as order_count,
    coalesce(history.lifetime_net_revenue, 0) as lifetime_net_revenue,
    case
        when history.order_count is null then 'prospect'
        when history.order_count = 1 then 'new'
        when history.last_ordered_at < timestamp '2026-05-01' then 'lapsed'
        else 'repeat'
    end as lifecycle_stage,
    memberships.membership_id is not null as is_club_member
from {{ ref('stg_shop__customers') }} as customers
left join {{ ref('country_codes') }} as countries using (country_code)
left join {{ ref('int_customers__order_history') }} as history using (customer_id)
left join {{ ref('stg_club__memberships') }} as memberships
    on customers.customer_id = memberships.customer_id
    and memberships.cancelled_at is null
