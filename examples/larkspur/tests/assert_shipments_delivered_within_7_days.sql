-- Customers are promised delivery within 7 days. Late shipments warn so operations can follow up.
{{ config(severity='warn') }}
select shipment_id, carrier, days_in_transit
from {{ ref('fct_shipments') }}
where days_in_transit > 7
