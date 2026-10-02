import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { storage } from "./storage";
import { checkSeedEntryDeletion, checkSeedTransactionDeletion, SeedDeletionError } from "./seed-deletion";

export function registerSeedDeleteRoutes(app: Express, requireMerchant: RequestHandler) {
  for (const kind of ["seed-transactions", "seed-stock-entries"] as const) {
    app.delete(`/api/${kind}/:id`, requireMerchant, async (req, res) => {
      if (!req.user!.canEdit) {
        return res.status(403).json({ code: "FORBIDDEN", message: "You do not have permission to delete entries" });
      }
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
        return res.status(400).json({ code: "INVALID_ID", message: "Invalid seed entry id" });
      }
      const merchantId = req.user!.merchantId!;
      try {
        if (kind === "seed-transactions") {
          await checkSeedTransactionDeletion(db, id, merchantId);
          await storage.deleteSeedTransaction(id, merchantId);
        } else {
          await checkSeedEntryDeletion(db, id, merchantId);
          await storage.deleteSeedEntry(id, merchantId);
        }
        return res.json({ success: true });
      } catch (error: any) {
        if (error instanceof SeedDeletionError) {
          return res.status(error.status).json({ code: error.code, message: error.message });
        }
        if (error?.code === "23503") {
          return res.status(409).json({ code: "SEED_RECORD_LINKED",
            message: "This entry is linked to another record. Please remove the linked transaction or reverse its payment first." });
        }
        console.error(`Error deleting ${kind}:`, error);
        return res.status(500).json({ message: "Failed to delete seed entry" });
      }
    });
  }
}