select
    charges.order_id,
    count(*) as charge_attempts,
    count(*) filter (where charges.is_successful) as successful_charges,
    sum(case when charges.is_successful then charges.amount else 0 end) as amount_captured,
    sum(charges.processing_fee) as processing_fees,
    coalesce(sum(refunds.amount), 0) as amount_refunded_by_processor,
    max(charges.payment_method) as payment_method
from {{ ref('stg_payments__charges') }} as charges
left join {{ ref('stg_payments__refunds') }} as refunds using (charge_id)
group by 1
