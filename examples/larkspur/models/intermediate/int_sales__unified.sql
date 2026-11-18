-- Online and in-store sales at a common line grain.
select
    'online' as sales_source,
    cast(lines.order_line_id as varchar) as sale_line_id,
    orders.ordered_at as sold_at,
    orders.customer_id,
    lines.variant_id,
    lines.quantity,
    lines.net_amount as revenue,
    lines.margin_amount as margin,
    cast(null as integer) as store_id
from {{ ref('int_order_lines__margin') }} as lines
inner join {{ ref('stg_shop__orders') }} as orders using (order_id)

union all

select
    'store' as sales_source,
    'S' || cast(sales.store_sale_id as varchar) as sale_line_id,
    sales.sold_at,
    sales.customer_id,
    sales.variant_id,
    sales.quantity,
    sales.sale_amount as revenue,
    sales.sale_amount - products.unit_cost * sales.quantity as margin,
    sales.store_id
from {{ ref('stg_pos__store_sales') }} as sales
left join {{ ref('stg_shop__variants') }} as variants using (variant_id)
left join {{ ref('stg_shop__products') }} as products using (product_id)
