import { connectToDatabase, startWorkers } from "@onepws/core";

async function main() {
  await connectToDatabase();
  startWorkers();
  console.log("OnePWS worker running");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
