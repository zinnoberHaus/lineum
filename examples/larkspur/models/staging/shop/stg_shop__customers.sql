select
    id as customer_id,
    lower(email) as email,
    first_name,
    last_name,
    first_name || ' ' || last_name as full_name,
    upper(country_code) as country_code,
    created_at as signed_up_at,
    accepts_marketing
from {{ source('shop', 'customers') }}
