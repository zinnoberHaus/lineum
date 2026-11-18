select
    id as campaign_id,
    name as campaign_name,
    utm_source,
    utm_medium,
    objective,
    cast(started_at as date) as start_date,
    cast(ended_at as date) as end_date,
    {{ cents_to_dollars('budget_cents') }} as budget
from {{ source('marketing', 'campaigns') }}
