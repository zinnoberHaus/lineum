import contextlib
import io
import unittest

from lineum import __version__
from lineum.cli import NOT_IMPLEMENTED, main


class CliTest(unittest.TestCase):
    def test_version(self) -> None:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as exit_:
            main(["--version"])
        self.assertEqual(exit_.exception.code, 0)
        self.assertEqual(out.getvalue().strip(), f"lineum {__version__}")

    def test_build_reports_not_implemented(self) -> None:
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = main(["build"])
        self.assertEqual(code, NOT_IMPLEMENTED)
        self.assertIn("not implemented", err.getvalue())

    def test_no_command_prints_help(self) -> None:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main([])
        self.assertEqual(code, 0)
        self.assertIn("usage: lineum", out.getvalue())


if __name__ == "__main__":
    unittest.main()
