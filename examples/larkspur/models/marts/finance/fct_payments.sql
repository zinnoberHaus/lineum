select
    order_id,
    payment_method,
    charge_attempts,
    successful_charges,
    amount_captured,
    processing_fees,
    amount_refunded_by_processor,
    charge_attempts - successful_charges as failed_charges
from {{ ref('int_payments__by_order') }}
