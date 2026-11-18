{% snapshot snap_products %}
{{ config(unique_key='product_id', strategy='check', check_cols=['list_price', 'unit_cost', 'is_active']) }}
select * from {{ ref('stg_shop__products') }}
{% endsnapshot %}
