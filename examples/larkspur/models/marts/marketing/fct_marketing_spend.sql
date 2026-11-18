select
    spend_date,
    channel_group,
    campaign_id,
    campaign_name,
    sum(impressions) as impressions,
    sum(clicks) as clicks,
    sum(spend) as spend,
    sum(clicks) / nullif(sum(impressions), 0) as click_through_rate
from {{ ref('int_marketing__spend_daily') }}
group by 1, 2, 3, 4
