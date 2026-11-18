select
    id as store_id,
    name as store_name,
    city,
    region,
    cast(opened_at as date) as opened_on,
    square_feet
from {{ source('pos', 'stores') }}
