// Where the encrypted data lives. The sync workflow writes it; this site only reads it.
window.REPFOLIO_CONFIG = {
  owner: "Pro2coL-lab",
  repo: "GitAfterIT",
  branch: "jefit-data",
  path: "data.enc.json",
  unit: "lb",         // "lb" or "kg" — JEFIT stores pounds; this only changes the display
  timeZone: null,     // e.g. "America/New_York"; null = this device's time zone
};
