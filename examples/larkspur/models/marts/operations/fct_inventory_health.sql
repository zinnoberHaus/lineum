with position as (
    select
        snapshot_date,
        category,
        sum(available) as units_available,
        sum(stock_value) as stock_value,
        count(*) filter (where is_stocked_out) as stocked_out_variants,
        count(*) as tracked_variants
    from {{ ref('int_inventory__monthly_position') }}
    group by 1, 2
),

demand as (
    select date_trunc('month', sold_at) as month, products.category, sum(sales.quantity) as units_sold
    from {{ ref('int_sales__unified') }} as sales
    left join {{ ref('stg_shop__variants') }} as variants using (variant_id)
    left join {{ ref('dim_products') }} as products using (product_id)
    group by 1, 2
)

select
    position.snapshot_date,
    position.category,
    position.units_available,
    position.stock_value,
    position.stocked_out_variants,
    round(position.stocked_out_variants / position.tracked_variants, 3) as stockout_rate,
    demand.units_sold,
    round(position.units_available / nullif(demand.units_sold, 0), 1) as months_of_cover
from position
left join demand
    on position.snapshot_date = cast(demand.month as date)
    and position.category = demand.category
