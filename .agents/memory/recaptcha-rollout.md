---
name: Login CAPTCHA rollout
description: Why login CAPTCHA is optional until keys are configured and why development verification is bypassed.
---

The user asked to follow their other app's reCAPTCHA v2 checkbox guidelines, including optional activation through server-side keys and a development verification bypass. Do not silently turn absent keys into a production login outage.

**Why:** This is an incremental rollout to an existing Hostinger application; the code may be deployed before the operator registers domains and configures both keys. Once enforcement is configured, verification errors must deny login rather than bypass it.

**How to apply:** Preserve those rollout semantics unless the user approves a stricter policy. Replit configuration does not establish Hostinger configuration. Report the feature as implemented but not active or live-verified until the intended host has working keys and domain registration.
