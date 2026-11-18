select
    spend_date,
    campaign_id,
    impressions,
    clicks,
    {{ cents_to_dollars('spend_cents') }} as spend
from {{ source('marketing', 'ad_spend') }}
