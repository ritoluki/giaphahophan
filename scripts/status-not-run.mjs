const label = process.argv.slice(2).join(" ") || "requested check";
console.error(`NOT_RUN: ${label} requires the local Supabase/browser/provider environment and is not claimed by the foundation scaffold.`);
process.exitCode = 2;
