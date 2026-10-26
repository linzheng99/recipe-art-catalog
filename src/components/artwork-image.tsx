import { useState } from "react";
import { ImageOff } from "lucide-react";
import { imageURL } from "@/lib/catalog";
import type { Artwork } from "@/lib/catalog";

export function ArtworkImage({
  item,
  size = "256",
  eager = false,
}: {
  item: Artwork;
  size?: "256" | "512";
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span
      className="image-fallback"
      role="img"
      aria-label={`${item.name}（图片暂未加载）`}
    >
      <ImageOff aria-hidden="true" />
      图片暂未加载
    </span>
  ) : (
    <img
      src={imageURL(item, size)}
      alt={item.name}
      width={Number(size)}
      height={Number(size)}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
