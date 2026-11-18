select
    id as membership_event_id,
    membership_id,
    event_type,
    occurred_at
from {{ source('club', 'membership_events') }}
