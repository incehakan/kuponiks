import { describe, expect, it } from "vitest";
import {
  isPlaceholderListingImage,
  mergeListingImageUrl,
  normalizeListingImageUrl,
  pickBestListingImageUrl,
  pickBestSrcsetCandidate,
  preferMobileListingImageUrl,
  toPublicListingImageUrl,
  toStoredListingImageUrl,
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

  it("rejects data and javascript URIs", () => {
    expect(normalizeListingImageUrl("data:image/png;base64,aaa")).toBeNull();
    expect(normalizeListingImageUrl("javascript:alert(1)")).toBeNull();
  });

  it("completes relative URL only with a deterministic base", () => {
    expect(normalizeListingImageUrl("/ilanfotograflari/x.jpg")).toBeNull();
    expect(
      normalizeListingImageUrl(
        "/ilanfotograflari/x.jpg",
        "https://www.arabam.com",
      ),
    ).toBe("https://www.arabam.com/ilanfotograflari/x.jpg");
  });

  it("rejects Arabam noImage thumbnails and chrome assets", () => {
    const url =
      "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg";
    expect(isPlaceholderListingImage(url)).toBe(true);
    expect(toPublicListingImageUrl(url)).toBeNull();
    expect(
      isPlaceholderListingImage(
        "https://arbimg1.mncdn.com/assets2/dist/img/arabam-logo.png",
      ),
    ).toBe(true);
  });

  it("prefers a real candidate over noImage src", () => {
    expect(
      pickBestListingImageUrl([
        "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
        "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_580x435.jpg",
      ]),
    ).toBe(
      "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_580x435.jpg",
    );
  });

  it("picks a mid-size srcset candidate instead of 160w", () => {
    expect(
      pickBestSrcsetCandidate(
        "https://cdn.example/a_160w.jpg 160w, https://cdn.example/a_800w.jpg 800w, https://cdn.example/a_1920w.jpg 1920w",
      ),
    ).toBe("https://cdn.example/a_800w.jpg");
  });

  it("prefers 580x435 over 1920 og without rewriting tokens", () => {
    expect(
      preferMobileListingImageUrl([
        "https://arbstorage.mncdn.com/x_1920x1080.jpg",
        "https://arbstorage.mncdn.com/x_580x435.jpg",
      ]),
    ).toBe("https://arbstorage.mncdn.com/x_580x435.jpg");
  });

  it("keeps an existing real photo when incoming scrape is null", () => {
    const real =
      "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/1/a_580x435.jpg";
    expect(mergeListingImageUrl(real, null)).toBe(real);
    expect(mergeListingImageUrl(real, "")).toBe(real);
  });

  it("replaces placeholder with a real photo", () => {
    const placeholder =
      "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg";
    const real =
      "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/1/a_580x435.jpg";
    expect(mergeListingImageUrl(placeholder, real)).toBe(real);
    expect(mergeListingImageUrl(null, real)).toBe(real);
  });

  it("does not invent stored URLs from title-like strings", () => {
    expect(toStoredListingImageUrl("Honda Civic 1.6")).toBeNull();
  });
});
