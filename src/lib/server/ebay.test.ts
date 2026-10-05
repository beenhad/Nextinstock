import assert from "node:assert/strict";
import test from "node:test";
import { parseVariations, sellerPreviewCandidateIds, variationQuantityRequest } from "./ebay";

test("preview chooses active in-stock seller listings with photos, preferring one unit", () => {
  const item = (id: string, status: string, quantity: number, sold: number, photo: boolean) => `<Item><ItemID>${id}</ItemID><Quantity>${quantity}</Quantity><SellingStatus><ListingStatus>${status}</ListingStatus><QuantitySold>${sold}</QuantitySold></SellingStatus>${photo ? "<PictureDetails><PictureURL>https://i.ebayimg.com/photo.jpg</PictureURL></PictureDetails>" : ""}</Item>`;
  const xml = `<GetSellerListResponse><ItemArray>${item("111111111", "Active", 3, 0, true)}${item("222222222", "Active", 1, 0, true)}${item("333333333", "Active", 0, 0, true)}${item("444444444", "Ended", 1, 0, true)}${item("555555555", "Active", 1, 0, false)}</ItemArray></GetSellerListResponse>`;
  assert.deepEqual(sellerPreviewCandidateIds(xml), ["222222222", "111111111"]);
});

test("parses SKU-less variations, stock, and the matching picture set", () => {
  const xml = `
    <Variation><StartPrice currencyID="USD">64.99</StartPrice><Quantity>121</Quantity>
      <SellingStatus><QuantitySold>116</QuantitySold></SellingStatus>
      <VariationSpecifics><NameValueList><Name>Colors</Name><Value>Indigo Purple</Value></NameValueList></VariationSpecifics>
    </Variation>
    <Variation><StartPrice currencyID="USD">59.99</StartPrice><Quantity>70</Quantity>
      <SellingStatus><QuantitySold>70</QuantitySold></SellingStatus>
      <VariationSpecifics><NameValueList><Name>Colors</Name><Value>Spice Orange</Value></NameValueList></VariationSpecifics>
    </Variation>
    <Pictures><VariationSpecificName>Colors</VariationSpecificName>
      <VariationSpecificPictureSet><VariationSpecificValue>Indigo Purple</VariationSpecificValue>
        <PictureURL>https://i.ebayimg.com/purple-1.jpg</PictureURL>
        <PictureURL>https://i.ebayimg.com/purple-2.jpg</PictureURL>
      </VariationSpecificPictureSet>
    </Pictures>`;
  const result = parseVariations(xml, ["https://i.ebayimg.com/shared.jpg"]);
  assert.equal(result.pictureAxis, "Colors");
  assert.equal(result.variations.length, 2);
  assert.equal(result.variations[0].sku, null);
  assert.equal(result.variations[0].quantityAvailable, 5);
  assert.equal(result.variations[0].imageUrls.length, 2);
  assert.equal(result.variations[0].hasSpecificPhotos, true);
  assert.equal(result.variations[1].quantityAvailable, 0);
  assert.equal(result.variations[1].hasSpecificPhotos, false);
  assert.deepEqual(result.variations[1].imageUrls, ["https://i.ebayimg.com/shared.jpg"]);
  assert.notEqual(result.variations[0].key, result.variations[1].key);
});

test("variation quantity revision identifies one SKU-less option without changing photos or condition", () => {
  const variation = parseVariations(`<Variation><StartPrice currencyID="USD">59.99</StartPrice><Quantity>70</Quantity><SellingStatus><QuantitySold>70</QuantitySold></SellingStatus><VariationSpecifics><NameValueList><Name>Colors</Name><Value>Spice &amp; Orange</Value></NameValueList></VariationSpecifics></Variation>`, []).variations[0];
  const xml = variationQuantityRequest("900000000201", variation, 1);
  assert.match(xml, /<ItemID>900000000201<\/ItemID>/);
  assert.match(xml, /<StartPrice currencyID="USD">59.99<\/StartPrice>/);
  assert.match(xml, /<Quantity>1<\/Quantity>/);
  assert.match(xml, /Spice &amp; Orange/);
  assert.doesNotMatch(xml, /<SKU>|<PictureDetails>|<ConditionDescription>/);
  const repriced = variationQuantityRequest("900000000201", variation, 1, 64.99);
  assert.match(repriced, /<StartPrice currencyID="USD">64.99<\/StartPrice>/);
  assert.match(repriced, /<Quantity>1<\/Quantity>/);
});
