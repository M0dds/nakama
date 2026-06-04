import {
  createEffect,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, ImagePlus, Loader2, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import {
  checkUsernameAvailable,
  completeOnboarding,
  myProfileKey,
  myProfileOptions,
  setUsername,
  updateAvatarUrl,
  updateDisplayName,
  uploadAvatar,
  type UsernameCheck,
} from "@/lib/queries/profile";
import { Avatar } from "@/components/Avatar";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/Button";
import { InstallGuide } from "@/components/InstallGuide";

const STEPS = 4;
const HANDLE_DEBOUNCE = 350;

/**
 * First-login setup — a 4-step wizard (Identität → Avatar → Theme → App
 * installieren) shown once, before the app, while `profiles.onboarded_at` is
 * null (the AppLayout gate routes here). Focal screen like /login: no shell.
 * Reuses the real write paths (uploadAvatar, updateDisplayName, setUsername) +
 * AvatarCropDialog + ThemeSwitcher; the theme persists immediately, identity
 * commits on leaving step 1, and "Los geht's" (step 4, after the optional
 * PWA install nudge) stamps onboarded_at and drops the user into Home.
 *
 * Steps slide in right→left with a slight overshoot (back-out easing) — forward
 * enters from the right, Zurück from the left. Skipped under reduced motion.
 */
export default function Setup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Inline errors, not toasts: /setup lives outside the AppShell, so there's
  // no ToastProvider in the tree here.
  const [error, setError] = createSignal<string | null>(null);

  const profileQ = createQuery(() => ({
    ...myProfileOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  const [step, setStep] = createSignal(1);
  let dir = 1; // 1 = forward (enter from right), -1 = back (enter from left)

  const [displayName, setDisplayName] = createSignal("");
  const [handle, setHandle] = createSignal("");
  const [avatarUrl, setAvatarUrl] = createSignal<string | null>(null);
  const [check, setCheck] = createSignal<UsernameCheck | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);

  // Seed the drafts from the (trigger-derived) profile once it loads.
  let seeded = false;
  createEffect(() => {
    const p = profileQ.data;
    if (!p || seeded) return;
    seeded = true;
    setDisplayName(p.displayName ?? "");
    setHandle(p.username ?? "");
    setAvatarUrl(p.avatarUrl);
    setCheck({ available: true }); // the current handle is trivially mine
  });

  const currentUsername = () => profileQ.data?.username ?? "";
  const normHandle = () => handle().trim().replace(/^@/, "").toLowerCase();
  const handleOk = () => check()?.available === true;

  // ── Step transition (slide + slight bounce) ───────────────────────────
  let cardEl: HTMLDivElement | undefined;
  const reduce = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  createEffect(() => {
    step(); // track
    if (!cardEl || reduce()) return;
    cardEl.animate(
      [
        { transform: `translateX(${dir * 40}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 380, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
  });

  const go = (next: number) => {
    dir = next >= step() ? 1 : -1;
    setStep(Math.max(1, Math.min(STEPS, next)));
  };

  // ── Avatar ─────────────────────────────────────────────────────────────
  let fileInput: HTMLInputElement | undefined;
  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  const [cropOpen, setCropOpen] = createSignal(false);

  const onFilePick = (e: Event & { currentTarget: HTMLInputElement }) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = ""; // allow re-picking the same file
    if (f) {
      setPendingFile(f);
      setCropOpen(true);
    }
  };

  const onCropped = async (file: File) => {
    setCropOpen(false);
    const userId = auth.user()?.id;
    if (!userId) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadAvatar({ userId, file });
      const res = await updateAvatarUrl({ userId, avatarUrl: url });
      if (res.blocked) throw new Error("blocked");
      setAvatarUrl(url);
      void queryClient.invalidateQueries({ queryKey: myProfileKey(userId) });
    } catch {
      setError("Avatar konnte nicht gespeichert werden.");
    } finally {
      setUploading(false);
    }
  };

  // ── Handle live-check ───────────────────────────────────────────────────
  let debTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => debTimer && clearTimeout(debTimer));

  const onHandleInput = (v: string) => {
    setHandle(v);
    setCheck(null);
    if (debTimer) clearTimeout(debTimer);
    const norm = v.trim().replace(/^@/, "").toLowerCase();
    if (norm === currentUsername()) {
      setChecking(false);
      setCheck({ available: true });
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(norm)) {
      setChecking(false);
      setCheck({ available: false, error: "invalid" });
      return;
    }
    setChecking(true);
    debTimer = setTimeout(async () => {
      try {
        setCheck(await checkUsernameAvailable(norm));
      } catch {
        setCheck(null);
      } finally {
        setChecking(false);
      }
    }, HANDLE_DEBOUNCE);
  };

  // ── Commits ──────────────────────────────────────────────────────────────
  const commitIdentity = async () => {
    if (!handleOk() || committing()) return;
    const userId = auth.user()?.id;
    if (!userId) return;
    setError(null);
    setCommitting(true);
    try {
      await updateDisplayName({
        userId,
        displayName: displayName().trim() || null,
      });
      if (normHandle() !== currentUsername()) {
        const res = await setUsername({ userId, username: normHandle() });
        if (!res.ok) {
          setCheck({
            available: false,
            error: res.error === "taken" ? "taken" : "invalid",
          });
          return;
        }
      }
      void queryClient.invalidateQueries({ queryKey: myProfileKey(userId) });
      go(2);
    } catch {
      setError("Konnte nicht gespeichert werden — nochmal versuchen?");
    } finally {
      setCommitting(false);
    }
  };

  const finish = async () => {
    if (committing()) return;
    const userId = auth.user()?.id;
    if (!userId) return;
    setError(null);
    setCommitting(true);
    try {
      await completeOnboarding(userId);
      await queryClient.invalidateQueries({ queryKey: myProfileKey(userId) });
      navigate("/", { replace: true });
    } catch {
      setError("Konnte nicht abgeschlossen werden — nochmal versuchen?");
      setCommitting(false);
    }
  };

  const handleHint = () => {
    const c = check();
    if (checking()) return { text: "Prüfe …", tone: "muted" as const };
    if (!c) return null;
    if (c.available) return { text: "frei", tone: "ok" as const };
    if (c.error === "taken") return { text: "schon vergeben", tone: "bad" as const };
    return { text: "3–30 Zeichen: a–z, 0–9, . _ -", tone: "bad" as const };
  };

  return (
    <Show when={!profileQ.isLoading} fallback={null}>
      <Show
        when={profileQ.data && !profileQ.data.onboardedAt}
        fallback={<Navigate href="/" />}
      >
        <main class="flex min-h-svh items-center justify-center px-6 py-12">
          <div class="w-full max-w-sm">
            {/* Progress header */}
            <header class="mb-8 flex items-center justify-center gap-2.5">
              <span aria-hidden class="size-2.5 rounded-full bg-accent" />
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Schritt {step()} / {STEPS}
              </span>
            </header>

            {/* Animated step card */}
            <div ref={cardEl!} class="min-h-[18rem]">
              <Switch>
                {/* ── Step 2 · Avatar ── */}
                <Match when={step() === 2}>
                  <div class="text-center">
                    <h1 class="text-heading font-medium tracking-tight text-text">
                      Gib dir ein Gesicht
                    </h1>
                    <p class="mx-auto mt-2 max-w-xs text-body text-text-muted">
                      Ein Profilbild — oder klick einfach auf Weiter und hol's
                      später im Profil nach.
                    </p>
                    <div class="mt-8 flex flex-col items-center gap-4">
                      <Avatar
                        handle={handle() || "?"}
                        avatarUrl={avatarUrl()}
                        size={96}
                      />
                      <input
                        ref={fileInput!}
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onChange={onFilePick}
                      />
                      <Button
                        variant="secondary"
                        disabled={uploading()}
                        onClick={() => fileInput?.click()}
                        class="inline-flex items-center gap-2"
                      >
                        <Show
                          when={!uploading()}
                          fallback={<Loader2 class="size-4 animate-spin" />}
                        >
                          <ImagePlus class="size-4" strokeWidth={1.75} />
                        </Show>
                        {avatarUrl() ? "Anderes Bild" : "Bild wählen"}
                      </Button>
                    </div>
                  </div>
                </Match>

                {/* ── Step 1 · Identity ── */}
                <Match when={step() === 1}>
                  <div>
                    <h1 class="text-center text-heading font-medium tracking-tight text-text">
                      Willkommen bei Nakama
                    </h1>
                    <p class="mx-auto mt-2 max-w-xs text-center text-body text-text-muted">
                      Wie sollen dich andere sehen? Der Anzeigename steht
                      überall, der @handle ist eindeutig.
                    </p>
                    <div class="mt-8 space-y-4">
                      <label class="block">
                        <span class="mb-1.5 block font-mono text-mini uppercase tracking-wider text-text-muted">
                          Anzeigename
                        </span>
                        <input
                          type="text"
                          value={displayName()}
                          onInput={(e) => setDisplayName(e.currentTarget.value)}
                          placeholder="Johann"
                          maxlength="40"
                          class="w-full rounded-sm border border-border bg-bg px-3 py-2 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-accent"
                        />
                      </label>
                      <label class="block">
                        <span class="mb-1.5 block font-mono text-mini uppercase tracking-wider text-text-muted">
                          @handle
                        </span>
                        <div class="relative">
                          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted">
                            @
                          </span>
                          <input
                            type="text"
                            value={handle()}
                            onInput={(e) => onHandleInput(e.currentTarget.value)}
                            placeholder="jm"
                            maxlength="30"
                            autocapitalize="none"
                            autocomplete="off"
                            spellcheck={false}
                            class="w-full rounded-sm border border-border bg-bg py-2 pl-7 pr-9 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-accent"
                          />
                          <Show when={handleHint()}>
                            {(h) => (
                              <span class="absolute right-3 top-1/2 -translate-y-1/2">
                                <Switch>
                                  <Match when={h().tone === "ok"}>
                                    <Check
                                      class="size-4 text-accent"
                                      strokeWidth={2}
                                    />
                                  </Match>
                                  <Match when={h().tone === "bad"}>
                                    <X class="size-4 text-text-muted" strokeWidth={2} />
                                  </Match>
                                  <Match when={h().tone === "muted"}>
                                    <Loader2 class="size-4 animate-spin text-text-muted" />
                                  </Match>
                                </Switch>
                              </span>
                            )}
                          </Show>
                        </div>
                        <Show when={handleHint()}>
                          {(h) => (
                            <span
                              class="mt-1.5 block font-mono text-mini"
                              classList={{
                                "text-accent": h().tone === "ok",
                                "text-text-muted": h().tone !== "ok",
                              }}
                            >
                              {h().text}
                            </span>
                          )}
                        </Show>
                      </label>
                    </div>
                  </div>
                </Match>

                {/* ── Step 3 · Theme ── */}
                <Match when={step() === 3}>
                  <div>
                    <h1 class="text-center text-heading font-medium tracking-tight text-text">
                      Such dir einen Look aus
                    </h1>
                    <p class="mx-auto mt-2 max-w-xs text-center text-body text-text-muted">
                      Wähl ein Theme und den Hell-/Dunkel-Modus — jederzeit im
                      Profil änderbar.
                    </p>
                    <div class="mt-8">
                      <ThemeSwitcher fillMode />
                    </div>
                  </div>
                </Match>

                {/* ── Step 4 · App installieren ── */}
                <Match when={step() === 4}>
                  <InstallGuide />
                </Match>
              </Switch>
            </div>

            <Show when={error()}>
              <p role="status" class="mt-6 text-center text-body text-accent">
                {error()}
              </p>
            </Show>

            {/* Footer controls */}
            <div class="mt-6 flex items-center justify-between gap-3">
              {/* Empty spacer on step 1 (no back) keeps "Weiter" right-aligned.
                  No separate "skip" — the avatar is optional, so "Weiter"
                  without a picture IS the skip. */}
              <Show when={step() > 1} fallback={<span />}>
                <Button variant="ghost" onClick={() => go(step() - 1)}>
                  Zurück
                </Button>
              </Show>

              <Switch>
                <Match when={step() === 1}>
                  <Button
                    variant="primary"
                    disabled={!handleOk() || checking() || committing()}
                    onClick={commitIdentity}
                  >
                    Weiter
                  </Button>
                </Match>
                <Match when={step() === 2}>
                  <Button variant="primary" onClick={() => go(3)}>
                    Weiter
                  </Button>
                </Match>
                <Match when={step() === 3}>
                  <Button variant="primary" onClick={() => go(4)}>
                    Weiter
                  </Button>
                </Match>
                <Match when={step() === 4}>
                  <Button
                    variant="primary"
                    disabled={committing()}
                    onClick={finish}
                  >
                    {committing() ? "Moment …" : "Los geht's"}
                  </Button>
                </Match>
              </Switch>
            </div>
          </div>

          <AvatarCropDialog
            file={pendingFile()}
            open={cropOpen()}
            onClose={() => setCropOpen(false)}
            onCropped={onCropped}
          />
        </main>
      </Show>
    </Show>
  );
}
