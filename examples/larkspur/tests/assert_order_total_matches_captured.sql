-- Paid orders should capture the order total within one cent.
{{ config(severity='warn') }}
select order_id, order_total, amount_captured
from {{ ref('int_orders__enriched') }}
where financial_status = 'paid'
  and abs(order_total - amount_captured) > 0.01
