# Badger Parser Fixture Manifest

Fixture set version: `2026.09.15.5-TEST`

Folder: [STAGING - Badger Parser Fixtures - 2026-09-15](https://drive.google.com/drive/folders/1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq)

The folder and all four files are private to `sturgeonspirits@gmail.com`.

| Fixture | Staging file ID | Expected first-run result |
| --- | --- | --- |
| `FIXTURE-VALID-0157-acorn.pdf` | `1h6tiTENFQ79F1WqcAdeXkrIYITVS2pWH` | Invoice `SS0157` imported with line items |
| `FIXTURE-VALID-0159-crimson-still.pdf` | `1wOQAWbcCVwNxdt5NLbu8VVIsjhYSPvI3` | Invoice `SS0159` imported with line items |
| `FIXTURE-REVIEW-nonstandard-parm-service.pdf` | `1bjzBXEM9YFzwKOaXs9oFZmNl90B_aDMv` | Classified `REVIEW` if no `SS` invoice number is found |
| `ZZ-FIXTURE-DUPLICATE-0157-acorn.pdf` | `1x8bec-SkBMC0i1JEJdAOiUiATp5BB0Xq` | Classified `DUPLICATE` after the valid 0157 fixture |

After a successful first run, running the same batch again should create no new
invoice or line rows. Terminal file states should cause all four candidates to
be skipped.
