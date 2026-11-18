select
    store_id,
    store_name,
    city,
    region,
    opened_on,
    square_feet
from {{ ref('stg_pos__stores') }}
