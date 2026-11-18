import json
import tempfile
import unittest
from pathlib import Path

from lineum import analysis, artifacts, columns, health, markdown
from lineum.artifacts import ArtifactError
from lineum.project import build_project
from tests import fixtures

PKG = fixtures.PKG


def analysed(tmp: Path, **kwargs):
    fixtures.write_project(tmp, **kwargs)
    project = build_project(artifacts.load(tmp))
    columns.compute(project, workers=1)
    summary = analysis.analyse(project)
    return project, summary


class ArtifactsTest(unittest.TestCase):
    def test_loads_all_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures.write_project(Path(tmp))
            loaded = artifacts.load(tmp)
            self.assertEqual(loaded.manifest_version, 12)
            self.assertIsNotNone(loaded.catalog)
            self.assertIsNotNone(loaded.run_results)
            self.assertEqual(loaded.versions()["manifest"], "v12")

    def test_missing_manifest_explains_what_to_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ArtifactError, "dbt parse"):
                artifacts.load(tmp)

    def test_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "target"
            target.mkdir()
            (target / "manifest.json").write_text("{not json")
            with self.assertRaisesRegex(ArtifactError, "not valid JSON"):
                artifacts.load(tmp)

    def test_rejects_old_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "target"
            target.mkdir()
            old = {"metadata": {"dbt_schema_version": "https://schemas.getdbt.com/dbt/manifest/v4.json"}, "nodes": {}}
            (target / "manifest.json").write_text(json.dumps(old))
            with self.assertRaisesRegex(ArtifactError, "v4"):
                artifacts.load(tmp)

    def test_optional_files_are_optional(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures.write_project(Path(tmp), catalog_file=False, runs=False)
            loaded = artifacts.load(tmp)
            self.assertIsNone(loaded.catalog)
            self.assertTrue(any("catalog.json" in w for w in loaded.warnings))

    def test_target_path_from_dbt_project(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures.write_project(root)
            (root / "target").rename(root / "build")
            (root / "dbt_project.yml").write_text("name: shop\ntarget-path: build\n")
            self.assertEqual(artifacts.load(root).target_dir.name, "build")


class ProjectTest(unittest.TestCase):
    def test_nodes_edges_and_types(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, summary = analysed(Path(tmp))
            types = summary["counts"]
            self.assertEqual(types["model"], 7)
            self.assertEqual(types["source"], 2)
            self.assertEqual(types["exposure"], 1)
            self.assertEqual(types["metric"], 1)
            self.assertNotIn("test", types)
            self.assertIn((f"model.{PKG}.fct_orders", f"exposure.{PKG}.finance_dashboard"), project.edges)

    def test_tests_attach_with_status_and_primary_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            staging = project.nodes[f"model.{PKG}.stg_orders"]
            kinds = {(t.kind, t.status) for t in staging.tests}
            self.assertIn(("unique", "pass"), kinds)
            self.assertIn(("unit", "pass"), kinds)
            self.assertTrue(staging.column("order_id").primary_key)  # unique + not_null
            facts = project.nodes[f"model.{PKG}.fct_orders"]
            self.assertTrue(facts.column("order_id").primary_key)  # constraint
            statuses = {t.kind: t.status for t in facts.tests}
            self.assertEqual(statuses["not_null"], "fail")
            self.assertEqual(statuses["singular"], "warn")

    def test_layers_owners_urls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            nodes = project.nodes
            self.assertEqual(nodes[f"model.{PKG}.stg_orders"].layer, "staging")
            self.assertEqual(nodes[f"model.{PKG}.int_payments_by_order"].layer, "intermediate")
            self.assertEqual(nodes[f"model.{PKG}.fct_orders"].layer, "marts")
            self.assertEqual(nodes[f"model.{PKG}.fct_orders"].owner, "Finance team")
            self.assertEqual(nodes[f"source.{PKG}.raw.orders"].url, "source/shop/raw/orders.html")
            urls = [n.url for n in nodes.values()]
            self.assertEqual(len(urls), len(set(urls)))

    def test_freshness_and_stats(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            source = project.nodes[f"source.{PKG}.raw.orders"]
            self.assertEqual(source.freshness["status"], "warn")
            self.assertTrue(source.freshness["configured"])
            self.assertEqual(project.nodes[f"model.{PKG}.fct_orders"].stats["rows"], 120)

    def test_resolve_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            self.assertEqual(project.resolve("fct_orders").id, f"model.{PKG}.fct_orders")
            self.assertEqual(project.resolve("raw.orders").id, f"source.{PKG}.raw.orders")
            self.assertEqual(project.resolve("source:orders").id, f"source.{PKG}.raw.orders")
            self.assertIsNone(project.resolve("nope"))


class ColumnLineageTest(unittest.TestCase):
    def edges(self, project, target):
        return {(e.source.split(".")[-1], e.source_column, e.target_column, e.transform)
                for e in project.column_edges if e.target == f"model.{PKG}.{target}"}

    def test_renames_and_derived(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            edges = self.edges(project, "stg_orders")
            self.assertIn(("orders", "id", "order_id", "renamed"), edges)
            self.assertIn(("orders", "customer_id", "customer_id", "direct"), edges)
            self.assertIn(("orders", "amount_cents", "amount", "derived"), edges)

    def test_ephemeral_models_stop_lineage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            edges = self.edges(project, "fct_orders")
            # paid comes from the ephemeral model, not straight from stg_payments.
            self.assertIn(("int_payments_by_order", "paid", "paid", "derived"), edges)
            self.assertFalse(any(source == "stg_payments" for source, *_ in edges))
            self.assertIn(("int_payments_by_order", "paid", "balance", "derived"), edges)
            self.assertIn(("stg_orders", "amount", "balance", "derived"), edges)
            ephemeral = self.edges(project, "int_payments_by_order")
            self.assertIn(("stg_payments", "amount", "paid", "aggregated"), ephemeral)

    def test_union_reads_both_branches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            edges = self.edges(project, "all_amounts")
            self.assertIn(("stg_orders", "order_id", "id", "renamed"), edges)
            self.assertIn(("stg_payments", "payment_id", "id", "renamed"), edges)

    def test_python_models_are_explained(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            self.assertIn("python model", project.nodes[f"model.{PKG}.customer_scores"].column_lineage)

    def test_unparseable_sql_does_not_stop_the_build(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures.write_project(Path(tmp))
            project = build_project(artifacts.load(tmp))
            project.nodes[f"model.{PKG}.all_amounts"].compiled_sql = "select from from where ((("
            stats = columns.compute(project, workers=1)
            self.assertTrue(project.nodes[f"model.{PKG}.all_amounts"].column_lineage.startswith("could not"))
            self.assertGreater(stats["edges"], 5)

    def test_stale_catalog_does_not_drop_the_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures.write_project(Path(tmp))
            project = build_project(artifacts.load(tmp))
            # The join references a column the catalog does not know about yet.
            project.nodes[f"model.{PKG}.all_amounts"].compiled_sql = (
                'select o.order_id as id, p.amount from "db"."analytics"."stg_orders" as o '
                'join "db"."analytics"."stg_payments" as p on o.order_id = p.new_column'
            )
            columns.compute(project, workers=1)
            edges = {(e.source.split(".")[-1], e.source_column, e.target_column)
                     for e in project.column_edges if e.target == f"model.{PKG}.all_amounts"}
            self.assertIn(("stg_payments", "amount", "amount"), edges)
            self.assertIn(("stg_orders", "order_id", "id"), edges)
            self.assertEqual(project.nodes[f"model.{PKG}.all_amounts"].column_lineage, "ok")

    def test_parallel_matches_serial(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures.write_project(Path(tmp))
            serial = build_project(artifacts.load(tmp))
            columns.compute(serial, workers=1)
            parallel = build_project(artifacts.load(tmp))
            columns.compute(parallel, workers=2)
            self.assertEqual(set(serial.column_edges), set(parallel.column_edges))


class AnalysisTest(unittest.TestCase):
    def test_reach_depth_and_critical_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, summary = analysed(Path(tmp))
            source = project.nodes[f"source.{PKG}.raw.orders"]
            self.assertEqual(source.metrics["depth"], 0)
            self.assertGreaterEqual(source.metrics["down"], 5)
            self.assertEqual(source.metrics["exposures"], 1)
            facts = project.nodes[f"model.{PKG}.fct_orders"]
            self.assertEqual(facts.metrics["fanIn"], 2)
            self.assertIn(f"model.{PKG}.fct_orders", summary["criticalPath"]["nodes"])
            self.assertAlmostEqual(summary["criticalPath"]["seconds"], 2.5, places=3)

    def test_column_walks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            upstream = analysis.column_upstream(project, f"model.{PKG}.fct_orders", "balance")
            reached = {(n.split(".")[-1], c) for n, c, _, _ in upstream}
            self.assertIn(("orders", "amount_cents"), reached)
            self.assertIn(("payments", "amount"), reached)
            downstream = analysis.column_downstream(project, f"source.{PKG}.raw.orders", "amount_cents")
            self.assertIn(("fct_orders", "balance"), {(n.split(".")[-1], c) for n, c, _, _ in downstream})


class HealthTest(unittest.TestCase):
    def test_score_and_findings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project, _ = analysed(Path(tmp))
            report = health.assess(project)
            self.assertGreaterEqual(report["score"], 0)
            self.assertLessEqual(report["score"], 100)
            rules = {f["rule"]: f["nodes"] for f in report["findings"]}
            self.assertIn(f"model.{PKG}.fct_orders", rules["failing-tests"])
            self.assertIn(f"model.{PKG}.direct_from_source", rules["source-outside-staging"])
            self.assertIn(f"source.{PKG}.raw.orders", rules["stale-sources"])
            dimensions = {d["id"]: d for d in report["dimensions"]}
            self.assertEqual(dimensions["contracts"]["hit"], 1)


class MarkdownTest(unittest.TestCase):
    def test_escapes_html_and_unsafe_links(self) -> None:
        html = markdown.render("Hi <script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com)")
        self.assertNotIn("<script>", html)
        self.assertNotIn('href="javascript', html)
        self.assertIn('href="https://example.com"', html)
        self.assertIn('rel="noopener noreferrer"', html)

    def test_plain_summary(self) -> None:
        self.assertEqual(markdown.plain("**Bold** and `code` [link](https://x)"), "Bold and code link")
        self.assertEqual(markdown.plain("Joins to `dim_customers`, _not_ __raw__."), "Joins to dim_customers, not raw.")
        self.assertTrue(markdown.plain("word " * 200, limit=40).endswith("…"))


if __name__ == "__main__":
    unittest.main()
