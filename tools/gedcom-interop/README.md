# Local genealogy application QA

This is a dev-only test tool. It is not part of the website runtime. All names, dates, sources and relationships are fictional and labelled DEMO. Gramps 5.1.5 is pinned to Debian's `5.1.5-1` package (GPL-2.0-or-later); GeneWeb 7.1.0-beta2 is the official Linux release (GPL-2.0), checked against its GitHub SHA-256. The Debian base image is pinned by digest. Runtime versions and final image ID are captured per run.

Build once from the workspace root:

```powershell
docker build -t phan-gia-pha-gedcom-interop:20261013 tools/gedcom-interop
pnpm.cmd exec tsc --project tools/gedcom-interop/tsconfig.json
pnpm.cmd test:m16:gedcom-interop
```

The build downloads official packages and the GeneWeb release. The test itself runs with network disabled, read-only root filesystem, dropped capabilities, bounded CPU/memory, and mounts only synthetic input, this tool directory (read-only), and a newly created output directory under ignored `reports/local/gedcom-interop/`. It never mounts an env file, the project root, a hosted database, or a Windows user profile. The temporary container is removed by Docker after the command; generated evidence files stay in the workspace.

The generator uses the actual project GEDCOM serializer. Gramps imports and exports that file. GeneWeb separately exports its native synthetic `.gw` fixture and imports/exports the project file. The verifier checks people, UTF-8 names, date precision, family references, privacy/review defaults, source/citation raw preservation and measured vendor losses. See `reports/M16_GEDCOM_INTEROP_LOCAL.md` and the fixture `manifest.json` for scope and provenance. Unit regressions use captured vendor output, so ordinary tests need no Docker or downloads.

Gramps preserves the covered subset. GeneWeb adds unknown-surname placeholders when given an undivided name and flattens the source citation to a note, losing its page locator. These measured changes are explicitly reported; users must retain the full JSON sidecar. Application tests cover GEDCOM 5.5.1. GEDCOM 7 is covered by specification-derived fixtures and structural validation; these two vendor applications have not been certified for GEDCOM 7.

Independent structural validation also reports `VAL002` for GeneWeb's missing `HEAD.SUBM`. The bounded import profile accepts these records for private review; the generated GeneWeb files are not declared fully compliant with GEDCOM 5.5.1. Gramps has zero structural diagnostics for this fixture. All structural diagnostics are captured in the semantic report.

References: [Debian Gramps package](https://packages.debian.org/bookworm/gramps), [GeneWeb official release](https://github.com/geneweb/geneweb/releases/tag/v7.1.0-beta2), [GeneWeb native format](https://geneweb.tuxfamily.org/wiki/gw), [FamilySearch GEDCOM specification](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html).
