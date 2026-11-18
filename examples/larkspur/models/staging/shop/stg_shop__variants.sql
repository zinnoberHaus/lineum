select
    id as variant_id,
    product_id,
    sku,
    size,
    color,
    {{ cents_to_dollars('price_cents') }} as price,
    weight_grams
from {{ source('shop', 'product_variants') }}
