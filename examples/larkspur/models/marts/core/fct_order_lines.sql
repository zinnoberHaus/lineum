select
    lines.order_line_id,
    lines.order_id,
    orders.customer_id,
    orders.ordered_at,
    lines.product_id,
    lines.category,
    lines.quantity,
    lines.net_amount,
    lines.margin_amount
from {{ ref('int_order_lines__margin') }} as lines
inner join {{ ref('stg_shop__orders') }} as orders using (order_id)
