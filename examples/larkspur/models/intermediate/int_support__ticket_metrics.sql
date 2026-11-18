{{ config(materialized='ephemeral') }}

select
    tickets.ticket_id,
    tickets.customer_id,
    tickets.order_id,
    tickets.opened_at,
    tickets.solved_at,
    tickets.contact_channel,
    tickets.category,
    tickets.priority,
    date_diff('minute', tickets.opened_at, tickets.solved_at) / 60.0 as resolution_hours,
    csat.csat_score,
    csat.is_satisfied
from {{ ref('stg_support__tickets') }} as tickets
left join {{ ref('stg_support__csat') }} as csat using (ticket_id)
