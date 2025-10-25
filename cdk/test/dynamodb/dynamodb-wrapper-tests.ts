import jest from "jest";
import { RunningStreamWrapper } from "../../lib/constructs/dynamodb-wrapper";

describe("RunningStreamWrapper", () => {
  it("should create a new stream", async () => {
    const wrapper = new RunningStreamWrapper(
      new Table(this, "RunningStreams", {
        partitionKey: { name: "instanceArn", type: AttributeType.STRING },
      })
    );
  });
});
