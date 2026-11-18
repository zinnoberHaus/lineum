select
    id as session_id,
    anonymous_id,
    customer_id,
    started_at,
    utm_source,
    utm_medium,
    utm_campaign as campaign_id,
    device,
    landing_page,
    converted_order_id
from {{ source('marketing', 'web_sessions') }}
