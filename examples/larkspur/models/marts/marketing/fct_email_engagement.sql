select
    events.campaign_id,
    campaigns.campaign_name,
    count(*) filter (where events.event_type = 'sent') as sends,
    count(*) filter (where events.event_type = 'open') as opens,
    count(*) filter (where events.event_type = 'click') as clicks,
    count(*) filter (where events.event_type = 'unsubscribe') as unsubscribes
from {{ ref('stg_marketing__email_events') }} as events
inner join {{ ref('stg_marketing__campaigns') }} as campaigns using (campaign_id)
group by 1, 2
