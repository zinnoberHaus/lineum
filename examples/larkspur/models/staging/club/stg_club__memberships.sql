select
    id as membership_id,
    customer_id,
    plan,
    started_at,
    cancelled_at,
    {{ cents_to_dollars('price_cents') }} as price,
    case when plan = 'annual' then {{ cents_to_dollars('price_cents') }} / 12 else {{ cents_to_dollars('price_cents') }} end as monthly_price
from {{ source('club', 'memberships') }}
