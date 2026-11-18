select
    cast(sold_at as date) as revenue_date,
    sales_source,
    count(*) as sale_lines,
    sum(quantity) as units,
    sum(revenue) as revenue,
    sum(margin) as margin
from {{ ref('int_sales__unified') }}
group by 1, 2
