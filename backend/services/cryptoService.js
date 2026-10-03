const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? crypto.scryptSync(process.env.ENCRYPTION_KEY, "gitrepo_salt", 32)
  : crypto.scryptSync("gitrepo_default_secret_key_32bytes", "gitrepo_salt", 32);

function encryptObject(obj) {
  if (!obj || typeof obj !== "object" || Object.keys(obj).length === 0) {
    return { iv: "", data: "", authTag: "" };
  }
  const text = JSON.stringify(obj);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    data: encrypted,
    authTag: authTag,
  };
}

function decryptObject(encryptedObj) {
  if (!encryptedObj || !encryptedObj.data || !encryptedObj.iv || !encryptedObj.authTag) {
    return {};
  }
  try {
    const iv = Buffer.from(encryptedObj.iv, "hex");
    const authTag = Buffer.from(encryptedObj.authTag, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedObj.data, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (error) {
    console.error("Failed to decrypt environment variables:", error.message);
    return {};
  }
}

module.exports = {
  encryptObject,
  decryptObject,
};
