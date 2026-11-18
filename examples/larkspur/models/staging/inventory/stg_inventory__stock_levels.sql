select
    snapshot_date,
    warehouse_id,
    variant_id,
    on_hand,
    reserved,
    on_hand - reserved as available
from {{ source('inventory', 'stock_levels') }}
