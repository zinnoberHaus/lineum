select
    id as warehouse_id,
    name as warehouse_name,
    region,
    cast(opened_at as date) as opened_on
from {{ source('inventory', 'warehouses') }}
