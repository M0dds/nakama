import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "@/components/Button";

/**
 * Dependency-free circular avatar cropper. Same modal scaffold as
 * MoveItemDialog (two-signal mount/visible, backdrop fade + card opacity on
 * the 500 ms ease-quart curve, Escape/backdrop close, body-scroll lock), with
 * a round viewport the user pans (pointer drag) + zooms (slider) over the
 * picked image. "Speichern" draws the visible region to a square canvas and
 * hands back a JPEG File; the round mask is purely a preview — the Avatar
 * primitive renders every output round anyway.
 *
 * Geometry: `baseScale` is the cover-fit scale (image just fills the
 * viewport); `dispScale = baseScale × zoom`. `offset` is the displayed
 * image's top-left relative to the viewport (≤ 0), clamped so the image
 * always covers. On export, the viewport maps back to a source rect via
 * `dispScale` and is drawn into an OUT×OUT canvas.
 */
const ANIM_MS = 500;
const V = 280; // viewport size (CSS px)
const OUT = 512; // exported square size (device px)

export function AvatarCropDialog(props: {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onCropped: (file: File) => void;
}) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  const [snapUrl, setSnapUrl] = createSignal<string | null>(null);
  const [natural, setNatural] = createSignal<{ w: number; h: number } | null>(
    null,
  );
  const [zoom, setZoom] = createSignal(1);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  let imgRef: HTMLImageElement | undefined;
  let drag: { x: number; y: number; ox: number; oy: number } | null = null;
  let closeTimer: number | null = null;

  const baseScale = () => {
    const n = natural();
    return n ? Math.max(V / n.w, V / n.h) : 1;
  };
  const dispW = () => {
    const n = natural();
    return n ? n.w * baseScale() * zoom() : V;
  };
  const dispH = () => {
    const n = natural();
    return n ? n.h * baseScale() * zoom() : V;
  };
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(V - dispW(), x)),
    y: Math.min(0, Math.max(V - dispH(), y)),
  });

  createEffect(() => {
    if (props.open && props.file) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setSnapUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(props.file!);
      });
      setNatural(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    } else {
      setVisible(false);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        setSnapUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        closeTimer = null;
      }, ANIM_MS);
    }
  });

  onCleanup(() => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    const u = snapUrl();
    if (u) URL.revokeObjectURL(u);
  });

  // Body-scroll lock + Escape, gated on `mounted` (survives the close anim).
  createEffect(() => {
    if (!mounted()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    });
  });

  const onImgLoad = () => {
    const el = imgRef;
    if (!el) return;
    const n = { w: el.naturalWidth, h: el.naturalHeight };
    setNatural(n);
    const bs = Math.max(V / n.w, V / n.h);
    const dW = n.w * bs;
    const dH = n.h * bs;
    setOffset({ x: (V - dW) / 2, y: (V - dH) / 2 }); // centered
  };

  const onZoom = (z: number) => {
    const n = natural();
    if (!n) {
      setZoom(z);
      return;
    }
    // Keep the image point under the viewport centre fixed across the zoom.
    const o = offset();
    const fx = (V / 2 - o.x) / dispW();
    const fy = (V / 2 - o.y) / dispH();
    setZoom(z);
    setOffset(clamp(V / 2 - fx * dispW(), V / 2 - fy * dispH()));
  };

  const onPointerDown = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = offset();
    drag = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    setOffset(clamp(drag.ox + (e.clientX - drag.x), drag.oy + (e.clientY - drag.y)));
  };
  const onPointerUp = () => {
    drag = null;
  };

  const save = () => {
    const el = imgRef;
    const n = natural();
    if (!el || !n) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ds = baseScale() * zoom();
    const o = offset();
    const sSize = V / ds;
    ctx.drawImage(el, -o.x / ds, -o.y / ds, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        props.onCropped(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <Show when={mounted()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profilbild zuschneiden"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <button
          type="button"
          aria-label="Abbrechen"
          onClick={props.onClose}
          class={`absolute inset-0 transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible()
              ? "bg-black/50 backdrop-blur-sm"
              : "bg-black/0 backdrop-blur-none"
          }`}
        />
        <div
          class={`relative flex w-full max-w-sm flex-col overflow-hidden rounded-sm bg-bg shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible() ? "opacity-100" : "opacity-0"
          }`}
        >
          <header class="flex items-start justify-between gap-3 border-b border-rule px-6 pb-4 pt-5">
            <div class="flex items-center gap-2">
              <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
              <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                Zuschnitt
              </span>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Schließen"
              class="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <div class="flex flex-col items-center gap-5 px-6 py-6">
            {/* Round viewport — pan by dragging. A faint ring marks the crop. */}
            <div
              class="relative cursor-grab touch-none overflow-hidden rounded-full bg-surface ring-1 ring-border active:cursor-grabbing"
              style={{ width: `${V}px`, height: `${V}px` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <Show when={snapUrl()}>
                {(url) => (
                  <img
                    ref={imgRef}
                    src={url()}
                    alt=""
                    draggable={false}
                    onLoad={onImgLoad}
                    class="pointer-events-none absolute max-w-none select-none"
                    style={{
                      width: `${dispW()}px`,
                      height: `${dispH()}px`,
                      left: `${offset().x}px`,
                      top: `${offset().y}px`,
                    }}
                  />
                )}
              </Show>
            </div>

            {/* Zoom */}
            <label class="flex w-full items-center gap-3">
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Zoom
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom()}
                onInput={(e) => onZoom(parseFloat(e.currentTarget.value))}
                class="h-1 flex-1 cursor-pointer"
                style={{ "accent-color": "var(--accent)" }}
                aria-label="Zoom"
              />
            </label>

            <p class="text-mini text-text-muted">
              Ziehen zum Verschieben, Regler zum Zoomen.
            </p>
          </div>

          <footer class="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={props.onClose}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={save}>
              Speichern
            </Button>
          </footer>
        </div>
      </div>
    </Show>
  );
}
