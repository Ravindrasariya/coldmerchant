import { storage } from "./storage";
import { db } from "./db";
import { lots, seedLots, stockEntries, seedStockEntries, merchants } from "@shared/schema";
import { eq } from "drizzle-orm";
import { computeNetWeight } from "@shared/utils";

async function backfillHarvestLots() {
  console.log("Backfilling harvest lot charges...");
  const allMerchants = await storage.getAllMerchants();
  
  for (const merchant of allMerchants) {
    const entries = await storage.getStockEntriesByMerchant(merchant.id);
    for (const entry of entries) {
      for (const lot of entry.lots) {
        const breakdowns = lot.bagBreakdowns || [];
        const place = lot.place || "cold_store";
        
        let costOfGoods = 0;
        const sellable = breakdowns.filter((bd: any) => bd.size !== "Wastage");
        const hasBdData = sellable.some((bd: any) => {
          const w = bd.weight ? parseFloat(bd.weight) : 0;
          const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          return w > 0 && p > 0;
        });
        
        if (hasBdData) {
          for (const bd of sellable) {
            const weight = bd.weight ? parseFloat(bd.weight) : 0;
            const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
            const netWeight = computeNetWeight(weight, bd.numberOfBags, place);
            if (netWeight > 0 && price > 0) {
              costOfGoods += netWeight * price;
            }
          }
        } else {
          const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
          const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
          const netWeight = computeNetWeight(lotWeight, lot.originalBags, place);
          if (netWeight > 0 && lotPrice > 0) {
            costOfGoods = netWeight * lotPrice;
          }
        }

        const wastageBags = breakdowns
          .filter((bd: any) => bd.size === "Wastage")
          .reduce((sum: number, bd: any) => sum + bd.numberOfBags, 0);
        const actualBags = lot.originalBags - wastageBags;

        let totalCharges = 0;
        let netPayable = 0;

        if (place === "mandi") {
          const mandiPct = lot.mandiCommissionPercent ? parseFloat(lot.mandiCommissionPercent) : 0;
          const aadhatPct = lot.aadhatCommissionPercent ? parseFloat(lot.aadhatCommissionPercent) : 0;
          const hammaliRate = lot.hammaliPerBag ? parseFloat(lot.hammaliPerBag) : 0;
          const extraCharges = lot.mandiExtraCharges ? parseFloat(lot.mandiExtraCharges) : 0;
          totalCharges = costOfGoods * mandiPct / 100 + costOfGoods * aadhatPct / 100 + actualBags * hammaliRate + extraCharges;
          netPayable = costOfGoods + totalCharges;
        } else {
          const isFarmGate = place === "farm_gate";
          const charges: Array<{type: string; amount: number | string}> = lot.charges || [];
          const hammaliGrading = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
          const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];
          const dynamicCharges = charges
            .filter((c: any) => !(isFarmGate && coldStoreChargeTypes.includes(c.type)))
            .reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);
          totalCharges = hammaliGrading + dynamicCharges;
          
          const adjType = lot.adjustedAmountType;
          const adjPrincipal = lot.adjustedAmount ? parseFloat(lot.adjustedAmount) : 0;
          const adjFinal = lot.adjustedAmountFinal ? parseFloat(lot.adjustedAmountFinal) : adjPrincipal;
          const interestOnly = adjFinal - adjPrincipal;
          const signedAdj = adjType === "credit" ? interestOnly : adjType === "debit" ? -interestOnly : 0;
          netPayable = costOfGoods - totalCharges + signedAdj;
        }

        await db.update(lots)
          .set({ 
            totalCharges: totalCharges.toFixed(2), 
            netPayable: netPayable.toFixed(2) 
          })
          .where(eq(lots.id, lot.id));
      }
    }
    console.log(`  Merchant ${merchant.id} (${merchant.name}): ${entries.length} entries processed`);
  }
  console.log("Harvest lot backfill complete.");
}

async function backfillSeedLots() {
  console.log("Backfilling seed lot charges...");
  const allMerchants = await storage.getAllMerchants();
  
  for (const merchant of allMerchants) {
    const entries = await storage.getSeedEntriesByMerchant(merchant.id);
    for (const entry of entries) {
      for (const lot of entry.seedLots) {
        const bags = lot.originalBags || 0;
        const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
        const costOfGoods = bags * pricePerBag;
        
        const hammali = lot.hammaliCharges ? parseFloat(lot.hammaliCharges) : 0;
        const grading = lot.gradingCharges ? parseFloat(lot.gradingCharges) : 0;
        const transport = lot.transportCharges ? parseFloat(lot.transportCharges) : 0;
        const totalCharges = hammali + grading + transport;
        const netPayable = costOfGoods + totalCharges;
        const avgCostPerBag = bags > 0 ? netPayable / bags : 0;

        await db.update(seedLots)
          .set({
            totalCharges: totalCharges.toFixed(2),
            netPayable: netPayable.toFixed(2),
            avgCostPerBag: avgCostPerBag.toFixed(2),
          })
          .where(eq(seedLots.id, lot.id));
      }
    }
    console.log(`  Merchant ${merchant.id} (${merchant.name}): ${entries.length} seed entries processed`);
  }
  console.log("Seed lot backfill complete.");
}

async function main() {
  try {
    await backfillHarvestLots();
    await backfillSeedLots();
    console.log("All backfills completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

main();
