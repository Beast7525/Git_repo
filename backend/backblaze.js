const B2 = require("backblaze-b2");
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});
async function authorizeB2() {
  await b2.authorize();
  console.log("✅ Connected to Backblaze B2");
}
module.exports = {
  b2,
  authorizeB2,
};