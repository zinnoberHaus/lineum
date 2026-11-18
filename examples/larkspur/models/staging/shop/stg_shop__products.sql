select
    id as product_id,
    title as product_name,
    category,
    subcategory,
    vendor,
    {{ cents_to_dollars('unit_cost_cents') }} as unit_cost,
    {{ cents_to_dollars('list_price_cents') }} as list_price,
    launched_at,
    status = 'active' as is_active
from {{ source('shop', 'products') }}
