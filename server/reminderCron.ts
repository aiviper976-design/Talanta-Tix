import "dotenv/config";
import { runPurchaseReminderSweep } from "./purchaseReminders";

runPurchaseReminderSweep()
  .then(result => {
    console.log("[Render reminders] Sweep completed", result);
    process.exit(0);
  })
  .catch(error => {
    console.error("[Render reminders] Sweep failed", error instanceof Error ? error.message : error);
    process.exit(1);
  });
