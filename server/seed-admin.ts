import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedAdminUser() {
  try {
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.isSystemAdmin, true))
      .limit(1);

    if (existingAdmin.length > 0) {
      console.log("[seed] Admin user already exists, skipping seed");
      return;
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log("[seed] ADMIN_PASSWORD env variable not set, skipping admin seed");
      return;
    }

    await db.insert(users).values({
      username: "admin",
      password: "ENV_BASED_AUTH",
      name: "System Administrator",
      isSystemAdmin: true,
      canEdit: true,
      mustChangePassword: false,
      merchantId: null,
    });

    console.log("[seed] Admin user created successfully (password from ADMIN_PASSWORD env)");
  } catch (error) {
    console.error("[seed] Error seeding admin user:", error);
  }
}
