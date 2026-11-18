select
    ticket_id,
    customer_id,
    order_id,
    opened_at,
    solved_at,
    contact_channel,
    category,
    priority,
    resolution_hours,
    resolution_hours <= 24 as solved_within_sla,
    csat_score,
    is_satisfied
from {{ ref('int_support__ticket_metrics') }}
