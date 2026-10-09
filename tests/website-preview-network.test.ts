import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPreviewAddress, isPublicPreviewRequest } from "../scripts/website-preview-network";

test("unattended captures cannot request private or local network addresses", async () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.2", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicPreviewAddress(address), false, address);
  }
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicPreviewAddress(address), true);
  assert.equal(await isPublicPreviewRequest("http://2130706433/"), false);
  assert.equal(await isPublicPreviewRequest("http://[::1]/"), false);
  assert.equal(await isPublicPreviewRequest("file:///etc/passwd"), false);
  assert.equal(await isPublicPreviewRequest("https://user:secret@example.com/"), false);
});
