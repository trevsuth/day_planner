# Roadmap

Priorities for a personal, single-node home lab. Keep Planner focused on daily
capture and scheduling. Use Projects for repeatable work and Graph for runbooks.
Prefer improvements that save time or make recovery easier within the existing
deployment.

## Next

1. **Make Projects CSV imports safe to retry.** The browser currently creates
   cards and links dependencies in separate requests. Preview row-level errors
   for malformed fields, unresolved references, and ambiguous matches before
   saving. Commit the batch in one database transaction. Test that an invalid
   row or failed write leaves the project untouched.
2. **Make off-device restore rehearsals repeatable.** Use the documented
   [restore procedure](../deploy/k3s/README.md) against a recent off-device
   archive in disposable PostgreSQL. Record the archive, release, and result
   after checking a Planner entry, a project card, and a Graph attachment.
   Consider a Just recipe if repeated drills make the setup worthwhile.

## After that

- **Flag overlapping CIDRs in Calculator.** Paste a list of IPv4 and IPv6
  networks and highlight duplicates, contained networks, and invalid lines.
  Keep parsing and results in the browser. This supports checking VLAN, VPN,
  and container network plans before changing configuration.
- **Explain SQL translation limits in Validation.** Show which statements use
  constructs the translator cannot convert faithfully. Use Snowflake and
  BigQuery examples that distinguish translation warnings from syntax errors.
- **Print QR and barcode labels from Viewer.** Add an optional human-readable
  caption and a print size in millimeters. Preserve the code's quiet zone and
  verify a printed sample at the selected size before extending the layout.
- **Check linked runbooks in Projects.** Flag a card whose Graph note was
  removed or replaced during import. From the card, make it easy to relink
  the note or clear the reference.

## Maintenance when touching the feature

- **Keep project warnings consistent.** The Issues panel already loads server
  issue records. Extend that source to the card preview, badges, and dependency
  graph. Treat a successful empty response as authoritative, and exercise
  the issues API in a browser test.
- **Cover shared project behavior.** Add service tests for card creation and
  updates used by the API and TUI, and for what happens to a Planner assignment
  when its linked card is deleted.
- **Extract project UI by workflow.** Move the CSV panel or card editor when
  changes to that workflow make extraction useful. Add tests for escaping,
  lists, and fenced blocks if the card Markdown preview moves. Revisit typing
  the scheduling helpers when changing their interfaces or rules.
- **Add focused Graph interaction tests.** Build on existing search and
  portable backup coverage with multi-selection, copy/paste, and keyboard
  behavior. Add migration fixtures when changing the document format.
