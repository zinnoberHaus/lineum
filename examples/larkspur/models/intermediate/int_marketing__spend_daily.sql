select
    spend.spend_date,
    spend.campaign_id,
    campaigns.campaign_name,
    groups.channel_group,
    spend.impressions,
    spend.clicks,
    spend.spend
from {{ ref('stg_marketing__ad_spend') }} as spend
inner join {{ ref('stg_marketing__campaigns') }} as campaigns using (campaign_id)
left join {{ ref('channel_groups') }} as groups
    on campaigns.utm_source = groups.utm_source
    and campaigns.utm_medium = groups.utm_medium
