import { describe, expect, it } from "vitest";
import { isSitePasswordValid } from "./siteAuth";

const basic = (credentials: string) => `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;

describe("isSitePasswordValid", () => {
  it("accepts the right password with any username", () => {
    expect(isSitePasswordValid(basic("anyone:s3cret"), "s3cret")).toBe(true);
    expect(isSitePasswordValid(basic(":s3cret"), "s3cret")).toBe(true);
  });

  it("accepts a password that contains a colon", () => {
    expect(isSitePasswordValid(basic("me:a:b:c"), "a:b:c")).toBe(true);
  });

  it("rejects a wrong or empty password", () => {
    expect(isSitePasswordValid(basic("me:s3cre"), "s3cret")).toBe(false);
    expect(isSitePasswordValid(basic("me:s3cret!"), "s3cret")).toBe(false);
    expect(isSitePasswordValid(basic("me:"), "s3cret")).toBe(false);
  });

  it.each([null, "", "Bearer abc", "Basic", basic("no-colon-here")])("rejects the header %j", (header) => {
    expect(isSitePasswordValid(header, "s3cret")).toBe(false);
  });
});
