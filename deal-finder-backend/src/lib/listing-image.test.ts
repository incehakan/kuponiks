import { describe, expect, it } from "vitest";
import {
  isPlaceholderListingImage,
  normalizeListingImageUrl,
  pickBestListingImageUrl,
  toPublicListingImageUrl,
} from "./listing-image.js";

describe("listing image URL hygiene", () => {
  it("normalizes protocol-relative URLs to https", () => {
    expect(
      normalizeListingImageUrl("//arbimg1.mncdn.com/ilanfotograflari/abc.jpg"),
    ).toBe("https://arbimg1.mncdn.com/ilanfotograflari/abc.jpg");
  });

  it("upgrades http to https", () => {
    expect(
      normalizeListingImageUrl("http://arbimg1.mncdn.com/photo.jpg"),
    ).toBe("https://arbimg1.mncdn.com/photo.jpg");
  });

  it("rejects Arabam noImage thumbnails", () => {
    const url =
      "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg";
    expect(isPlaceholderListingImage(url)).toBe(true);
    expect(toPublicListingImageUrl(url)).toBeNull();
  });

  it("prefers a real candidate over noImage src", () => {
    expect(
      pickBestListingImageUrl([
        "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
        "https://arbimg1.mncdn.com/ilanfotograflari/42058894/1.jpg",
      ]),
    ).toBe("https://arbimg1.mncdn.com/ilanfotograflari/42058894/1.jpg");
  });

  it("does not invent relative paths without a base", () => {
    expect(normalizeListingImageUrl("/ilanfotograflari/x.jpg")).toBeNull();
  });
});
