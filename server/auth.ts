import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days - persistent login
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: SelectUser | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, async (err) => {
        if (err) return next(err);
        
        // Get merchant details if user has a merchant
        let merchantName: string | undefined;
        let merchantAddress: string | undefined;
        let merchantContact: string | undefined;
        if (user.merchantId) {
          const merchant = await storage.getMerchant(user.merchantId);
          merchantName = merchant?.name;
          merchantAddress = merchant?.address || undefined;
          merchantContact = merchant?.contactNumber || undefined;
        }
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        res.status(200).json({
          ...userWithoutPassword,
          merchantName,
          merchantAddress,
          merchantContact,
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.sendStatus(401);
    }
    
    // Get merchant details if user has a merchant
    let merchantName: string | undefined;
    let merchantAddress: string | undefined;
    let merchantContact: string | undefined;
    if (req.user.merchantId) {
      const merchant = await storage.getMerchant(req.user.merchantId);
      merchantName = merchant?.name;
      merchantAddress = merchant?.address || undefined;
      merchantContact = merchant?.contactNumber || undefined;
    }
    // Remove password from response
    const { password: _, ...userWithoutPassword } = req.user;
    res.json({
      ...userWithoutPassword,
      merchantName,
      merchantAddress,
      merchantContact,
    });
  });

  // Password change endpoint
  app.post("/api/change-password", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { mobileNumber, currentPassword, newPassword, isFirstLogin } = req.body;

      if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Always validate mobile number for all password changes
      if (!mobileNumber) {
        return res.status(400).json({ message: "Registered mobile number is required" });
      }
      if (user.mobileNumber !== mobileNumber) {
        return res.status(400).json({ message: "Mobile number does not match registered number" });
      }

      // If user must change password (first login) and isFirstLogin flag is set,
      // we skip current password verification (they know it's the default)
      // Otherwise, we also require current password verification
      if (user.mustChangePassword && isFirstLogin) {
        // First login - mobile already validated, skip current password check
      } else {
        // Regular password change - also verify current password
        if (!currentPassword) {
          return res.status(400).json({ message: "Current password is required" });
        }
        if (!(await comparePasswords(currentPassword, user.password))) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
      }

      // Update password
      await storage.updateUserPassword(req.user.id, await hashPassword(newPassword));
      
      // Clear must change password flag if set
      if (user.mustChangePassword) {
        await storage.updateUserMustChangePassword(req.user.id, false);
      }

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
}

// Export for use in admin routes
export { hashPassword, comparePasswords };
