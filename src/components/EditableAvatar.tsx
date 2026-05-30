import { createSignal } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Camera, Loader2 } from "lucide-solid";
import { useToast } from "@/lib/toast";
import {
  uploadAvatar,
  updateAvatarUrl,
  myProfileKey,
  MAX_AVATAR_BYTES,
  type MyProfile,
} from "@/lib/queries/profile";
import { Avatar } from "@/components/Avatar";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";

/**
 * Avatar with click-to-change upload. Wraps the read-only Avatar primitive in
 * a label/file-input overlay: hover dims the round image + shows a camera, a
 * pick uploads to the `avatars` bucket (migration 20260530150000) and writes
 * the public URL into profiles.avatar_url.
 *
 * Optimistic: an object-URL preview swaps in instantly on pick, replaced by
 * the real URL on success or rolled back on error. The round shape is the
 * sanctioned identity exception to hard corners (mirrors the Avatar primitive
 * + BottomNav pill).
 */
export function EditableAvatar(props: {
  userId: string;
  handle: string;
  avatarUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  const [cropOpen, setCropOpen] = createSignal(false);
  const key = () => myProfileKey(props.userId);

  const mutation = createMutation(() => ({
    mutationFn: async (file: File) => {
      const url = await uploadAvatar({ userId: props.userId, file });
      const res = await updateAvatarUrl({ userId: props.userId, avatarUrl: url });
      if (res.blocked) throw new Error("blocked");
      return url;
    },
    onMutate: (file: File) => {
      const preview = URL.createObjectURL(file);
      const prev = queryClient.getQueryData<MyProfile | null>(key());
      queryClient.setQueryData<MyProfile | null>(key(), (p) =>
        p ? { ...p, avatarUrl: preview } : p,
      );
      return { prev, preview };
    },
    onError: (_e, _file, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key(), ctx.prev);
      if (ctx?.preview) URL.revokeObjectURL(ctx.preview);
      toast("Bild konnte nicht hochgeladen werden.");
    },
    onSuccess: (url, _file, ctx) => {
      queryClient.setQueryData<MyProfile | null>(key(), (p) =>
        p ? { ...p, avatarUrl: url } : p,
      );
      if (ctx?.preview) URL.revokeObjectURL(ctx.preview);
      toast("Profilbild aktualisiert.", { icon: Camera });
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
    if (file.size > MAX_AVATAR_BYTES) {
      toast("Bild ist zu groß (max. 10 MB).");
      return;
    }
    // Pick → crop → upload. The cropper hands back a small square JPEG.
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
      <div class="group relative size-16 shrink-0">
      <Avatar handle={props.handle} avatarUrl={props.avatarUrl} size={64} />
      <label
        class="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full text-transparent transition-colors group-hover:bg-black/45 group-hover:text-white"
        classList={{ "bg-black/45 text-white": uploading() }}
        title="Profilbild ändern"
        aria-label="Profilbild ändern"
      >
        {uploading() ? (
          <Loader2 class="size-5 animate-spin" strokeWidth={1.75} />
        ) : (
          <Camera class="size-5" strokeWidth={1.75} />
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
      />
    </>
  );
}
