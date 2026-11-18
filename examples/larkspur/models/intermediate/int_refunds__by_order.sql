{{ config(materialized='ephemeral') }}

select
    order_id,
    count(*) as refund_count,
    sum(refund_amount) as refund_amount,
    max(refunded_at) as last_refunded_at
from {{ ref('stg_shop__refunds') }}
group by 1
