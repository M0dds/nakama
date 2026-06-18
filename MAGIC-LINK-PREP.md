# Magic Link / E-Mail-Prod — Vorbereitung für die nächste Session

**Ziel:** Magic-Link-Login (und später „Confirm email") produktionsreif machen, indem ein echter Mail-Versand über eine **verifizierte Resend-Domain** eingerichtet wird. Stand: 2026-06-18 (nach v0.13.0).

> Diese Datei ist ein in sich geschlossener Handoff. Kontext steht auch in `handshake.md` §Offene Punkte → „E-Mail-Prod (Auth)".

---

## Das Wichtigste zuerst

**Der Code ist fertig — das ist eine Config-/Infra-Aufgabe, kein Coding-Task.**

- `src/lib/auth-actions.ts → signInWithMagicLink()` ruft `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` auf; `emailRedirectTo` = `${origin}/auth/callback` → auf Prod also `https://usenakama.app/auth/callback`. Korrekt.
- `src/routes/AuthCallback.tsx` macht den Code-Exchange (`detectSessionInUrl: true` in `supabase.ts`), behandelt `error_description` + `?next=`. Korrekt.
- `src/routes/Login.tsx` hat das Magic-Link-Formular hinter „Kein Discord-Konto?" + den „schau ins Postfach"-Erfolgs-State. Korrekt.

**Der Blocker:** Supabase verschickt Auth-Mails über den eingebauten Mailer nur **~4 Mails/Stunde** und ausdrücklich nicht für Produktion. Für zuverlässigen Magic-Link braucht es **Custom SMTP** über einen Anbieter mit verifizierter Domain (→ **Resend**).

---

## Ausgangslage (was schon existiert)

- **Domain `usenakama.app`** liegt im **Cloudflare-DNS** (Hosting = Cloudflare Workers, `wrangler.jsonc`).
- **Cloudflare Email Routing ist aktiv** (eingerichtet 2026-06-18): `servus@usenakama.app` **empfängt** und leitet an die private Gmail weiter. Das ist nur **Eingang/Weiterleitung** — kein ausgehender Versand.
- **Discord-Login** ist produktiv und verifiziert (`identify email`-Scope; Supabase verlinkt die E-Mail-Identität, sodass ein Magic-Link an dieselbe Adresse in **denselben** Account zurückführt — Same-Email-Linking).

---

## Plan (Schritt für Schritt)

### 1 · Resend-Domain verifizieren (Versand)
- Resend-Account anlegen → **Domain `usenakama.app` hinzufügen**.
- Resend gibt **DNS-Records** aus (DKIM `CNAME`/`TXT`, ein `MX`+`TXT` für die MAIL-FROM-Subdomain, optional DMARC). Diese in **Cloudflare-DNS** eintragen.
- **⚠️ SPF-Koexistenz mit Email Routing:** Es darf nur **einen** SPF-TXT-Record (`v=spf1 …`) pro Domain geben. Falls Cloudflare Email Routing bereits einen SPF-Eintrag gesetzt hat, NICHT einen zweiten anlegen — die `include:`-Mechanismen **in einen** Record mergen. Resend empfiehlt ohnehin meist eine eigene **Sende-Subdomain** (z. B. `send.usenakama.app`); dann kollidiert das SPF der Subdomain nicht mit dem Root-SPF von Email Routing. Das ist der saubere Weg.
- Warten bis Resend „Verified" zeigt.

### 2 · Absender-Adresse festlegen
- Vorschlag: `noreply@usenakama.app` (klassisch transaktional) **oder** `servus@usenakama.app` (dann landen Antworten via Email Routing in der Gmail). **User-Entscheidung.**
- Reine Versand-Adresse braucht KEINE separate Empfangsregel; Antworten gehen nur, wenn die Adresse auch in Email Routing existiert.

### 3 · Supabase Custom SMTP einrichten
Supabase Dashboard → **Authentication → Emails / SMTP Settings** → „Enable Custom SMTP":
- Host: `smtp.resend.com`
- Port: `465` (SSL) bzw. `587` (STARTTLS)
- Username: `resend`
- Password: **Resend-API-Key**
- Sender email: die in Schritt 2 gewählte Adresse · Sender name: `Nakama`
- **Rate-Limits hochsetzen** (Auth → Rate Limits), der Default ist konservativ.

### 4 · URL-Konfiguration prüfen
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://usenakama.app`
- **Redirect URLs (Allowlist):** `https://usenakama.app/auth/callback` **und** `http://localhost:5173/auth/callback` (Dev) — sonst lehnt Supabase den `emailRedirectTo` ab.

### 5 · E-Mail-Templates anpassen
Supabase → **Authentication → Email Templates**: „Magic Link" (und „Confirm signup", falls aktiviert) auf deutsche Copy + Nakama-Ton bringen. Link/Variablen unangetastet lassen.

### 6 · „Confirm email" entscheiden
- handshake-Plan: „Confirm email" anschalten.
- **Beachten:** Interaktion mit Discord-Same-Email-Linking + dem `signInWithOtp`-Default `shouldCreateUser: true` (legt bei neuer Adresse einen User an → landet danach im `/setup`-Onboarding-Gate). Vor dem Anschalten den Neu-User-Magic-Link-Flow **auf Prod testen**.

### 7 · Testen (auf Prod)
- Magic-Link an eine echte Adresse schicken → Zustellung prüfen (Inbox **nicht** Spam) → Link klicken → landet eingeloggt auf `/` (bzw. `/setup` bei neuem User).
- Deliverability/Spam-Score checken (SPF/DKIM/DMARC „pass").

---

## Mögliche Code-Touch-Points (optional, von der Session zu entscheiden)
Der Flow funktioniert ohne Code-Änderung. Nur falls gewünscht:
- **`shouldCreateUser`** in `signInWithMagicLink` explizit setzen, falls Magic-Link **nur bestehende** Accounts einloggen soll (statt neue anzulegen).
- Bei aktivem „Confirm email": ggf. ein eigener „Bestätige deine E-Mail"-Screen-State (aktuell deckt der „schau ins Postfach"-State beides ab — wahrscheinlich ausreichend).
- Freundlichere Fehlertexte bei Rate-Limit-/Zustell-Fehlern in `Login.tsx`.

## Was der User liefern/entscheiden muss
- Resend-Account + Domain-Verifizierung (Dashboard + Cloudflare-DNS).
- Absender-Adresse (`noreply@` vs. `servus@`).
- „Confirm email" an/aus.

## Definition of Done
- Magic-Link-Mail kommt über Resend zuverlässig + nicht im Spam an, Login auf Prod funktioniert end-to-end, Rate-Limit reicht für echten Betrieb. Danach `handshake.md` §Stand/§Offene Punkte + `PRE-LAUNCH-FEATURES.md` nachziehen und den Punkt schließen.
