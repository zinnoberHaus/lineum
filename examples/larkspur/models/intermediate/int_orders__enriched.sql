with line_totals as (
    select
        order_id,
        count(*) as line_count,
        sum(quantity) as units,
        sum(gross_amount) as gross_amount,
        sum(discount_amount) as discount_amount,
        sum(net_amount) as net_amount,
        sum(cost_amount) as cost_amount,
        sum(margin_amount) as margin_amount
    from {{ ref('int_order_lines__margin') }}
    group by 1
)

select
    orders.order_id,
    orders.customer_id,
    orders.order_number,
    orders.ordered_at,
    orders.financial_status,
    orders.sales_channel,
    orders.discount_code,
    line_totals.line_count,
    line_totals.units,
    line_totals.gross_amount,
    line_totals.discount_amount,
    line_totals.net_amount,
    orders.shipping_amount,
    orders.tax_amount,
    line_totals.net_amount + orders.shipping_amount + orders.tax_amount as order_total,
    line_totals.cost_amount,
    line_totals.margin_amount,
    payments.amount_captured,
    payments.processing_fees,
    payments.payment_method,
    coalesce(refunds.refund_amount, 0) as refund_amount,
    shipments.shipping_cost,
    shipments.delivered_at
from {{ ref('stg_shop__orders') }} as orders
left join line_totals using (order_id)
left join {{ ref('int_payments__by_order') }} as payments using (order_id)
left join {{ ref('int_refunds__by_order') }} as refunds using (order_id)
left join {{ ref('stg_inventory__shipments') }} as shipments using (order_id)
