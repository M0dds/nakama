# Nakama — Security Audit

**Datum:** 2026-06-03 · **Branch:** `feat/logbuch-seasons-completions` · **Methode:** Multi-Agent-Audit (17 Agenten, adversariell verifiziert)

---

## Gesamturteil

> **Kein kritisches Finding. Kein aktives Datenleck. Keine Auth-Bypass-Lücke.**
> Die Codebase ist in der sicherheitsentscheidenden Schicht (Datenbank-Autorisierung / Row-Level-Security) **überdurchschnittlich solide** — genau die Schicht, an der KI-gebaute Apps am häufigsten scheitern, ist hier die am sorgfältigsten gepflegte.

Die 9 bestätigten Findings sind **Pre-Launch-Härtung und Defense-in-Depth**, kein einziges erlaubt heute den Zugriff auf fremde Nutzerdaten oder die Übernahme eines Accounts. Der Schweregrad ist durchgängig **medium ↓**, kalibriert auf die reale Nutzung (Paare / kleine Freundeskreise).

### Was sauber ist (das Vorzeigbare)

| Bereich | Befund |
|---|---|
| **Row-Level-Security** | Auf **jeder** Nutzerdaten-Tabelle aktiv, korrekt an `auth.uid()` / Listen-Mitgliedschaft gebunden. Alle 4 historischen Leck-Klassen verifiziert geschlossen. |
| **SECURITY-DEFINER-RPCs** | Alle daten-rückgebenden RPCs scopen selbst auf den Aufrufer (DEFINER umgeht RLS — hier korrekt abgefangen). |
| **Privilege Escalation** | Geschlossen: Nicht-Owner können nicht umbenennen/löschen, keine Mitglieder entfernen, keine Rolle selbst setzen. |
| **XSS** | **Clean.** Genau ein HTML-Sink im gesamten Code (`GeneratedCover`), und der ist numerisch — nicht injizierbar. Solid escaped alle Text-Interpolationen automatisch. |
| **Link-Sicherheit** | `normalizeUrl` blockt `javascript:`/`data:`-URLs verifiziert — und zwar beim Speichern *und* beim Rendern, plus `rel="noopener"`. |
| **Secrets** | Kein `service_role`-Key im Client, nichts in der Git-History, `.env.local` korrekt ignoriert, keine Source-Maps in Produktion. |
| **Dependencies** | `npm audit`: **0 Vulnerabilities.** |
| **Open Redirect** | **Untersucht und widerlegt** (siehe unten) — Solid Router neutralisiert die Payload-Klasse vollständig. |

---

## Methodik

Klassische Linter/Scanner finden bei KI-Code viel Rauschen. Stattdessen ein zweistufiger Multi-Agent-Lauf:

1. **6 Finder-Dimensionen parallel** — RLS/Autorisierung · XSS/Injection · Auth/Session · Secrets/Bundle · SSRF/Proxy · Input-Validierung. Jeder Agent liest den echten Code, keine Vermutungen.
2. **Adversarielle Verifikation** — jedes Finding bekommt einen skeptischen Gegen-Agenten, der es *zu widerlegen versucht* (liest den zitierten Code + Umgebung, prüft ob die Lücke real erreichbar und nicht anderswo schon abgefangen ist). Nur was diese Prüfung übersteht, landet hier. Severity wird auf realistische Auswirkung justiert.

**Ergebnis:** 11 Roh-Findings → **2 als False-Positive verworfen** → **9 bestätigt**.

---

## Bestätigte Findings

### 🟡 M-1 · Catalog-Write-RPCs ohne Autorisierung *(medium)*
**Datei:** `supabase/migrations/20260601130000_prelaunch_hardening.sql:50–92`

Die Pre-Launch-Härtung hat direkte Schreibrechte auf `items`/`episodes` korrekt entzogen und auf DEFINER-RPCs umgeleitet — aber zwei davon prüfen den Aufrufer gar nicht:

```sql
create or replace function public.set_item_metadata(_item_id uuid, _metadata jsonb)
  ... security definer ...
as $$ begin
  update public.items set metadata = coalesce(_metadata,'{}'::jsonb) where id = _item_id; -- kein auth-scope
end; $$;
grant execute on function public.set_item_metadata(uuid, jsonb) to authenticated;
```

**Impact:** Jeder eingeloggte Nutzer kann per direktem RPC-Call die Metadaten (Release-Datum, Format, JSONB) *jedes* Katalog-Items überschreiben oder via `upsert_episodes` Episodentitel/Air-Dates *jeder* Serie fälschen. Da der Katalog global geteilt ist, korrumpiert das „Was kommt", Kalender und Badges für **alle** Nutzer gleichzeitig. → Integrität/Vandalismus, **keine** Vertraulichkeitslücke (keine privaten Daten erreichbar).

**Fix:** RPC auf Aufrufer scopen, die das Item tatsächlich in einer Liste haben — die Helfer existieren bereits in derselben Migration:
```sql
-- am Anfang beider Funktionen:
if not exists (
  select 1 from list_items li
  join list_members lm on lm.list_id = li.list_id
  where li.item_id = _item_id and lm.user_id = auth.uid()
) then raise exception 'not authorized'; end if;
```
Das Enrichment ist idempotent und per-Visit → kostet funktional nichts.

*Von zwei Dimensionen unabhängig gefunden (Input-Validierung: medium, RLS: low). Das medium-Rating ist das maßgebliche.*

---

### 🟡 M-2 · @handle-Format nur client-seitig erzwungen *(medium)*
**Datei:** `src/lib/queries/profile.ts:181–199` · DB: kein CHECK auf `profiles.username`

Die Handle-Regel `^[a-z0-9._-]{3,30}$` lebt nur im Client und im `username_available`-RPC. Der **tatsächliche Schreibvorgang** ist ein direktes PostgREST-`UPDATE`, das nur `profiles_update_own` (`auth.uid() = user_id`) gated — **kein** Format-/Längen-CHECK auf DB-Ebene.

```js
const norm = input.username.trim().replace(/^@/,"").toLowerCase();
if (!/^[a-z0-9._-]{3,30}$/.test(norm)) return { ok:false, error:"invalid" }; // nur Client
await supabase.from("profiles").update({ username: norm }).eq("user_id", input.userId)...
```

**Impact:** Mit dem öffentlichen Anon-Key kann ein Angreifer den eigenen Handle direkt auf Whitespace, Unicode-Confusables, Steuerzeichen, leer oder 50 KB setzen — umgeht die Client-Regel. Das untergräbt die **Anti-Spoofing-Annahme** (UserChip vertraut auf saubere, eindeutige Handles); zudem koexistieren `Alice` und `alice`, weil der Unique-Index auf `username` raw, der Availability-Check aber auf `lower(username)` läuft. **Kein** Cross-User-Tampering (RLS bindet auf die eigene Zeile).

**Fix:** DB-CHECK + case-insensitiver Unique-Index — oder den Write über einen DEFINER-RPC routen (wie die übrigen gehärteten Writes):
```sql
alter table profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9._-]{3,30}$');
create unique index profiles_username_lower_key on profiles (lower(username));
```

---

### 🟢 L-1 · Kein Längen-Limit auf Freitext-Feldern *(low)*
**Dateien:** `CreateListForm`, `EditableDisplayName`, `ItemNotes`, `lists.ts` — und keine DB-CHECKs

Kein einziges Freitext-Feld (Listenname/-beschreibung, Display-Name, Notiz-Body) hat `maxlength`, Client-Längencheck *oder* DB-Constraint. Mutationen `.trim()`-en nur und lehnen leer ab. **Kein XSS** (Solid escaped, Notes gehen durch `normalizeUrl`) — aber ein Mehr-MB-String in einem geteilten Listennamen/Notiz wird von jedem Co-Member geladen und gerendert → lokalisierte DoS + DB-Bloat. Blast-Radius klein (nur wer eine Liste teilt).

**Fix:** DB-CHECKs (`char_length(name) <= 120`, `display_name <= 80`, `description <= 500`, `body <= 5000`) + spiegelnde `maxlength`-Attribute für UX.

---

### 🟢 L-2 · steam-proxy ist ein unauthentifizierter, ungedrosselter Relay *(low)*
**Datei:** `supabase/functions/steam-proxy/index.ts:32–54` · *(noch nicht deployed — Phase 9)*

**Kein SSRF** — Upstream-Host ist hart auf `store.steampowered.com` gepinnt, Endpoints auf zwei allowlisted (`storesearch`/`appdetails`). Aber: die einzige „Auth" ist der öffentliche Anon-Key, keine `auth.uid()`-Prüfung, keine Rate-Limits. Wer den Anon-Key aus dem Bundle liest (trivial), kann die Funktion unbegrenzt aufrufen → fremde Supabase-Edge-Invocations/Egress (Kosten) + Traffic-Laundering zu Steam.

**Fix vor Deploy:** Im Function-Body `supabase.auth.getUser()` aufrufen und ohne echte User-Session 403; leichtes Rate-Limit/Caching ergänzen.

---

### 🟢 L-3 · TMDB-Token im Client-Bundle *(low — bewusster Trade-off)*
**Datei:** `src/lib/tmdb.ts:19`

`VITE_TMDB_TOKEN` wird durch das `VITE_`-Präfix in das Produktions-Bundle inlined. **Geringer Blast-Radius:** Es ist ein **read-only** v4-API-Token — kein Account-Zugriff, kein Schreibrecht, keine PII. Realistischer Schaden: jemand scraped TMDB auf deinem Rate-Limit → Throttling/Revoke, bis du rotierst.

**Fix (optional, bis Launch):** TMDB wie Steam über eine Edge-Function proxyen (Token server-seitig). Für jetzt akzeptabel — sitzt nur client-seitig, weil TMDB CORS erlaubt, nicht weil es muss.

---

### ⚪ I-1 · Basis-RLS lebt im Schwester-Repo (Logbook), nicht hier *(info)*
**Datei:** `supabase/migrations/20260528200000_nakama_phase3_5_schema.sql`

Die fundamentalen Policies + Helfer (`is_list_member`, `shares_list_with`, Basis-SELECT/INSERT-Policies) liegen nur in `Logbook/supabase/migrations/`. Die Nakama-Migrationen *altern* diese, setzen den Logbook-Layer also voraus. **Keine Live-Lücke** (auf der echten DB ist alles angewandt) — aber ein Reproduzierbarkeits-Risiko: ein frischer Deploy nur aus diesem Repo bricht laut ab (gut), die Sicherheits-Definition ist aber aus keinem Repo allein reviewbar.

**Fix vor Launch:** Live-DB-Policies + Funktionen per `pg_dump --schema-only` in **eine** self-contained Baseline-Migration in diesem Repo snapshotten + Post-Migration-Assertion „RLS aktiv auf allen Nutzertabellen".

---

### ⚪ I-2 · Onboarding-Gate (`/setup`) nur client-seitig *(info)*
**Datei:** `src/routes/index.tsx:39–55`

Der `/setup`-Redirect ist ein reiner Client-`<Navigate>`. Kein RLS/RPC konditioniert irgendeinen Write auf `onboarded_at`. **Keine Sicherheitsrelevanz** — da RLS die echte Grenze ist, gewinnt ein Nutzer durch Überspringen keinerlei Datenzugriff, nur eine unvollständige Profil-UX. Fail-open ist hier korrekt (kein Redirect-Loop). Gelistet, um zu belegen, dass es geprüft wurde.

---

### ⚪ I-3 · Edge-Function CORS `Access-Control-Allow-Origin: *` *(info)*
**Datei:** `supabase/functions/steam-proxy/index.ts:25–30`

Wildcard-CORS. Da nur öffentliche Steam-Daten und keine Credentials reflektiert werden, **kein Datenleck** — verbreitert aber, wer den Abuse-Vektor aus L-2 triggern kann. **Fix:** Origin auf die eigene(n) Produktions-Domain(s) pinnen.

---

## Widerlegte Findings *(Belege für die Audit-Tiefe)*

Diese sahen nach Lücken aus, hielten der Verifikation aber nicht stand:

### ✗ Open Redirect via `?next=` in AuthCallback — *False Positive*
Der Code leitet `next` roh an `navigate()` weiter — sieht nach klassischem Open-Redirect aus. **Aber** Solid Router (0.16.1) neutralisiert die ganze Payload-Klasse:
- `hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i` matcht sowohl `https://evil.com` *als auch* `//evil.com` → `resolvePath` gibt `undefined` → `navigate()` **wirft**, kein Redirect.
- Navigation läuft über `history.pushState`, nicht `window.location` → kann nicht cross-origin gehen und führt kein `javascript:` aus.

Bleibt nur das Umleiten auf *interne* Routen (harmlos). Eine `next`-Validierung wäre nette Defense-in-Depth, aber es gibt **keine** ausnutzbare Lücke.

### ✗ steam-proxy reflektiert Upstream-Status-Code — *False Positive*
Reflektiert nur den HTTP-Status einer einzigen, fest verdrahteten, öffentlichen Steam-API. Keine internen Hostnames/Infos, kein SSRF (Host gepinnt, Endpoints allowlisted). Self-labeled „no action" — kein Sicherheitsproblem.

---

## Empfohlene Fix-Reihenfolge

| # | Finding | Aufwand | Wann |
|---|---|---|---|
| 1 | **M-1** Catalog-RPCs scopen | ~15 min (1 Migration) | vor Launch |
| 2 | **M-2** Handle DB-CHECK + lower-Index | ~10 min (1 Migration) | vor Launch |
| 3 | **L-1** Längen-CHECKs | ~15 min (1 Migration + `maxlength`) | vor Launch |
| 4 | **L-2 / I-3** steam-proxy Auth + CORS-Pin | ~20 min | beim Deploy (Phase 9) |
| 5 | **I-1** Baseline-Migration snapshotten | ~30 min | vor Launch |
| 6 | **L-3** TMDB-Proxy | optional | später |

M-1, M-2 und L-1 sind drei kleine SQL-Migrationen und schließen alles, was vor einem offenen Launch zählt.

---

*Audit-Lauf: 17 Agenten · 6 Dimensionen · adversariell verifiziert · 11 → 9 bestätigt, 2 widerlegt.*
