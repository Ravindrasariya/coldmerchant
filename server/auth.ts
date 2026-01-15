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
    rolling: true, // Reset session expiry on each request for persistent login
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax", // Allows cookie on same-site navigation
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days - long-term persistent login
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
        
        // Get merchant name if user has a merchant
        let merchantName: string | undefined;
        if (user.merchantId) {
          const merchant = await storage.getMerchant(user.merchantId);
          merchantName = merchant?.name;
        }
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        res.status(200).json({
          ...userWithoutPassword,
          merchantName,
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
    
    // Get merchant name if user has a merchant
    let merchantName: string | undefined;
    if (req.user.merchantId) {
      const merchant = await storage.getMerchant(req.user.merchantId);
      merchantName = merchant?.name;
    }
    // Remove password from response
    const { password: _, ...userWithoutPassword } = req.user;
    res.json({
      ...userWithoutPassword,
      merchantName,
    });
  });

  // Password change endpoint
  app.post("/api/change-password", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { currentPassword, newPassword, isFirstLogin } = req.body;

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

      // If user must change password (first login) and isFirstLogin flag is set,
      // we allow changing without verifying current password (they know it's the default)
      // Otherwise, we require current password verification
      if (user.mustChangePassword && isFirstLogin) {
        // First login - just update the password
      } else {
        // Regular password change - verify current password
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
