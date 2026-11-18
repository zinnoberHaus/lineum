-- Line-level revenue, cost and margin for storefront orders.
select
    lines.order_line_id,
    lines.order_id,
    lines.variant_id,
    variants.product_id,
    products.category,
    lines.quantity,
    lines.gross_amount,
    lines.discount_amount,
    lines.gross_amount - lines.discount_amount as net_amount,
    products.unit_cost * lines.quantity as cost_amount,
    lines.gross_amount - lines.discount_amount - products.unit_cost * lines.quantity as margin_amount
from {{ ref('stg_shop__order_lines') }} as lines
left join {{ ref('stg_shop__variants') }} as variants using (variant_id)
left join {{ ref('stg_shop__products') }} as products using (product_id)
