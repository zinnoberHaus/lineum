"""Generate the synthetic raw data for the Larkspur Outfitters example project.

Larkspur Outfitters is a fictional outdoor-gear retailer. Every row here is
generated from a fixed random seed, so two runs produce identical data. The
script writes the raw source tables into a DuckDB file (default: larkspur.duckdb
next to this script); `dbt build` then transforms them.

Usage:
    python generate_data.py [--db PATH]

Requires the `duckdb` Python package (installed with dbt-duckdb).
"""

from __future__ import annotations

import argparse
import csv
import random
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb

SEED = 7
START = datetime(2024, 11, 1)
END = datetime(2026, 11, 1)
DAYS = (END - START).days

rng = random.Random(SEED)


def ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def rand_time(start: datetime = START, end: datetime = END) -> datetime:
    span = int((end - start).total_seconds())
    return start + timedelta(seconds=rng.randrange(span))


def seasonal_time() -> datetime:
    """Order timestamps with growth over time and a November-December peak."""
    while True:
        dt = rand_time()
        growth = 0.55 + 0.45 * ((dt - START).days / DAYS)
        peak = 1.6 if dt.month in (11, 12) else (1.15 if dt.month in (6, 7) else 1.0)
        if rng.random() < growth * peak / 1.6:
            return dt


FIRST = "Ada Ben Cleo Dev Eli Fay Gus Hana Ivo Juno Kai Lena Milo Nia Oren Pia Quin Rae Sol Tess Uma Vik Wren Yara Zane".split()
LAST = "Alder Birch Cedar Dune Ember Fjord Glen Heath Isle Juniper Kestrel Lark Moss North Oak Pine Quarry Ridge Sage Thorn Vale Willow".split()
COUNTRIES = ["US"] * 12 + ["CA"] * 3 + ["GB"] * 2 + ["DE", "FR", "NL", "SE", "NO", "AU", "NZ", "JP"]

CATEGORIES = {
    "Packs": ["Daypacks", "Backpacking packs", "Hip packs"],
    "Shelter": ["Tents", "Tarps", "Bivys"],
    "Sleep": ["Sleeping bags", "Sleeping pads", "Pillows"],
    "Apparel": ["Shells", "Insulation", "Base layers", "Trail pants"],
    "Footwear": ["Trail runners", "Hiking boots", "Camp shoes"],
    "Cook": ["Stoves", "Cookware", "Water filters"],
}
ADJ = "Alpine Basin Canyon Delta Fern Granite Harbor Iron Jasper Kite Larch Mesa Nimbus Orbit Pika Quartz Raven Summit Tundra Umber Vista Wander Yarrow Zenith".split()
COLORS = ["Moss", "Slate", "Rust", "Glacier", "Ink"]
SIZES = {"Apparel": ["S", "M", "L", "XL"], "Footwear": ["8", "9", "10", "11"]}


def write_csv(directory: Path, name: str, header: list[str], rows: list[list[object]]) -> Path:
    path = directory / f"{name}.csv"
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    return path


def generate(directory: Path) -> dict[str, tuple[str, Path]]:
    tables: dict[str, tuple[str, Path]] = {}

    def add(schema: str, name: str, header: list[str], rows: list[list[object]]) -> None:
        tables[f"{schema}.{name}"] = (schema, write_csv(directory, f"{schema}__{name}", header, rows))

    # Customers -----------------------------------------------------------------
    customers = []
    for cid in range(1, 2501):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        created = rand_time(START - timedelta(days=400), END - timedelta(days=5))
        customers.append(
            [cid, f"{first.lower()}.{last.lower()}{cid}@example.com", first, last,
             rng.choice(COUNTRIES), ts(created), rng.random() < 0.62]
        )
    add("raw_shop", "customers",
        ["id", "email", "first_name", "last_name", "country_code", "created_at", "accepts_marketing"],
        customers)

    # Products and variants -----------------------------------------------------
    products, variants = [], []
    pid = vid = 0
    for category, subcategories in CATEGORIES.items():
        for sub in subcategories:
            for _ in range(rng.randint(3, 5)):
                pid += 1
                price = rng.choice([39, 49, 59, 79, 89, 119, 149, 189, 249, 329, 449])
                cost = round(price * rng.uniform(0.38, 0.58), 2)
                launched = rand_time(START - timedelta(days=500), END - timedelta(days=60))
                title = f"{rng.choice(ADJ)} {sub.rstrip('s') if sub.endswith('s') else sub}"
                status = "archived" if rng.random() < 0.08 else "active"
                products.append([pid, title, category, sub, "Larkspur", int(cost * 100), price * 100,
                                 ts(launched), status])
                sizes = SIZES.get(category, ["One size"])
                for color in rng.sample(COLORS, k=rng.randint(1, 3)):
                    for size in sizes:
                        vid += 1
                        variants.append([vid, pid, f"LK-{pid:03d}-{color[:2].upper()}-{size.replace(' ', '')}",
                                         size, color, price * 100, rng.randint(150, 2600)])
    add("raw_shop", "products",
        ["id", "title", "category", "subcategory", "vendor", "unit_cost_cents", "list_price_cents",
         "launched_at", "status"], products)
    add("raw_shop", "product_variants",
        ["id", "product_id", "sku", "size", "color", "price_cents", "weight_grams"], variants)
    variant_price = {v[0]: v[5] for v in variants}

    # Marketing campaigns -------------------------------------------------------
    channels = [("google", "cpc", "paid_search"), ("meta", "paid_social", "paid_social"),
                ("tiktok", "paid_social", "paid_social"), ("newsletter", "email", "email"),
                ("partner", "affiliate", "affiliate"), ("youtube", "display", "display")]
    campaigns = []
    for cid in range(1, 37):
        source, medium, channel = channels[(cid - 1) % len(channels)]
        started = START + timedelta(days=rng.randrange(0, DAYS - 60))
        ended = started + timedelta(days=rng.randint(30, 160))
        objective = rng.choice(["acquisition", "retention", "launch", "seasonal"])
        name = f"{started:%Y-%m} {channel.replace('_', ' ')} {objective}"
        campaigns.append([cid, name, source, medium, ts(started), ts(min(ended, END)),
                          rng.randint(20, 400) * 10000, objective])
    add("raw_marketing", "campaigns",
        ["id", "name", "utm_source", "utm_medium", "started_at", "ended_at", "budget_cents", "objective"],
        campaigns)

    spend = []
    for camp in campaigns:
        started = datetime.strptime(camp[4], "%Y-%m-%d %H:%M:%S")
        ended = datetime.strptime(camp[5], "%Y-%m-%d %H:%M:%S")
        if camp[3] == "email":
            continue
        day = started.date()
        while day < ended.date():
            impressions = rng.randint(4000, 60000)
            clicks = int(impressions * rng.uniform(0.004, 0.03))
            spend.append([day.isoformat(), camp[0], impressions, clicks, int(clicks * rng.uniform(40, 160))])
            day += timedelta(days=1)
    add("raw_marketing", "ad_spend", ["spend_date", "campaign_id", "impressions", "clicks", "spend_cents"], spend)

    # Sessions, orders and lines ------------------------------------------------
    sessions, orders, lines, charges, refunds, pay_refunds, shipments = [], [], [], [], [], [], []
    line_id = charge_id = refund_id = pay_refund_id = shipment_id = 0
    order_count = 9000
    order_times = sorted(seasonal_time() for _ in range(order_count))
    for oid, created in enumerate(order_times, start=1):
        customer = rng.choice(customers)
        campaign = rng.choice(campaigns) if rng.random() < 0.55 else None
        session_id = 100000 + oid
        sessions.append([session_id, f"anon-{rng.getrandbits(40):010x}", customer[0],
                         ts(created - timedelta(minutes=rng.randint(2, 50))),
                         campaign[2] if campaign else rng.choice(["direct", "organic", "referral"]),
                         campaign[3] if campaign else "none", campaign[0] if campaign else None,
                         rng.choice(["mobile", "mobile", "desktop", "tablet"]),
                         rng.choice(["/", "/collections/packs", "/collections/shelter", "/sale", "/journal"]),
                         oid])
        n_lines = rng.choices([1, 2, 3, 4], weights=[52, 28, 14, 6])[0]
        subtotal = 0
        for _ in range(n_lines):
            line_id += 1
            variant = rng.choice(variants)
            qty = rng.choices([1, 2, 3], weights=[84, 13, 3])[0]
            price = variant_price[variant[0]]
            discount = int(price * qty * rng.choice([0, 0, 0, 0.1, 0.15, 0.2]))
            subtotal += price * qty - discount
            lines.append([line_id, oid, variant[0], qty, price, discount])
        shipping = 0 if subtotal >= 9900 else 895
        tax = int(subtotal * 0.07)
        status_roll = rng.random()
        financial = "paid"
        if status_roll < 0.035:
            financial = "refunded"
        elif status_roll < 0.06:
            financial = "partially_refunded"
        elif created > END - timedelta(days=3) and status_roll < 0.2:
            financial = "pending"
        channel = rng.choices(["web", "app", "marketplace"], weights=[68, 24, 8])[0]
        code = rng.choice(["", "", "", "", "TRAIL10", "WELCOME15", "PEAK20"])
        orders.append([oid, customer[0], 1000 + oid, ts(created), financial,
                       "fulfilled" if financial != "pending" else "unfulfilled", channel, code,
                       shipping, tax, "USD"])
        total = subtotal + shipping + tax
        method = rng.choices(["card", "paypal", "apple_pay", "gift_card"], weights=[64, 18, 14, 4])[0]
        if rng.random() < 0.03:
            charge_id += 1
            charges.append([charge_id, oid, ts(created), total, "USD", "failed", method, 0])
        charge_id += 1
        charges.append([charge_id, oid, ts(created + timedelta(seconds=rng.randint(5, 90))), total, "USD",
                        "succeeded", method, int(total * 0.029) + 30])
        if financial in ("refunded", "partially_refunded"):
            refund_id += 1
            amount = total if financial == "refunded" else int(total * rng.uniform(0.2, 0.6))
            when = min(created + timedelta(days=rng.randint(3, 40)), END - timedelta(hours=rng.randint(3, 48)))
            refunds.append([refund_id, oid, ts(when), amount,
                            rng.choice(["damaged", "wrong_size", "not_as_described", "changed_mind"])])
            pay_refund_id += 1
            pay_refunds.append([pay_refund_id, charge_id, ts(when + timedelta(hours=2)), amount, "succeeded"])
        if financial != "pending":
            shipment_id += 1
            shipped = created + timedelta(hours=rng.randint(6, 72))
            delivered = shipped + timedelta(days=rng.randint(1, 8)) if rng.random() < 0.97 else None
            if delivered and delivered >= END:
                delivered = None  # still in transit at the end of the data
            shipments.append([shipment_id, oid, rng.randint(1, 3), ts(shipped),
                              ts(delivered) if delivered else None,
                              rng.choice(["UPS", "USPS", "FedEx", "DHL"]), rng.randint(450, 2200)])
    # Sessions that did not convert.
    for sid in range(1, 22001):
        customer_id = rng.choice(customers)[0] if rng.random() < 0.3 else None
        campaign = rng.choice(campaigns) if rng.random() < 0.6 else None
        sessions.append([sid, f"anon-{rng.getrandbits(40):010x}", customer_id, ts(rand_time()),
                         campaign[2] if campaign else rng.choice(["direct", "organic", "referral"]),
                         campaign[3] if campaign else "none", campaign[0] if campaign else None,
                         rng.choice(["mobile", "mobile", "desktop", "tablet"]),
                         rng.choice(["/", "/collections/packs", "/collections/apparel", "/sale", "/journal"]),
                         None])
    add("raw_shop", "orders",
        ["id", "customer_id", "order_number", "created_at", "financial_status", "fulfillment_status",
         "sales_channel", "discount_code", "shipping_cents", "tax_cents", "currency"], orders)
    add("raw_shop", "order_lines",
        ["id", "order_id", "variant_id", "quantity", "unit_price_cents", "discount_cents"], lines)
    add("raw_shop", "refunds", ["id", "order_id", "created_at", "amount_cents", "reason"], refunds)
    add("raw_marketing", "web_sessions",
        ["id", "anonymous_id", "customer_id", "started_at", "utm_source", "utm_medium", "utm_campaign",
         "device", "landing_page", "converted_order_id"], sessions)
    add("raw_payments", "charges",
        ["id", "order_id", "created_at", "amount_cents", "currency", "status", "payment_method", "fee_cents"],
        charges)
    add("raw_payments", "refunds", ["id", "charge_id", "created_at", "amount_cents", "status"], pay_refunds)
    add("raw_inventory", "shipments",
        ["id", "order_id", "warehouse_id", "shipped_at", "delivered_at", "carrier", "cost_cents"], shipments)

    # Email events --------------------------------------------------------------
    email_campaigns = [c for c in campaigns if c[3] == "email"]
    events, eid = [], 0
    for camp in email_campaigns:
        started = datetime.strptime(camp[4], "%Y-%m-%d %H:%M:%S")
        for customer in rng.sample(customers, k=900):
            if not customer[6]:
                continue
            eid += 1
            sent = started + timedelta(hours=rng.randint(0, 48))
            events.append([eid, camp[0], customer[0], "sent", ts(sent)])
            if rng.random() < 0.38:
                eid += 1
                events.append([eid, camp[0], customer[0], "open", ts(sent + timedelta(hours=rng.randint(1, 30)))])
                if rng.random() < 0.22:
                    eid += 1
                    events.append([eid, camp[0], customer[0], "click", ts(sent + timedelta(hours=rng.randint(2, 40)))])
            if rng.random() < 0.006:
                eid += 1
                events.append([eid, camp[0], customer[0], "unsubscribe", ts(sent + timedelta(days=1))])
    add("raw_marketing", "email_events", ["id", "campaign_id", "customer_id", "event_type", "occurred_at"], events)

    # Support -------------------------------------------------------------------
    tickets, ratings, rid = [], [], 0
    for tid in range(1, 1401):
        order = rng.choice(orders)
        created = datetime.strptime(order[3], "%Y-%m-%d %H:%M:%S") + timedelta(days=rng.randint(1, 30))
        if created >= END:
            created = END - timedelta(hours=rng.randint(1, 72))
        solved = created + timedelta(hours=rng.choice([1, 2, 4, 8, 20, 30, 50, 90])) if rng.random() < 0.94 else None
        if solved and solved >= END:
            solved = None
        category = rng.choices(["shipping", "returns", "product", "billing"], weights=[40, 27, 23, 10])[0]
        tickets.append([tid, order[1], order[0], ts(created), ts(solved) if solved else None,
                        rng.choice(["email", "chat", "chat", "phone"]), category,
                        rng.choices(["low", "normal", "high", "urgent"], weights=[20, 55, 20, 5])[0],
                        "solved" if solved else rng.choice(["open", "pending"])])
        if solved and rng.random() < 0.6:
            rid += 1
            score = rng.choices([1, 2, 3, 4, 5], weights=[5, 6, 12, 32, 45])[0]
            ratings.append([rid, tid, ts(solved + timedelta(hours=rng.randint(1, 48))), score])
    add("raw_support", "tickets",
        ["id", "customer_id", "order_id", "created_at", "solved_at", "channel", "category", "priority", "status"],
        tickets)
    add("raw_support", "satisfaction_ratings", ["id", "ticket_id", "rated_at", "score"], ratings)

    # Inventory -----------------------------------------------------------------
    warehouses = [[1, "Reno DC", "us-west", "2019-03-01"], [2, "Columbus DC", "us-east", "2020-08-15"],
                  [3, "Rotterdam DC", "eu-west", "2023-04-01"]]
    add("raw_inventory", "warehouses", ["id", "name", "region", "opened_at"], warehouses)
    stock = []
    month = date(2024, 11, 1)
    while month < END.date():
        for wh in warehouses:
            for variant in variants:
                on_hand = max(0, int(rng.gauss(48, 30)))
                stock.append([month.isoformat(), wh[0], variant[0], on_hand, min(on_hand, rng.randint(0, 9))])
        month = date(month.year + (month.month // 12), month.month % 12 + 1, 1)
    add("raw_inventory", "stock_levels", ["snapshot_date", "warehouse_id", "variant_id", "on_hand", "reserved"], stock)

    # Retail stores -------------------------------------------------------------
    stores = [[1, "Larkspur Boulder", "Boulder", "us-west", "2021-05-01", 6200],
              [2, "Larkspur Bend", "Bend", "us-west", "2022-04-12", 4800],
              [3, "Larkspur Asheville", "Asheville", "us-east", "2023-09-30", 5100],
              [4, "Larkspur Burlington", "Burlington", "us-east", "2025-03-14", 4300],
              [5, "Larkspur Amsterdam", "Amsterdam", "eu-west", "2025-10-01", 3900]]
    add("raw_pos", "stores", ["id", "name", "city", "region", "opened_at", "square_feet"], stores)
    store_sales = []
    for sid in range(1, 15001):
        store = rng.choice(stores)
        opened = datetime.strptime(store[4], "%Y-%m-%d")
        sold = rand_time(max(opened, START), END)
        variant = rng.choice(variants)
        customer_id = rng.choice(customers)[0] if rng.random() < 0.35 else None
        store_sales.append([sid, store[0], ts(sold), variant[0], rng.choice([1, 1, 1, 2]),
                            variant_price[variant[0]], customer_id])
    add("raw_pos", "store_sales",
        ["id", "store_id", "sold_at", "variant_id", "quantity", "unit_price_cents", "customer_id"], store_sales)

    # Trail Club memberships ----------------------------------------------------
    memberships, member_events, evid = [], [], 0
    for mid, customer in enumerate(rng.sample(customers, k=720), start=1):
        plan = rng.choices(["monthly", "annual"], weights=[70, 30])[0]
        started = rand_time(START, END - timedelta(days=10))
        cancelled = None
        if rng.random() < 0.34:
            cancelled = started + timedelta(days=rng.randint(30, 400))
            if cancelled >= END:
                cancelled = None
        price = 900 if plan == "monthly" else 8900
        memberships.append([mid, customer[0], plan, ts(started), ts(cancelled) if cancelled else None, price])
        evid += 1
        member_events.append([evid, mid, "start", ts(started)])
        step = timedelta(days=30 if plan == "monthly" else 365)
        renew = started + step
        stop = cancelled or END
        while renew < stop:
            evid += 1
            member_events.append([evid, mid, "renew", ts(renew)])
            renew += step
        if cancelled:
            evid += 1
            member_events.append([evid, mid, "cancel", ts(cancelled)])
    add("raw_club", "memberships", ["id", "customer_id", "plan", "started_at", "cancelled_at", "price_cents"],
        memberships)
    add("raw_club", "membership_events", ["id", "membership_id", "event_type", "occurred_at"], member_events)
    return tables


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", default=str(Path(__file__).with_name("larkspur.duckdb")))
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        tables = generate(Path(tmp))
        con = duckdb.connect(args.db)
        for qualified, (schema, path) in tables.items():
            con.execute(f"create schema if not exists {schema}")
            con.execute(f"create or replace table {qualified} as select * from read_csv('{path}', header = true, auto_detect = true)")
            count = con.execute(f"select count(*) from {qualified}").fetchone()[0]
            print(f"{qualified:<34} {count:>7} rows")
        # Source freshness needs a recent load timestamp: stamp every raw table.
        con.execute("create schema if not exists raw_meta")
        con.execute(
            "create or replace table raw_meta.loads as select * from (values "
            + ", ".join(f"('{q}', timestamp '{ts(END - timedelta(hours=i + 1))}')" for i, q in enumerate(tables))
            + ") as t(table_name, loaded_at)"
        )
        con.close()
    print(f"Wrote {args.db}")


if __name__ == "__main__":
    main()
