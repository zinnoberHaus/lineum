select
    id as email_event_id,
    campaign_id,
    customer_id,
    event_type,
    occurred_at
from {{ source('marketing', 'email_events') }}
