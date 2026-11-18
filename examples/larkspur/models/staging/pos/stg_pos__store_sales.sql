select
    id as store_sale_id,
    store_id,
    sold_at,
    variant_id,
    quantity,
    {{ cents_to_dollars('unit_price_cents') }} as unit_price,
    {{ cents_to_dollars('unit_price_cents * quantity') }} as sale_amount,
    customer_id
from {{ source('pos', 'store_sales') }}
