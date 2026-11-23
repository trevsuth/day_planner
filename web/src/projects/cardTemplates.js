export const cardTemplates = [
  {
    id: "service-upgrade",
    label: "Service upgrade",
    description: "Review release notes, take a backup, apply the upgrade, and verify recovery checks.",
    deliverables: ["Record the current version and rollback steps", "Verify backup", "Apply upgrade", "Run smoke checks"],
  },
  {
    id: "restore-rehearsal",
    label: "Restore rehearsal",
    description: "Restore a recent backup into a disposable environment and record the results.",
    deliverables: ["Select an off-device backup", "Restore into disposable storage", "Verify representative data and attachments", "Record recovery time"],
  },
  {
    id: "incident-followup",
    label: "Incident follow-up",
    description: "Capture the symptoms, contributing factors, and actions to prevent recurrence.",
    deliverables: ["Record the timeline", "Document the resolution", "Update the runbook"],
  },
];
