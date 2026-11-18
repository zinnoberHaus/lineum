select
    id as charge_id,
    order_id,
    created_at as charged_at,
    {{ cents_to_dollars('amount_cents') }} as amount,
    currency,
    status = 'succeeded' as is_successful,
    payment_method,
    {{ cents_to_dollars('fee_cents') }} as processing_fee
from {{ source('payments', 'charges') }}
