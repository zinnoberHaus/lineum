select
    month,
    plan,
    count(distinct membership_id) as active_members,
    sum(mrr) as mrr
from {{ ref('int_club__member_months') }}
group by 1, 2
