const { projects } = require("../jest.config.js");
module.exports = {
  ...projects[0],
  testRegex: "extension/src/popup/helpers/__tests__/soranAdversary.test.tsx$",
};
