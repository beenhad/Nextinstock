import assert from "node:assert/strict";
import test from "node:test";
import { parseEbayProfileAvatar, parseEbayUserId } from "./ebay-profile";

test("reads the authenticated account from GetUser without taking nested IDs", () => {
  assert.equal(parseEbayUserId("<GetUserResponse><User><UserID>grailclub</UserID></User></GetUserResponse>"), "grailclub");
  assert.equal(parseEbayUserId("<GetUserResponse><User><UserID>bad/user</UserID></User></GetUserResponse>"), null);
});

test("uses only an eBay hosted profile image", () => {
  assert.equal(parseEbayProfileAvatar('<div class=userImage><a href="/usr/grailclub"><img src=https://i.ebayimg.com/00/s/photo/$_7.PNG alt="User profile"></a></div>'), "https://i.ebayimg.com/00/s/photo/$_7.PNG");
  assert.equal(parseEbayProfileAvatar('<script>{"avatarUrl":"https:\\/\\/i.ebayimg.com\\/images\\/g\\/abc\\/s-l140.jpg"}</script>'), "https://i.ebayimg.com/images/g/abc/s-l140.jpg");
  assert.equal(parseEbayProfileAvatar('<meta property="og:image" content="https://i.ebayimg.com/images/g/photo/s-l140.jpg">'), "https://i.ebayimg.com/images/g/photo/s-l140.jpg");
  assert.equal(parseEbayProfileAvatar('<meta property="og:image" content="https://example.com/not-ebay.jpg">'), null);
});
