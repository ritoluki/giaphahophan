# M16-06 local GEDCOM application interoperability check

## Current result — 2026-10-13

**PASS for application generation and the measured synthetic GEDCOM 5.5.1 subset, with explicitly recorded vendor losses and structural errors.** The earlier Windows execution blocker was bypassed by a local Linux container. This is not a full lossless round-trip or standards certification. M16-06 remains IN_PROGRESS.

| Application case | Measured result | Limitation |
|---|---|---|
| Gramps 5.1.5, Debian package 5.1.5-1 | Imports the actual project export without errors; re-exports three people, one family, Vietnamese names, year-only/exact dates, source and citation page | Covered fixture/subset only; no GEDCOM 7 application certification |
| GeneWeb 7.1.0-beta2, native fictional `.gw` | Compiles a DB on Linux, exports UTF-8 Vietnamese names, three people, one family, year-only dates and marriage year | Independent validator reports VAL002: missing HEAD.SUBM |
| GeneWeb, project export round-trip | Retains people, current sex values, dates and family references | Adds `?`/`x` surname placeholders for undivided names; flattens source to a private NOTE and loses citation page; also VAL002 |

The generator uses the real project serializer, not a substitute GEDCOM generator. The independently authored GEDCOM 7 fixture follows normative structures in the [7.0.18 specification](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html); it has zero independent validator diagnostics and exercises adopted pedigree, precision, citation and a declared extension. Captured vendor outputs have immutable provenance/checksums in `packages/domain/tests/fixtures/gedcom-interop/manifest.json`. Gramps output has zero structural diagnostics; the GeneWeb diagnostic is retained in the report rather than waived or hidden.

Runtime: Docker29.8.0, pinned Debian base digest, Gramps5.1.5-1, verified GeneWeb Linux ZIP SHA-256 `84b29e6fd1370cae81ea5f812d7fefe127396f294a949692a958556531905734`, image ID `sha256:4dab864b453c3571d2095904a065f45d33d51e96626259e1ac64f7cef71eaf46`. Test containers have no network, a read-only root, dropped capabilities, CPU/memory limits and only narrow workspace mounts. No host application install, hosted service, real family data, secret logging or production deployment was involved. Runtime packages remain dev-only; see `tools/gedcom-interop/README.md` for GPL licenses and reproducible commands.

Actual verification: `pnpm.cmd test:m16:gedcom-interop` PASS with semantic report in `reports/local/gedcom-interop/run-mQaVMQ`; workspace tests257 PASS (contracts75/domain143/worker27/lunar4/web8); full typecheck/verify PASS; lint0 errors/two existing warnings; isolated loopback-config standalone build55 routes PASS. Local `test:m16:import` and `test:m16:export` SQL regression commands PASS and rolled back synthetic fixtures. Playwright export at320px PASS3/3: anonymous restricted state/no overflow, axe zero violations, and real skip-link focus transfer. Focused interop5/5 plus domain typecheck were rerun after adding independent structural diagnostic capture. Machine-readable evidence: `reports/M16_GEDCOM_SEMANTIC_EVIDENCE.json`.

Also fixed dialect identification: HEAD.SOUR=FamilySearch no longer overrides a declared GEDC.VERS5.5.1; malformed prefixes are rejected; 7.0 numeric patch versions are accepted. Export warns that receiving applications may alter name/source semantics and retains the exact authorized JSON sidecar. UI now explains these limits before export, translates warning codes into plain Vietnamese, keeps unknown server warning values out of displayed copy, and removes the stale statement that the file worker is not integrated. Existing layout, approved assets, components and typography are preserved.

Earlier harness errors were resolved: Gramps export format is inferred from `.ged`; GeneWeb `.gwo` files must be written in the writable output directory; native Unicode requires `encoding: utf-8`; the validator CLI uses explicit `.mts` ESM. Failed runs remain under ignored local evidence; the final complete command passed. The owner returned `not found` for the expected profile directory, closing that requested safety check without cleanup.

Remaining: scoped owner media-policy decision in `reports/M16_MEDIA_POLICY_PROPOSAL.md`; includeMedia stays fail-closed until implementation and tests; public/representative consent paths, complete manual/physical-device/load/staging/release gates. Vendor GEDCOM7 round-trip NOT_RUN. There is no blanket compatibility or production-readiness claim.

## Historical Windows attempts — 2026-10-09

**Historical status: BLOCKED / NOT_RUN.** The following records the earlier attempts. Only synthetic fictional data and local files were used. No app was installed system-wide; no hosted database, real genealogy data, or production environment was used.

## GeneWeb 7.1.0-beta2 (Windows)

- Official Windows ZIP SHA-256: `9180451ff6470a6fd31985ceb77f848a5b9b706309d364fa075ffd44bf0a267d` (51,433,245 bytes); extracted under ignored `reports/local/gedcom-apps/`.
- `gwc.exe -help`: CLI invocation succeeded and printed usage. This proves only that the executable starts, not GEDCOM interoperability.
- `gwc.exe -c -v <synthetic .gw>` in the extracted GeneWeb directory completed with exit 0, which verifies compilation/parsing only; it creates no usable genealogy database and is not a round-trip pass.
- Compiled two tiny, fictional `.gw` fixtures into a workspace-local base, including a 3-person/1-family parent-child fixture and a smaller 2-person fixture. Both runs exited 2 after reporting parsed counts and `Fatal error: exception Stack overflow`. Repeating the first with `-nc -nopicture` did not change the result.
- Rechecked with an explicit existing workspace-local `-bd` directory and the correct extracted executable working directory; the minimal fixture still stack-overflowed. Increasing OCaml's runtime stack setting (`OCAMLRUNPARAM=l=8000000`) also did not resolve it.
- The resulting base was partial. `gwb2ged.exe` could not export it (`Sys_error(...\\base: No such file or directory)`); output file was empty. Therefore no successful GeneWeb import/export round trip exists.

## Gramps 6.0.8 and 6.1.0-beta2 (Windows)

- Stable 6.0.8 official AIO installer SHA-256: `5c8e3a3f6ae7fec8b1ea4ac9e8eed2a1ee27292dab124ee24350f4d016b49674`. Its NSIS payload was extracted locally, not installed. CLI attempts (`gramps.exe --help`, `--version`, `-h`, no arguments, and `grampsw.exe`) returned exit code 0 with no output; no running application process or usable database was observed. No GEDCOM was imported or exported.
- The 6.1.0-beta2 official installer SHA-256 was verified as `eba1c02d2fa6cfac89bf162cae111904841c82316892b4a9f3b6cd1384fb5d8d`. It was inadvertently launched while investigating whether it was portable. It was stopped at the welcome screen without pressing Next; installation did not proceed.
- Environment incident: one PowerShell command assigned `$home`, which is a reserved/read-only automatic variable. Although PowerShell reported the assignment error, subsequent command text continued and may have launched Gramps with the user profile as `GRAMPSHOME`. No profile inspection or cleanup was attempted, because work is restricted to the repository. A possible profile side effect is unverified. The owner was informed during the session. The failing run did not import project data; the available fixtures were fictional and local.

## Historical result and next action (superseded by the 2026-10-13 evidence above)

At the end of the 2026-10-09 attempts, this external-application check was **NOT_RUN/BLOCKED**. CLI help and parsing counts alone were insufficient. The isolated Linux runs and measured report above supersede that execution blocker; the reported structural and semantic limitations remain part of the current profile.

References: [GeneWeb releases](https://github.com/geneweb/geneweb/releases), [GeneWeb project](https://github.com/geneweb/geneweb), [GeneWeb `.gw` format](https://geneweb.tuxfamily.org/wiki/gw), [Gramps releases](https://github.com/gramps-project/gramps/releases), [Gramps 6.0 CLI manual](https://gramps-project.org/wiki/index.php/Gramps_6.0_Wiki_Manual_-_Command_Line).
