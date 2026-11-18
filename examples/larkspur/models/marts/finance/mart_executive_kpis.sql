with revenue as (
    select
        date_trunc('month', revenue_date) as month,
        sum(revenue) as revenue,
        sum(margin) as margin,
        sum(case when sales_source = 'store' then revenue else 0 end) as store_revenue
    from {{ ref('fct_daily_revenue') }}
    group by 1
),

orders as (
    select
        date_trunc('month', ordered_at) as month,
        count(*) as orders,
        avg(order_total) as average_order_value,
        sum(refund_amount) as refunds
    from {{ ref('fct_orders') }}
    group by 1
),

new_customers as (
    select date_trunc('month', first_ordered_at) as month, count(*) as new_customers
    from {{ ref('dim_customers') }}
    where first_ordered_at is not null
    group by 1
),

club as (
    select date_trunc('month', month) as month, sum(mrr) as club_mrr
    from {{ ref('fct_club_mrr') }}
    group by 1
),

support as (
    select date_trunc('month', opened_at) as month, avg(csat_score) as average_csat
    from {{ ref('fct_support_tickets') }}
    group by 1
)

select
    cast(revenue.month as date) as month,
    revenue.revenue,
    revenue.margin,
    round(revenue.margin / nullif(revenue.revenue, 0), 3) as margin_rate,
    revenue.store_revenue,
    orders.orders,
    orders.average_order_value,
    orders.refunds,
    new_customers.new_customers,
    club.club_mrr,
    support.average_csat
from revenue
left join orders using (month)
left join new_customers using (month)
left join club using (month)
left join support using (month)
