select
    id as refund_id,
    order_id,
    created_at as refunded_at,
    {{ cents_to_dollars('amount_cents') }} as refund_amount,
    reason as refund_reason
from {{ source('shop', 'refunds') }}
