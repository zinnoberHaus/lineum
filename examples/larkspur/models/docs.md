{# Shared column descriptions, referenced from model YAML with {{ doc('name') }}. #}

{% docs accepts_marketing %}
True when the customer opted in to marketing email.
{% enddocs %}

{% docs acquisition_channel %}
Channel group that won the customer's first order.
{% enddocs %}

{% docs active_days %}
Days between the first and latest order.
{% enddocs %}

{% docs active_members %}
Members with an active membership in the month.
{% enddocs %}

{% docs amount %}
Amount, in dollars.
{% enddocs %}

{% docs amount_captured %}
Amount the processor captured, in dollars.
{% enddocs %}

{% docs amount_refunded_by_processor %}
Refunds processed by the payment processor, in dollars.
{% enddocs %}

{% docs anonymous_id %}
Device cookie id for visitors who are not signed in.
{% enddocs %}

{% docs attributed_margin %}
Margin of orders attributed to the channel, in dollars.
{% enddocs %}

{% docs attributed_orders %}
Orders attributed to the channel by last touch.
{% enddocs %}

{% docs attributed_revenue %}
Net revenue of orders attributed to the channel, in dollars.
{% enddocs %}

{% docs available %}
On hand minus reserved units.
{% enddocs %}

{% docs average_csat %}
Average CSAT score of tickets opened in the month.
{% enddocs %}

{% docs average_order_value %}
Revenue divided by orders, in dollars.
{% enddocs %}

{% docs budget %}
Planned campaign budget, in dollars.
{% enddocs %}

{% docs campaign_id %}
Marketing campaign id.
{% enddocs %}

{% docs campaign_name %}
Campaign name, starting with the month it launched.
{% enddocs %}

{% docs cancelled_at %}
When the membership was cancelled, or null while active.
{% enddocs %}

{% docs carrier %}
Shipping carrier.
{% enddocs %}

{% docs category %}
Product category, such as Packs, Shelter or Apparel.
{% enddocs %}

{% docs channel_group %}
Marketing channel from the `channel_groups` seed, such as Paid search or Email.
{% enddocs %}

{% docs charge_attempts %}
Charge attempts, including failures.
{% enddocs %}

{% docs charge_id %}
Payment processor charge id.
{% enddocs %}

{% docs charged_at %}
When the processor attempted the charge.
{% enddocs %}

{% docs city %}
City of the store.
{% enddocs %}

{% docs click_through_rate %}
Clicks divided by impressions.
{% enddocs %}

{% docs clicks %}
Ad clicks.
{% enddocs %}

{% docs club_mrr %}
Trail Club monthly recurring revenue, in dollars.
{% enddocs %}

{% docs cohort_month %}
Month of the customer's first order.
{% enddocs %}

{% docs color %}
Variant colour.
{% enddocs %}

{% docs contact_channel %}
How the customer reached support: email, chat or phone.
{% enddocs %}

{% docs converted_order_id %}
Order the session produced, if any.
{% enddocs %}

{% docs cost_amount %}
Unit cost times quantity, in dollars.
{% enddocs %}

{% docs cost_per_order %}
Spend divided by attributed orders, in dollars.
{% enddocs %}

{% docs country_code %}
ISO 3166 country code of the customer.
{% enddocs %}

{% docs country_name %}
Country name from the `country_codes` seed.
{% enddocs %}

{% docs csat_score %}
Customer satisfaction score from 1 to 5.
{% enddocs %}

{% docs currency %}
ISO currency code of the amounts.
{% enddocs %}

{% docs customer_id %}
Customer id. Joins to `dim_customers`.
{% enddocs %}

{% docs date_day %}
Calendar day.
{% enddocs %}

{% docs day_name %}
Name of the weekday.
{% enddocs %}

{% docs days_in_transit %}
Days from shipping to delivery.
{% enddocs %}

{% docs delivered_at %}
When the carrier delivered the parcel, or null in transit.
{% enddocs %}

{% docs device %}
mobile, desktop or tablet.
{% enddocs %}

{% docs discount_amount %}
Discount applied, in dollars.
{% enddocs %}

{% docs discount_code %}
Discount code used at checkout, or null.
{% enddocs %}

{% docs email_event_id %}
Email event id.
{% enddocs %}

{% docs end_date %}
Last day the campaign ran.
{% enddocs %}

{% docs event_type %}
Kind of event, such as sent, open, click or unsubscribe.
{% enddocs %}

{% docs failed_charges %}
Charge attempts that failed.
{% enddocs %}

{% docs financial_status %}
Payment state: `paid`, `pending`, `refunded` or `partially_refunded`.
{% enddocs %}

{% docs first_name %}
Customer first name. Personal data.
{% enddocs %}

{% docs first_ordered_at %}
When the customer placed their first order.
{% enddocs %}

{% docs fulfillment_status %}
`fulfilled` once the order shipped, otherwise `unfulfilled`.
{% enddocs %}

{% docs full_name %}
First and last name. Personal data.
{% enddocs %}

{% docs gross_amount %}
Quantity times unit price, before discounts, in dollars.
{% enddocs %}

{% docs impressions %}
Times an ad was shown.
{% enddocs %}

{% docs is_active %}
False for archived products.
{% enddocs %}

{% docs is_club_member %}
True for customers with an active Trail Club membership.
{% enddocs %}

{% docs is_satisfied %}
True for a CSAT score of 4 or 5.
{% enddocs %}

{% docs is_stocked_out %}
True when no units are available.
{% enddocs %}

{% docs is_weekend %}
True on Saturday and Sunday.
{% enddocs %}

{% docs landing_page %}
First page of the session.
{% enddocs %}

{% docs last_name %}
Customer last name. Personal data.
{% enddocs %}

{% docs last_ordered_at %}
When the customer placed their latest order.
{% enddocs %}

{% docs launched_at %}
When the product went on sale.
{% enddocs %}

{% docs lifecycle_stage %}
prospect, new, repeat or lapsed.
{% enddocs %}

{% docs lifetime_margin %}
Margin across all orders, in dollars.
{% enddocs %}

{% docs lifetime_net_revenue %}
Net revenue after refunds across all orders, in dollars.
{% enddocs %}

{% docs line_count %}
Number of lines on the order.
{% enddocs %}

{% docs list_price %}
Full price before discounts, in dollars.
{% enddocs %}

{% docs margin %}
Revenue minus product cost, in dollars.
{% enddocs %}

{% docs margin_amount %}
Net amount minus cost, in dollars.
{% enddocs %}

{% docs membership_event_id %}
Membership event id.
{% enddocs %}

{% docs membership_id %}
Trail Club membership id.
{% enddocs %}

{% docs month %}
First day of the month.
{% enddocs %}

{% docs month_start %}
First day of the month.
{% enddocs %}

{% docs monthly_price %}
Price per month, in dollars. Annual plans count one twelfth.
{% enddocs %}

{% docs mrr %}
Monthly recurring revenue, in dollars.
{% enddocs %}

{% docs net_amount %}
Gross amount minus discounts, in dollars. Excludes shipping and tax.
{% enddocs %}

{% docs new_customers %}
Customers whose first order fell in the month.
{% enddocs %}

{% docs objective %}
Campaign goal: acquisition, retention, launch or seasonal.
{% enddocs %}

{% docs occurred_at %}
When the event happened.
{% enddocs %}

{% docs on_hand %}
Units physically in the warehouse.
{% enddocs %}

{% docs opened_at %}
When the ticket was opened.
{% enddocs %}

{% docs opened_on %}
Date the site opened.
{% enddocs %}

{% docs opens %}
Email opens.
{% enddocs %}

{% docs order_count %}
Orders placed, excluding pending orders.
{% enddocs %}

{% docs order_date %}
Date the order was placed (UTC).
{% enddocs %}

{% docs order_id %}
Storefront order id. One order can have many lines, charges and refunds.
{% enddocs %}

{% docs order_line_id %}
Order line id. Primary key of order lines.
{% enddocs %}

{% docs order_number %}
Human-readable order number shown to customers.
{% enddocs %}

{% docs order_total %}
Net amount plus shipping and tax, in dollars.
{% enddocs %}

{% docs ordered_at %}
When the customer placed the order, in UTC.
{% enddocs %}

{% docs orders %}
Number of orders.
{% enddocs %}

{% docs payment_method %}
card, paypal, apple_pay or gift_card.
{% enddocs %}

{% docs payment_refund_id %}
Processor refund id.
{% enddocs %}

{% docs plan %}
Trail Club plan: monthly or annual.
{% enddocs %}

{% docs price %}
Variant price, in dollars.
{% enddocs %}

{% docs priority %}
low, normal, high or urgent.
{% enddocs %}

{% docs processing_fee %}
Fee the processor kept, in dollars.
{% enddocs %}

{% docs processing_fees %}
Processor fees across all charges, in dollars.
{% enddocs %}

{% docs product_id %}
Product id. Joins to `dim_products`.
{% enddocs %}

{% docs product_name %}
Product title as shown in the storefront.
{% enddocs %}

{% docs quantity %}
Units of the variant on the line.
{% enddocs %}

{% docs quarter %}
Calendar quarter, 1 to 4.
{% enddocs %}

{% docs rated_at %}
When the customer rated the ticket.
{% enddocs %}

{% docs rating_id %}
Satisfaction rating id.
{% enddocs %}

{% docs refund_amount %}
Amount refunded, in dollars.
{% enddocs %}

{% docs refund_id %}
Storefront refund id.
{% enddocs %}

{% docs refund_reason %}
Reason the customer gave for the refund.
{% enddocs %}

{% docs refunded_at %}
When the refund was issued.
{% enddocs %}

{% docs refunds %}
Refunded amount, in dollars.
{% enddocs %}

{% docs region %}
Sales or operating region.
{% enddocs %}

{% docs reserved %}
Units reserved for open orders.
{% enddocs %}

{% docs resolution_hours %}
Hours from opening to solving the ticket.
{% enddocs %}

{% docs revenue %}
Revenue after discounts, before refunds, in dollars.
{% enddocs %}

{% docs sale_amount %}
Quantity times unit price, in dollars.
{% enddocs %}

{% docs sale_line_id %}
Line id, prefixed with S for store sales.
{% enddocs %}

{% docs sale_lines %}
Number of sale lines.
{% enddocs %}

{% docs sales_channel %}
Where the order was placed: `web`, `app` or `marketplace`.
{% enddocs %}

{% docs sales_source %}
online for storefront orders, store for retail sales.
{% enddocs %}

{% docs sends %}
Emails sent.
{% enddocs %}

{% docs session_id %}
Web analytics session id.
{% enddocs %}

{% docs shipment_id %}
Shipment id.
{% enddocs %}

{% docs shipped_at %}
When the parcel left the warehouse.
{% enddocs %}

{% docs shipping_amount %}
Shipping charged to the customer, in dollars.
{% enddocs %}

{% docs shipping_cost %}
What the carrier charged Larkspur, in dollars.
{% enddocs %}

{% docs signed_up_at %}
When the customer created an account.
{% enddocs %}

{% docs size %}
Variant size.
{% enddocs %}

{% docs sku %}
Stock keeping unit of the variant.
{% enddocs %}

{% docs snapshot_date %}
Month-start date of the inventory snapshot.
{% enddocs %}

{% docs sold_at %}
When the sale happened.
{% enddocs %}

{% docs solved_at %}
When the ticket was solved, or null while open.
{% enddocs %}

{% docs spend %}
Ad spend, in dollars.
{% enddocs %}

{% docs spend_date %}
Day the spend was incurred.
{% enddocs %}

{% docs square_feet %}
Sales floor area of the store.
{% enddocs %}

{% docs start_date %}
First day the campaign ran.
{% enddocs %}

{% docs started_at %}
When it started.
{% enddocs %}

{% docs status %}
Status reported by the source system.
{% enddocs %}

{% docs stock_value %}
Available units times unit cost, in dollars.
{% enddocs %}

{% docs stocked_out_variants %}
Variants with no available units.
{% enddocs %}

{% docs stockout_rate %}
Share of tracked variants that are stocked out.
{% enddocs %}

{% docs store_id %}
Retail store id.
{% enddocs %}

{% docs store_name %}
Retail store name.
{% enddocs %}

{% docs store_revenue %}
Revenue from retail stores, in dollars.
{% enddocs %}

{% docs store_sale_id %}
In-store sale line id.
{% enddocs %}

{% docs subcategory %}
Product subcategory, such as Daypacks or Tents.
{% enddocs %}

{% docs successful_charges %}
Captured charges.
{% enddocs %}

{% docs tax_amount %}
Sales tax charged, in dollars.
{% enddocs %}

{% docs ticket_id %}
Help desk ticket id.
{% enddocs %}

{% docs ticket_status %}
solved, open or pending.
{% enddocs %}

{% docs unit_cost %}
Landed cost of one unit, in dollars.
{% enddocs %}

{% docs unit_price %}
Price of one unit, in dollars.
{% enddocs %}

{% docs units %}
Units sold.
{% enddocs %}

{% docs units_available %}
Available units across tracked variants.
{% enddocs %}

{% docs units_sold %}
Units sold in the month across online and stores.
{% enddocs %}

{% docs unsubscribes %}
Unsubscribes.
{% enddocs %}

{% docs used_discount %}
True when the order used a discount code.
{% enddocs %}

{% docs utm_medium %}
UTM medium of the campaign or session.
{% enddocs %}

{% docs utm_source %}
UTM source of the campaign or session.
{% enddocs %}

{% docs variant_count %}
Sellable variants of the product.
{% enddocs %}

{% docs variant_id %}
Product variant id (one size and colour of a product).
{% enddocs %}

{% docs vendor %}
Brand that makes the product.
{% enddocs %}

{% docs warehouse_id %}
Distribution centre id.
{% enddocs %}

{% docs warehouse_name %}
Distribution centre name.
{% enddocs %}

{% docs warehouse_region %}
Region of the shipping warehouse.
{% enddocs %}

{% docs week_start %}
Monday of the week.
{% enddocs %}

{% docs weight_grams %}
Shipping weight of one unit, in grams.
{% enddocs %}

{% docs year %}
Calendar year.
{% enddocs %}
