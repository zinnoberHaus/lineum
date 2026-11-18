select
    customers.customer_id,
    customers.region,
    customers.lifecycle_stage,
    customers.is_club_member,
    cast(date_trunc('month', customers.first_ordered_at) as date) as cohort_month,
    customers.order_count,
    customers.lifetime_net_revenue,
    customers.lifetime_net_revenue / nullif(customers.order_count, 0) as average_order_value,
    date_diff('day', customers.first_ordered_at, customers.last_ordered_at) as active_days,
    first_touch.channel_group as acquisition_channel
from {{ ref('dim_customers') }} as customers
left join (
    select orders.customer_id, attributed.channel_group,
        row_number() over (partition by orders.customer_id order by orders.ordered_at) as touch
    from {{ ref('int_marketing__attributed_orders') }} as attributed
    inner join {{ ref('fct_orders') }} as orders using (order_id)
) as first_touch
    on customers.customer_id = first_touch.customer_id
    and first_touch.touch = 1
where customers.order_count > 0
