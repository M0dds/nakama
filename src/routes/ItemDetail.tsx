import { Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import { itemQueryOptions } from "@/lib/queries/items";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";

/**
 * /item/:id — Item-Detail. Layout:
 *
 *   Section 01 (left 2/3, "Episoden"):
 *     Fortschritt 0 / —              (progress bar)
 *     ──────────────────────────
 *     [latest 12 episodes — title + meta per row]
 *     (placeholder until episode-layer lands)
 *
 *   Section 02 (right 1/3, "Details"):
 *     ┌────────┐
 *     │ cover  │   (no accent plate — sits flat in hairline border)
 *     └────────┘
 *     ──────────────
 *     Typ / Format / Quelle
 *
 * Progress + episode-list are placeholders pending the Episode-Layer commit.
 * The cover, type/source meta, page chrome are real and live now.
 */
export default function ItemDetail() {
  const params = useParams<{ id: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const item = createQuery(() => ({
    ...itemQueryOptions(params.id),
    enabled: !!auth.user() && !!params.id,
  }));

  // Item resolved-but-null → not visible / not found / bad uuid. Bounce.
  if (!item.isLoading && item.data === null) {
    navigate("/lists", { replace: true });
  }

  const dtClass =
    "font-mono text-mini uppercase tracking-wider text-text-muted";

  return (
    <main class="w-full">
      <PageHeader
        kicker={
          <Show
            when={item.data}
            fallback={
              <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                …
              </span>
            }
          >
            {(data) => (
              <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                {typeLabelCaps(data().type)}
              </span>
            )}
          </Show>
        }
        title={
          <Show when={item.data} fallback={<span>…</span>}>
            {(data) => <span>{data().title}</span>}
          </Show>
        }
        backHref="/lists"
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Section 01 — Episode-Listing */}
        <div class="md:w-2/3">
          <BentoModule label="Episoden" number="01">
            <Show
              when={item.data}
              fallback={
                <p class="text-body text-text-muted">Lade …</p>
              }
            >
              {/* Placeholder progress — wires up with episode-layer. */}
              <ProgressBar watched={0} total={0} />
              <p class="mt-6 text-body text-text-muted">
                Episoden folgen — Episode-Layer in Arbeit.
              </p>
            </Show>
          </BentoModule>
        </div>

        {/* Section 02 — Cover + Details */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Details" number="02">
            <Show
              when={item.data}
              fallback={
                <p class="text-body text-text-muted">Lade …</p>
              }
            >
              {(data) => (
                <>
                  <Cover
                    coverUrl={data().coverUrl}
                    fallbackLetter={data().type === "manga" ? "M" : "A"}
                  />
                  <dl class="space-y-3 border-t border-border pt-5 text-body">
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={dtClass}>Typ</dt>
                      <dd class="text-text">{typeLabel(data().type)}</dd>
                    </div>
                    <Show when={metaString(data().metadata, "format")}>
                      {(fmt) => (
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class={dtClass}>Format</dt>
                          <dd class="text-text">{fmt()}</dd>
                        </div>
                      )}
                    </Show>
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={`${dtClass} shrink-0`}>Quelle</dt>
                      <dd class="min-w-0 truncate text-right font-mono text-mini uppercase tracking-wider text-text">
                        {data().source} · {data().sourceId}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </Show>
          </BentoModule>
        </div>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Local primitives
// ──────────────────────────────────────────────────────────────────────

/**
 * Cover — flat, hairline-bordered, hard corners. Sits at the top of the
 * Details column and uses the column's full reading width (cap at 220 px so
 * it doesn't grow ridiculous on very wide layouts). No accent, no shadow —
 * the cover is the visual anchor by virtue of being the only image on the
 * page, not by chrome.
 */
function Cover(props: { coverUrl: string | null; fallbackLetter: string }) {
  return (
    <div class="mb-5 aspect-[2/3] w-full max-w-[220px] overflow-hidden border border-border bg-bg">
      <Show
        when={props.coverUrl}
        fallback={
          <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
            {props.fallbackLetter}
          </div>
        }
      >
        <img
          src={props.coverUrl!}
          alt=""
          class="size-full object-cover"
          loading="lazy"
        />
      </Show>
    </div>
  );
}

/**
 * Thin progress strip — hairline track (border-tier) with accent fill. Mono
 * caption row above. When total is unknown (Episode-Layer not yet wired),
 * `total` is 0; we show "—" instead of "0" and render an empty track.
 */
function ProgressBar(props: { watched: number; total: number }) {
  const pct = () =>
    props.total > 0 ? Math.round((props.watched / props.total) * 100) : 0;
  return (
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Fortschritt
        </span>
        <span class="font-mono text-mini tabular-nums text-text">
          {props.watched}/{props.total > 0 ? props.total : "—"}
          <Show when={props.total > 0}>
            <span class="text-text-muted"> · {pct()} %</span>
          </Show>
        </span>
      </div>
      <div
        class="mt-2 h-1 w-full overflow-hidden bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={props.total || undefined}
        aria-valuenow={props.watched}
      >
        <div
          class="h-full bg-accent transition-all duration-300 ease-quart"
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function typeLabel(type: string): string {
  switch (type) {
    case "anime":
      return "Anime";
    case "manga":
      return "Manga";
    case "series":
      return "Serie";
    case "movie":
      return "Film";
    case "game":
      return "Spiel";
    default:
      return type;
  }
}

function typeLabelCaps(type: string): string {
  return typeLabel(type).toUpperCase();
}

function metaString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const v = metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
