select
    id as shipment_id,
    order_id,
    warehouse_id,
    shipped_at,
    delivered_at,
    carrier,
    {{ cents_to_dollars('cost_cents') }} as shipping_cost
from {{ source('inventory', 'shipments') }}
