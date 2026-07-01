import { createSignal } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Camera, Dices, Loader2, RotateCcw } from "lucide-solid";
import { Show } from "solid-js";
import { useToast } from "@/lib/toast";
import {
  uploadListCover,
  setListCover,
  setListCoverSeed,
  listQueryKey,
  listsQueryKey,
  MAX_COVER_BYTES,
  type ListSummary,
} from "@/lib/queries/lists";
import { ListCover } from "@/components/GeneratedCover";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";

/**
 * Square list cover with click-to-change upload. Mirrors EditableAvatar but
 * square + cover-scoped: a pick crops to a square JPEG, uploads to the
 * `list-covers` bucket, and writes lists.cover_url (owner only — the parent
 * gates rendering on isOwner; storage + the lists update are both owner-scoped
 * server-side as defense in depth). Optimistic object-URL preview swaps in on
 * pick, replaced by the real URL on success or rolled back on error. Patches
 * both the detail (listQueryKey) and overview (listsQueryKey) caches so the
 * cover updates everywhere without a refetch.
 */
export function EditableListCover(props: {
  listId: string;
  shortCode: string;
  coverUrl: string | null;
  coverSeed: number;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  const [cropOpen, setCropOpen] = createSignal(false);

  const detailKey = () => listQueryKey(props.shortCode);

  /** Patch coverUrl in both the single-list detail cache and the overview. */
  const patchCaches = (coverUrl: string | null) => {
    queryClient.setQueryData<ListSummary | null>(detailKey(), (l) =>
      l ? { ...l, coverUrl } : l,
    );
    queryClient.setQueryData<{ private: ListSummary[]; shared: ListSummary[] }>(
      listsQueryKey,
      (state) => {
        if (!state) return state;
        const patch = (l: ListSummary) =>
          l.id === props.listId ? { ...l, coverUrl } : l;
        return { private: state.private.map(patch), shared: state.shared.map(patch) };
      },
    );
  };

  /** Patch coverSeed in both caches (for reroll → new generated look). */
  const patchSeed = (coverSeed: number) => {
    queryClient.setQueryData<ListSummary | null>(detailKey(), (l) =>
      l ? { ...l, coverSeed } : l,
    );
    queryClient.setQueryData<{ private: ListSummary[]; shared: ListSummary[] }>(
      listsQueryKey,
      (state) => {
        if (!state) return state;
        const patch = (l: ListSummary) =>
          l.id === props.listId ? { ...l, coverSeed } : l;
        return { private: state.private.map(patch), shared: state.shared.map(patch) };
      },
    );
  };

  const mutation = createMutation(() => ({
    mutationFn: async (file: File) => {
      const url = await uploadListCover({ listId: props.listId, file });
      const res = await setListCover({ listId: props.listId, coverUrl: url });
      if (res.blocked) throw new Error("blocked");
      return url;
    },
    onMutate: (file: File) => {
      const preview = URL.createObjectURL(file);
      const prevDetail = queryClient.getQueryData<ListSummary | null>(detailKey());
      patchCaches(preview);
      return { prevDetail, preview };
    },
    onError: (_e, _file, ctx) => {
      if (ctx?.prevDetail !== undefined)
        queryClient.setQueryData(detailKey(), ctx.prevDetail);
      queryClient.invalidateQueries({ queryKey: listsQueryKey });
      if (ctx?.preview) URL.revokeObjectURL(ctx.preview);
      toast("Cover konnte nicht hochgeladen werden.");
    },
    onSuccess: (url, _file, ctx) => {
      patchCaches(url);
      if (ctx?.preview) URL.revokeObjectURL(ctx.preview);
      toast("Cover aktualisiert.", { icon: Camera });
    },
    onSettled: () => setUploading(false),
  }));

  // Reset to the generated default: clears cover_url (keeps cover_seed, so the
  // SAME generated pattern the list had before the upload comes back — F4 design
  // call). Optimistic null patch, rolled back on RLS block / error.
  const resetMutation = createMutation(() => ({
    mutationFn: async () => {
      const res = await setListCover({ listId: props.listId, coverUrl: null });
      if (res.blocked) throw new Error("blocked");
    },
    onMutate: () => {
      const prevDetail = queryClient.getQueryData<ListSummary | null>(detailKey());
      patchCaches(null);
      return { prevDetail };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevDetail !== undefined)
        queryClient.setQueryData(detailKey(), ctx.prevDetail);
      queryClient.invalidateQueries({ queryKey: listsQueryKey });
      toast("Cover konnte nicht zurückgesetzt werden.");
    },
    onSuccess: () => toast("Cover zurückgesetzt.", { icon: RotateCcw }),
  }));

  // Reroll the generated cover: write a fresh random cover_seed → a new look.
  // The seed is generated in the click handler and passed in, so the optimistic
  // preview and the server write share the SAME seed (no flip on settle).
  const rerollMutation = createMutation(() => ({
    mutationFn: async (seed: number) => {
      const res = await setListCoverSeed({ listId: props.listId, coverSeed: seed });
      if (res.blocked) throw new Error("blocked");
    },
    onMutate: (seed: number) => {
      const prevDetail = queryClient.getQueryData<ListSummary | null>(detailKey());
      patchSeed(seed);
      return { prevDetail };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevDetail !== undefined)
        queryClient.setQueryData(detailKey(), ctx.prevDetail);
      queryClient.invalidateQueries({ queryKey: listsQueryKey });
      toast("Cover konnte nicht neu gewürfelt werden.");
    },
    onSuccess: () => toast("Neues Cover gewürfelt.", { icon: Dices }),
  }));

  const doReroll = () =>
    rerollMutation.mutate(Math.floor(Math.random() * 2_000_000_000));

  const onPick = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Bitte eine Bilddatei wählen.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      toast("Bild ist zu groß (max. 10 MB).");
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const onCropped = (cropped: File) => {
    setCropOpen(false);
    setUploading(true);
    mutation.mutate(cropped);
  };

  return (
    <>
      <div class="group relative aspect-square w-full overflow-hidden">
        <ListCover
          coverUrl={props.coverUrl}
          seed={props.coverSeed}
          alt=""
          class="size-full"
        />

        {/* Hover overlay, revealed on cover-hover. Two stacked zones — TOP
            uploads a custom image; BOTTOM either RESETS to the generated cover
            (when a custom one is set) or REROLLS the generated cover to a fresh
            look (when none is). A base dim shows both, the hovered zone deepens
            so the target is unambiguous. Stays visible while any op is pending
            so the spinner shows. */}
        <div
          class="pointer-events-none absolute inset-0 flex flex-col opacity-0 transition-opacity group-hover:opacity-100"
          classList={{
            "opacity-100":
              uploading() || resetMutation.isPending || rerollMutation.isPending,
          }}
        >
          <div class="pointer-events-none absolute inset-0 bg-black/40" aria-hidden />
          <label
            class="pointer-events-auto relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-white transition-colors hover:bg-black/30"
            title="Neues Cover hochladen"
            aria-label="Neues Cover hochladen"
          >
            {uploading() ? (
              <Loader2 class="size-5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Camera class="size-5" strokeWidth={1.75} aria-hidden />
            )}
            <span class="font-mono text-mini uppercase tracking-wider">
              Hochladen
            </span>
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              disabled={uploading() || resetMutation.isPending}
              onChange={onPick}
            />
          </label>
          <Show when={props.coverUrl}>
            <button
              type="button"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || uploading()}
              class="pointer-events-auto relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-white transition-colors hover:bg-black/30 disabled:cursor-default"
              title="Auf generiertes Cover zurücksetzen"
              aria-label="Auf generiertes Cover zurücksetzen"
            >
              {resetMutation.isPending ? (
                <Loader2 class="size-5 animate-spin" strokeWidth={1.75} />
              ) : (
                <RotateCcw class="size-5" strokeWidth={1.75} aria-hidden />
              )}
              <span class="font-mono text-mini uppercase tracking-wider">
                Zurücksetzen
              </span>
            </button>
          </Show>
          <Show when={!props.coverUrl}>
            <button
              type="button"
              onClick={doReroll}
              disabled={rerollMutation.isPending || uploading()}
              class="pointer-events-auto relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-white transition-colors hover:bg-black/30 disabled:cursor-default"
              title="Neues Cover würfeln"
              aria-label="Neues Cover würfeln"
            >
              {rerollMutation.isPending ? (
                <Loader2 class="size-5 animate-spin" strokeWidth={1.75} />
              ) : (
                <Dices class="size-5" strokeWidth={1.75} aria-hidden />
              )}
              <span class="font-mono text-mini uppercase tracking-wider">
                Neu würfeln
              </span>
            </button>
          </Show>
        </div>
      </div>

      <AvatarCropDialog
        file={pendingFile()}
        open={cropOpen()}
        onClose={() => setCropOpen(false)}
        onCropped={onCropped}
        shape="square"
      />
    </>
  );
}
