# Security policy

Lineum is a 0.1 preview without a PyPI release. There are no stable releases or long-term support commitments; security fixes target the current default branch.

Generated sites contain what your dbt artifacts contain: descriptions, column names, SQL (unless built with `--no-sql`) and, with `--data`, sample rows. Treat a site as you would the warehouse metadata it documents. Lineum renders descriptions with raw HTML disabled and drops unsafe link schemes; report any way to run script in a generated site as a vulnerability. The SQL page loads DuckDB-WASM from cdn.jsdelivr.net when opened.

Do not disclose exploitable vulnerabilities, credentials, or customer data in public issues or pull requests.

Use the repository's **Security → Advisories → Report a vulnerability** entry point. Include affected revision, impact, prerequisites, a minimal reproduction, and suggested mitigation. Share only the sensitive information required to investigate.

If private reporting is unavailable, open a public issue titled “Private security contact requested” containing no vulnerability details. Wait for the maintainer to provide a private channel. No dedicated security email address or response SLA is currently advertised.

The maintainer will assess reports, coordinate a fix and disclosure with the reporter where possible, and publish relevant mitigation or upgrade guidance. There is no bug bounty promise. Test only systems you own or have permission to assess; do not access other users' data or disrupt services.

Maintainers should verify private reporting before the first public release, revoke exposed credentials promptly, and assess workflow permissions and dependency changes during review.
