{{ config(contract={'enforced': true}) }}

select
    cast(order_id as integer) as order_id,
    cast(customer_id as integer) as customer_id,
    cast(ordered_at as timestamp) as ordered_at,
    cast(cast(ordered_at as date) as date) as order_date,
    cast(financial_status as varchar) as financial_status,
    cast(sales_channel as varchar) as sales_channel,
    cast(units as bigint) as units,
    cast(net_amount as double) as net_amount,
    cast(order_total as double) as order_total,
    cast(margin_amount as double) as margin_amount,
    cast(refund_amount as double) as refund_amount,
    cast(net_amount - refund_amount as double) as net_revenue,
    cast(discount_code is not null as boolean) as used_discount
from {{ ref('int_orders__enriched') }}
