select
    stock.snapshot_date,
    stock.warehouse_id,
    stock.variant_id,
    variants.product_id,
    products.category,
    stock.on_hand,
    stock.available,
    stock.available * products.unit_cost as stock_value,
    stock.available = 0 as is_stocked_out
from {{ ref('stg_inventory__stock_levels') }} as stock
inner join {{ ref('stg_shop__variants') }} as variants using (variant_id)
inner join {{ ref('stg_shop__products') }} as products using (product_id)
