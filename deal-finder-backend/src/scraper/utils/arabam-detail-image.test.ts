import { describe, expect, it } from "vitest";
import { pickArabamDetailImage } from "./arabam-detail-image.js";

describe("Arabam detail image extraction", () => {
  it("prefers JSON-LD Car 580x435 over og 1920 and skips logo assets", () => {
    const picked = pickArabamDetailImage({
      ldImages: [
        "https://arbimg1.mncdn.com/assets2/dist/img/arabam-logo.png",
        "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_580x435.jpg",
      ],
      ogImage:
        "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_1920x1080.jpg",
      gallery: [
        {
          src: "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/42819518/a_image_for_silan_42819518_580x435.jpg",
        },
      ],
    });
    expect(picked?.source).toBe("detail-json-ld");
    expect(picked?.url).toContain("_580x435.jpg");
  });

  it("falls back to og:image when JSON-LD is empty", () => {
    const picked = pickArabamDetailImage({
      ldImages: [],
      ogImage:
        "https://arbstorage.mncdn.com/ilanfotograflari/2026/08/14/1/b_image_for_silan_1_1920x1080.jpg",
      gallery: [],
    });
    expect(picked?.source).toBe("detail-og");
    expect(picked?.url).toContain("arbstorage.mncdn.com");
  });

  it("returns null when only placeholders exist", () => {
    expect(
      pickArabamDetailImage({
        ldImages: [
          "https://arbimg1.mncdn.com/ilanfotograflari/noImage/01/01/1/noimage5_160x120.jpg",
        ],
        ogImage: null,
        gallery: [],
      }),
    ).toBeNull();
  });
});
