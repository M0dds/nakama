import { createSignal } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Camera, Loader2 } from "lucide-solid";
import { useToast } from "@/lib/toast";
import {
  uploadListCover,
  setListCover,
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
        <label
          class="absolute inset-0 flex cursor-pointer items-center justify-center text-transparent transition-colors group-hover:bg-black/45 group-hover:text-white"
          classList={{ "bg-black/45 text-white": uploading() }}
          title="Cover ändern"
          aria-label="Cover ändern"
        >
          {uploading() ? (
            <Loader2 class="size-6 animate-spin" strokeWidth={1.75} />
          ) : (
            <Camera class="size-6" strokeWidth={1.75} />
          )}
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            disabled={uploading()}
            onChange={onPick}
          />
        </label>
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
