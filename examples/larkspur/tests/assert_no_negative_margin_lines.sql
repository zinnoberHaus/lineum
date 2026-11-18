-- Heavily discounted lines can sell below cost; flag them for review without failing the build.
{{ config(severity='warn', warn_if='>100') }}
select order_line_id, margin_amount
from {{ ref('fct_order_lines') }}
where margin_amount < 0
