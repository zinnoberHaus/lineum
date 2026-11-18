select
    customer_id,
    min(ordered_at) as first_ordered_at,
    max(ordered_at) as last_ordered_at,
    count(*) as order_count,
    sum(net_amount - refund_amount) as lifetime_net_revenue,
    sum(margin_amount) as lifetime_margin
from {{ ref('int_orders__enriched') }}
where financial_status != 'pending'
group by 1
