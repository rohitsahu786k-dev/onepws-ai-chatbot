import { connectToDatabase, seedBaseData } from "@onepws/core";

async function main() {
  await connectToDatabase();
  await seedBaseData();
  console.log("Seed complete");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
