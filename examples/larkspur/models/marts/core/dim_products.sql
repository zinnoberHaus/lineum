select
    products.product_id,
    products.product_name,
    products.category,
    products.subcategory,
    products.unit_cost,
    products.list_price,
    round((products.list_price - products.unit_cost) / products.list_price, 3) as list_margin_rate,
    products.launched_at,
    products.is_active,
    count(variants.variant_id) as variant_count
from {{ ref('stg_shop__products') }} as products
left join {{ ref('stg_shop__variants') }} as variants using (product_id)
group by all
