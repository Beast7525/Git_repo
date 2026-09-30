require("./net-setup").preferIpv4();
const nodemailer = require("nodemailer");

const mailUser = (process.env.MAIL_USER || "").trim();
// Google prints app passwords in blocks of four, so the copy-pasted value often carries spaces
const mailPassword = (process.env.MAIL_PASSWORD || process.env.MAIL_PASS || "").replace(/\s+/g, "");

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  auth: {
    user: mailUser,
    pass: mailPassword,
  },
});

// Classify an SMTP failure so transient network errors can be retried while
// permanent failures (bad credentials, blocked recipients) fail fast.
function describeMailError(err) {
  if (!err) return "Unknown SMTP error";
  const status = err.responseCode || err.code || "";
  return [status, err.message].filter(Boolean).join(" - ");
}

// Rejected logins, unknown recipients and blocked senders fail again on every retry,
// so waiting between attempts only makes the request slower without changing the result.
function isPermanentMailError(err) {
  if (String(err.code || "") === "EAUTH") return true;
  return [534, 535, 550, 551, 553, 554].includes(Number(err.responseCode || 0));
}

async function sendWithRetry(mailOptions, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const startedAt = Date.now();
    try {
      await mailTransport.sendMail(mailOptions);
      if (attempt > 1) console.log(`✉️ Email sent on attempt ${attempt}/${retries}`);
      return { ok: true, error: null };
    } catch (err) {
      lastError = err;
      const elapsed = Date.now() - startedAt;
      console.error(
        `❌ Email send attempt ${attempt}/${retries} failed after ${elapsed}ms:`,
        err.code || err.responseCode || "SMTP",
        err.message
      );
      if (isPermanentMailError(err)) return { ok: false, error: describeMailError(err) };
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  return { ok: false, error: describeMailError(lastError) };
}

async function sendSuspensionEmail(toEmail, username, reason, durationDays, untilDate) {
  if (!mailUser || !mailPassword) {
    console.warn("⚠️ Mail credentials not configured. Skipping suspension email.");
    return false;
  }

  const untilText = untilDate ? new Date(untilDate).toLocaleDateString() : `${durationDays} days`;
  const subject = "⚠️ Account Suspension Notice - Gitrepo System";
  
  const textBody = `Hello ${username},\n\nYour account on Gitrepo has been suspended.\n\n` +
    `Suspension Period: ${untilText}\n` +
    `Reason for Suspension: ${reason}\n\n` +
    `If you believe this was done in error, please contact support.\n\n` +
    `Best regards,\nGitrepo Administration Team`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0f1d14; color: #e7f1e5; border-radius: 10px;">
      <h2 style="color: #ef4444; margin-top: 0;">⚠️ Account Suspension Notice</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>Your account on <strong>Gitrepo</strong> has been temporarily suspended by system administration.</p>
      <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0 0 6px;"><strong>Suspension Period:</strong> ${untilText}</p>
        <p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <p style="color: #9eafa3; font-size: 0.9rem;">During this period, access to repository creation and code pushing is restricted.</p>
      <hr style="border: 0; border-top: 1px solid rgba(167, 221, 166, 0.2); margin: 20px 0;" />
      <p style="font-size: 0.85rem; color: #748779;">Gitrepo Support & Management Team</p>
    </div>
  `;

  try {
    const { ok } = await sendWithRetry({
      from: `Gitrepo Admin <${mailUser}>`,
      to: toEmail,
      subject: subject,
      text: textBody,
      html: htmlBody,
    });
    if (!ok) return false;
    console.log(`✉️ Suspension email sent successfully to ${toEmail}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to send suspension email:", err.message);
    return false;
  }
}


module.exports = {
  sendSuspensionEmail,
};
