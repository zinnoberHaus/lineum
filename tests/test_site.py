import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path

from lineum import __version__
from lineum.build import build_site
from lineum.cli import EXIT_CHECK_FAILED, EXIT_ERROR, main
from lineum.config import Config, ConfigError
from lineum.config import load as load_config
from lineum.site import SiteError
from tests import fixtures

EXAMPLE = Path(__file__).resolve().parent.parent / "examples" / "larkspur"


def read_payload(site: Path) -> dict:
    text = (site / "assets" / "data.js").read_text()
    match = re.fullmatch(r"window\.__LINEUM__=(.*);\n", text, re.S)
    assert match, "data.js must assign window.__LINEUM__"
    return json.loads(match.group(1))


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(list(argv))
    return code, out.getvalue(), err.getvalue()


class SiteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        fixtures.write_project(self.root / "project")
        self.out = self.root / "site"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def build(self, **config) -> None:
        build_site(self.root / "project", self.out, Config(**config))

    def test_writes_every_page_and_asset(self) -> None:
        self.build(base_url="https://docs.example.com")
        for name in ("index.html", "lineage.html", "health.html", "analyze.html", "404.html", "robots.txt",
                     "sitemap.xml", "llms.txt", "llms-full.txt", "assets/lineum.js", "assets/lineum.css",
                     "assets/data.js", "model/shop/fct_orders.html", "source/shop/raw/orders.html",
                     "exposure/shop/finance_dashboard.html"):
            self.assertTrue((self.out / name).exists(), name)
        payload = read_payload(self.out)
        self.assertEqual(payload["schema"], "lineum/1")
        self.assertEqual(payload["meta"]["lineumVersion"], __version__)
        self.assertEqual(len(payload["nodes"]), 12)
        self.assertTrue(payload["columnEdges"])

    def test_pages_are_server_rendered_for_search_engines(self) -> None:
        self.build(base_url="https://docs.example.com/")
        page = (self.out / "model/shop/fct_orders.html").read_text()
        self.assertIn("<title>fct_orders · Model · Shop</title>", page)
        self.assertIn('<link rel="canonical" href="https://docs.example.com/model/shop/fct_orders.html">', page)
        self.assertIn('"@type":"Dataset"', page)
        self.assertIn("<th scope=\"row\"><code>balance</code></th>", page)
        self.assertIn('href="../../model/shop/stg_orders.html"', page)
        self.assertIn('src="../../assets/lineum.js"', page)
        sitemap = (self.out / "sitemap.xml").read_text()
        self.assertIn("<loc>https://docs.example.com/model/shop/fct_orders.html</loc>", sitemap)
        self.assertIn("Sitemap: https://docs.example.com/sitemap.xml", (self.out / "robots.txt").read_text())
        self.assertIn("[fct_orders](https://docs.example.com/model/shop/fct_orders.html)", (self.out / "llms.txt").read_text())

    def test_descriptions_cannot_inject_script(self) -> None:
        self.build()
        page = (self.out / "model/shop/fct_orders.html").read_text()
        self.assertNotIn("<script>alert(1)</script>", page)
        payload = read_payload(self.out)
        facts = next(n for n in payload["nodes"] if n["name"] == "fct_orders")
        self.assertNotIn("<script>", facts["html"])

    def test_noindex_and_no_sql(self) -> None:
        self.build(noindex=True, include_sql=False)
        self.assertIn("Disallow: /", (self.out / "robots.txt").read_text())
        self.assertIn('content="noindex, nofollow"', (self.out / "index.html").read_text())
        self.assertFalse((self.out / "sitemap.xml").exists())
        payload = read_payload(self.out)
        self.assertFalse(any("sql" in n for n in payload["nodes"]))

    def test_never_deletes_a_directory_it_did_not_create(self) -> None:
        self.out.mkdir()
        (self.out / "keep.txt").write_text("mine")
        with self.assertRaises(SiteError):
            self.build()
        self.assertTrue((self.out / "keep.txt").exists())

    def test_rebuilds_its_own_directory(self) -> None:
        self.build()
        (self.out / "stale.html").write_text("old")
        self.build()
        self.assertFalse((self.out / "stale.html").exists())


class ConfigTest(unittest.TestCase):
    def test_reads_lineum_yml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "lineum.yml").write_text(
                "title: Docs\nlayers:\n  marts: ['rpt_*']\nqueries:\n  - title: Count\n    sql: select 1\n"
                "data:\n  duckdb: wh.duckdb\n"
            )
            config = load_config(Path(tmp))
            self.assertEqual(config.title, "Docs")
            self.assertEqual(config.layers, {"marts": ["rpt_*"]})
            self.assertEqual(config.queries, [{"title": "Count", "sql": "select 1"}])
            self.assertTrue(config.data_duckdb.endswith("wh.duckdb"))

    def test_rejects_unknown_settings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "lineum.yml").write_text("titel: typo\n")
            with self.assertRaisesRegex(ConfigError, "titel"):
                load_config(Path(tmp))


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.project = fixtures.write_project(Path(self.tmp.name) / "project")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_version_and_help(self) -> None:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as exit_:
            main(["--version"])
        self.assertEqual(exit_.exception.code, 0)
        self.assertEqual(out.getvalue().strip(), f"lineum {__version__}")
        code, text, _ = run()
        self.assertEqual(code, 0)
        self.assertIn("usage: lineum", text)

    def test_build_defaults_to_target_lineum(self) -> None:
        code, text, _ = run("build", str(self.project))
        self.assertEqual(code, 0, text)
        self.assertTrue((self.project / "target" / "lineum" / "index.html").exists())
        self.assertIn("column lineage", text)

    def test_missing_artifacts_is_a_clear_error(self) -> None:
        code, _, err = run("build", self.tmp.name + "/nowhere")
        self.assertEqual(code, EXIT_ERROR)
        self.assertIn("manifest.json", err)

    def test_check_thresholds(self) -> None:
        code, text, _ = run("check", str(self.project), "--fail-under", "1")
        self.assertEqual(code, 0, text)
        code, text, _ = run("check", str(self.project), "--fail-under", "99.9", "--format", "json")
        self.assertEqual(code, EXIT_CHECK_FAILED)
        self.assertFalse(json.loads(text)["passed"])
        code, text, _ = run("check", str(self.project), "--format", "markdown")
        self.assertIn("### Lineum health", text)

    def test_impact(self) -> None:
        code, text, _ = run("impact", "stg_orders", str(self.project), "--format", "json")
        self.assertEqual(code, 0)
        names = {row["node"] for row in json.loads(text)["downstream"]}
        self.assertIn("finance_dashboard", names)
        code, text, _ = run("impact", "raw.orders", str(self.project), "--column", "amount_cents", "--format", "markdown")
        self.assertIn("| 2 | `fct_orders` | model | `balance` | derived |", text)
        self.assertIn("| 2 | `all_amounts` | model | `amount` | direct |", text)
        code, _, err = run("impact", "missing_model", str(self.project))
        self.assertEqual(code, EXIT_ERROR)
        self.assertIn("No node named", err)

    def test_lineage_and_export(self) -> None:
        code, text, _ = run("lineage", "fct_orders", str(self.project), "--format", "mermaid")
        self.assertEqual(code, 0)
        self.assertTrue(text.startswith("flowchart LR"))
        code, text, _ = run("lineage", "fct_orders", str(self.project), "--column", "balance", "--format", "json")
        self.assertIn("amount_cents", text)
        code, text, _ = run("export", str(self.project), "--format", "dot", "--focus", "fct_orders", "--up", "1")
        self.assertIn('"model.shop.stg_orders" -> "model.shop.fct_orders";', text)
        code, text, _ = run("export", str(self.project), "--format", "json", "--focus", "fct_orders", "--down", "1")
        data = json.loads(text)
        self.assertTrue(all(a < len(data["nodes"]) and b < len(data["nodes"]) for a, b in data["edges"]))


@unittest.skipUnless((EXAMPLE / "target" / "manifest.json").exists(), "example artifacts not present")
class ExampleProjectTest(unittest.TestCase):
    """The committed Larkspur artifacts build, with the lineage the example is meant to show."""

    def test_example_builds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "site"
            config = Config()
            build_site(EXAMPLE, out, config)
            payload = read_payload(out)
            counts = payload["summary"]["counts"]
            self.assertGreaterEqual(counts["model"], 45)
            self.assertGreaterEqual(counts["exposure"], 5)
            self.assertGreater(len(payload["columnEdges"]), 400)
            names = [n["name"] for n in payload["nodes"]]
            ephemeral = names.index("int_refunds__by_order")
            enriched = names.index("int_orders__enriched")
            self.assertIn([ephemeral, "refund_amount", enriched, "refund_amount", "x"], payload["columnEdges"])


if __name__ == "__main__":
    unittest.main()
