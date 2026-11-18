select
    shipments.shipment_id,
    shipments.order_id,
    warehouses.warehouse_name,
    warehouses.region as warehouse_region,
    shipments.carrier,
    shipments.shipped_at,
    shipments.delivered_at,
    date_diff('hour', shipments.shipped_at, shipments.delivered_at) / 24.0 as days_in_transit,
    shipments.shipping_cost
from {{ ref('stg_inventory__shipments') }} as shipments
left join {{ ref('stg_inventory__warehouses') }} as warehouses using (warehouse_id)
