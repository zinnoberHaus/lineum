with spend as (
    select
        date_trunc('month', spend_date) as month,
        channel_group,
        sum(spend) as spend
    from {{ ref('fct_marketing_spend') }}
    group by 1, 2
),

attributed as (
    select
        date_trunc('month', orders.ordered_at) as month,
        attributed.channel_group,
        count(*) as attributed_orders,
        sum(attributed.attributed_revenue) as attributed_revenue,
        sum(attributed.attributed_margin) as attributed_margin
    from {{ ref('int_marketing__attributed_orders') }} as attributed
    inner join {{ ref('fct_orders') }} as orders using (order_id)
    group by 1, 2
)

select
    cast(coalesce(attributed.month, spend.month) as date) as month,
    coalesce(attributed.channel_group, spend.channel_group) as channel_group,
    coalesce(spend.spend, 0) as spend,
    coalesce(attributed.attributed_orders, 0) as attributed_orders,
    coalesce(attributed.attributed_revenue, 0) as attributed_revenue,
    round(attributed.attributed_revenue / nullif(spend.spend, 0), 2) as return_on_ad_spend,
    round(spend.spend / nullif(attributed.attributed_orders, 0), 2) as cost_per_order
from attributed
full outer join spend
    on attributed.month = spend.month
    and attributed.channel_group = spend.channel_group
