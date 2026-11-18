select
    id as ticket_id,
    customer_id,
    order_id,
    created_at as opened_at,
    solved_at,
    channel as contact_channel,
    category,
    priority,
    status as ticket_status
from {{ source('support', 'tickets') }}
