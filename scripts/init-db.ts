import { withDb } from "../lib/db";
withDb((db) =>
  console.log(
    `Database initialized: ${db.users.length} users, ${db.groups.length} groups.`,
  ),
)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
