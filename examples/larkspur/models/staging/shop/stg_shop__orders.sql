with source as (
    select * from {{ source('shop', 'orders') }}
),

renamed as (
    select
        id as order_id,
        customer_id,
        order_number,
        created_at as ordered_at,
        financial_status,
        fulfillment_status,
        sales_channel,
        nullif(discount_code, '') as discount_code,
        {{ cents_to_dollars('shipping_cents') }} as shipping_amount,
        {{ cents_to_dollars('tax_cents') }} as tax_amount,
        currency
    from source
)

select * from renamed
