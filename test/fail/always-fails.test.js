// Run with `npm run test:fail`. Use it as the wizard's Test Command with
// "Enable Tests" on to confirm a failing test stops the image build.
const test = require("node:test");
test("intentional failure to verify Enable Tests blocks the build", () => {
  throw new Error("This failure is intentional: the Choreon build must stop here.");
});
