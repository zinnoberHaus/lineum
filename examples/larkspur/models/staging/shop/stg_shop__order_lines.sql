select
    id as order_line_id,
    order_id,
    variant_id,
    quantity,
    {{ cents_to_dollars('unit_price_cents') }} as unit_price,
    {{ cents_to_dollars('unit_price_cents * quantity') }} as gross_amount,
    {{ cents_to_dollars('discount_cents') }} as discount_amount
from {{ source('shop', 'order_lines') }}
