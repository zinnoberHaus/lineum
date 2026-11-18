-- Last-touch attribution: the session that produced the order gets the credit.
select
    sessions.converted_order_id as order_id,
    sessions.session_id,
    sessions.campaign_id,
    coalesce(groups.channel_group, 'Direct') as channel_group,
    sessions.device,
    orders.net_amount as attributed_revenue,
    orders.margin_amount as attributed_margin
from {{ ref('stg_marketing__sessions') }} as sessions
inner join {{ ref('int_orders__enriched') }} as orders
    on sessions.converted_order_id = orders.order_id
left join {{ ref('channel_groups') }} as groups
    on sessions.utm_source = groups.utm_source
    and sessions.utm_medium = groups.utm_medium
