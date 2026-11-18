select
    id as payment_refund_id,
    charge_id,
    created_at as refunded_at,
    {{ cents_to_dollars('amount_cents') }} as amount,
    status
from {{ source('payments', 'refunds') }}
