import { describe, expect, it } from "vitest";
import { parseArabamListingRows } from "./arabam-verify-parser.js";

const FIXTURE_ROW = `
<tr class="listing-list-item" id="listing123" data-imp-id="123">
  <td class="listing-modelname"><span class="listing-text-new">Honda Civic</span></td>
  <td><h3><span class="listing-text-new listing-title-lines">2017 Honda Civic</span></h3></td>
  <td class="listing-text">2017</td>
  <td><span class="listing-price">850.000 TL</span></td>
  <td class="listing-text"><span title="Kayseri">Kayseri</span></td>
  <td><a class="link-overlay" href="/ilan/12345">link</a></td>
</tr>
`;

describe("parseArabamListingRows fixture", () => {
  it("extracts year, price, city from listing row HTML", () => {
    const rows = parseArabamListingRows(`<table>${FIXTURE_ROW}</table>`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.year).toBe(2017);
    expect(rows[0]?.price).toBe(850_000);
    expect(rows[0]?.city).toBe("Kayseri");
  });
});
