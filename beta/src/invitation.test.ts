import { describe, expect, it } from "vitest";
import { roomInviteCode } from "./invitation";

describe("roomInviteCode", () => {
  it("accepts room or invite query context and room hashes", () => {
    expect(roomInviteCode({ search: "?room=111111", hash: "" })).toBe("111111");
    expect(roomInviteCode({ search: "?invite=ab12cd", hash: "" })).toBe("AB12CD");
    expect(roomInviteCode({ search: "", hash: "#/room/222222" })).toBe("222222");
  });

  it("rejects invalid invite context", () => {
    expect(roomInviteCode({ search: "?room=no", hash: "" })).toBeNull();
  });
});
