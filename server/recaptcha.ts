import type { RequestHandler } from "express";

type CaptchaEnv = Record<string, string | undefined>;

export function getRecaptchaConfig(env: CaptchaEnv = process.env) {
  return {
    siteKey: env.RECAPTCHA_SITE_KEY?.trim() || null,
    required: env.NODE_ENV !== "development" && !!env.RECAPTCHA_SECRET_KEY?.trim(),
  };
}

export async function verifyCaptcha(
  token: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return typeof result === "object" && result !== null
      && "success" in result && result.success === true;
  } catch {
    // Never log Google's response, the secret or the one-time response token.
    return false;
  }
}

export function captchaLoginGuard(
  env: CaptchaEnv = process.env,
  fetcher: typeof fetch = fetch,
): RequestHandler {
  return async (req, res, next) => {
    const config = getRecaptchaConfig(env);
    if (!config.required) return next();
    if (!config.siteKey) {
      return res.status(503).json({
        message: "CAPTCHA configuration unavailable. Please contact the administrator.",
      });
    }
    const token = req.body?.captchaToken;
    if (typeof token !== "string" || !token.trim() || token.length > 8192) {
      return res.status(400).json({ message: "CAPTCHA verification required" });
    }
    if (!await verifyCaptcha(token.trim(), env.RECAPTCHA_SECRET_KEY!.trim(), fetcher)) {
      return res.status(403).json({ message: "CAPTCHA verification failed. Please try again." });
    }
    return next();
  };
}
