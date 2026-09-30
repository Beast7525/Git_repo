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

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value, fallback) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

// Strip characters that would allow SMTP header injection
function safeHeader(value) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").trim();
}

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

// Team verification email sent by the team owner when a member is added.
// Sent from the Gitrepo account (MAIL_USER = gitrepo02@gmail.com) to the invited member.
async function sendTeamVerificationEmail({
  to,
  memberUsername,
  teamName,
  ownerName,
  ownerEmail,
  acceptUrl,
  rejectUrl,
  teamUrl,
}) {
  if (!mailUser || !mailPassword) {
    console.warn("⚠️ Mail credentials not configured. Skipping team verification email.");
    return { sent: false, error: "MAIL_USER / MAIL_PASSWORD are not set in the backend .env" };
  }

  if (!to) {
    return { sent: false, error: "The invited member has no email address" };
  }

  const safeTeamName = escapeHtml(teamName);
  const safeMemberName = escapeHtml(memberUsername || "Developer");
  const safeOwnerName = escapeHtml(ownerName || "The team owner");
  const acceptLink = safeUrl(acceptUrl, "");
  const rejectLink = safeUrl(rejectUrl, "");
  const teamLink = safeUrl(teamUrl, "");

  if (!acceptLink) {
    return { sent: false, error: "The invitation accept link could not be built" };
  }

  const subject = `${safeHeader(ownerName || "A team owner")} invited you to join "${safeHeader(teamName)}" - Accept or Reject`;

  const textBody =
    `Hello ${memberUsername || "Developer"},\n\n` +
    `${ownerName || "The team owner"} (team owner) added you to the team "${teamName}" on Gitrepo.\n` +
    `Your membership is pending until you verify it from this email.\n\n` +
    `ACCEPT the invitation (you are added to the team and taken straight to the team page):\n${acceptUrl}\n\n` +
    `REJECT the invitation (you stay out of the team):\n${rejectUrl || "(not available)"}\n\n` +
    (teamUrl ? `Team page:\n${teamUrl}\n\n` : "") +
    `This one-time link can only be used once.\n\n` +
    `Sent by Gitrepo Team Verification <${mailUser}>\n` +
    `${ownerName || "The team owner"}${ownerEmail ? ` (${ownerEmail})` : ""}`;

  const htmlBody = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background-color: #0d1711; color: #e7f1e5; border-radius: 12px; border: 1px solid rgba(167, 221, 166, 0.2);">
      <h2 style="color: #a7dda6; margin: 0 0 4px; font-size: 1.4rem;">Team Verification Request</h2>
      <p style="margin: 0 0 20px; font-size: 0.8rem; color: #748779; letter-spacing: 0.04em; text-transform: uppercase;">
        Sent from ${escapeHtml(mailUser)}
      </p>

      <p style="font-size: 1rem; color: #d0e0d5; margin: 0 0 8px;">Hello <strong>${safeMemberName}</strong>,</p>
      <p style="color: #9eafa3; line-height: 1.6; margin: 0 0 20px;">
        <strong>${safeOwnerName}</strong>, the owner of the team
        <strong style="color: #ffffff;">${safeTeamName}</strong>, has added you as a member on Gitrepo.
        Confirm your membership below.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 18px;">
        <tr>
          <td align="center" style="padding: 0 0 12px 0;">
            <a href="${acceptLink}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 1.05rem; display: inline-block; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
              ACCEPT
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0;">
            ${
              rejectLink
                ? `<a href="${rejectLink}" style="background: transparent; color: #f87171; text-decoration: none; padding: 15px 40px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.55); font-weight: bold; font-size: 1.05rem; display: inline-block;">
              REJECT
            </a>`
                : `<span style="color: #748779; font-size: 0.9rem;">REJECT is not available for this invitation.</span>`
            }
          </td>
        </tr>
      </table>

      <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 12px 14px; border-radius: 4px; margin: 0 0 18px;">
        <p style="margin: 0; font-size: 0.85rem; color: #d0e0d5; line-height: 1.5;">
          Clicking <strong style="color: #34d399;">ACCEPT</strong> verifies your membership and opens your team page
          <strong style="color: #ffffff;">${safeTeamName}</strong> straight away.
          Clicking <strong style="color: #f87171;">REJECT</strong> removes the request and you will not join the team.
        </p>
      </div>

      ${
        teamLink
          ? `<p style="text-align: center; margin: 0 0 18px;">
        <a href="${teamLink}" style="color: #a7dda6; font-size: 0.88rem;">View the team page first</a>
      </p>`
          : ""
      }

      <p style="font-size: 0.78rem; color: #748779; word-break: break-all; line-height: 1.6;">
        Buttons not working? Copy and paste these links into your browser:<br />
        <a href="${acceptLink}" style="color: #34d399;">ACCEPT: ${acceptLink}</a><br />
        ${rejectLink ? `<a href="${rejectLink}" style="color: #f87171;">REJECT: ${rejectLink}</a>` : ""}
      </p>

      <hr style="border: 0; border-top: 1px solid rgba(167, 221, 166, 0.2); margin: 22px 0 14px;" />
      <p style="font-size: 0.8rem; color: #748779; margin: 0; line-height: 1.6;">
        Gitrepo Team Verification &middot; ${escapeHtml(mailUser)}<br />
        Invited by ${safeOwnerName}${ownerEmail ? ` &lt;${escapeHtml(ownerEmail)}&gt;` : ""}
      </p>
    </div>
  `;

  try {
    const { ok, error } = await sendWithRetry({
      from: `Gitrepo Team Verification <${mailUser}>`,
      to,
      replyTo: ownerEmail ? safeHeader(ownerEmail) : undefined,
      subject,
      text: textBody,
      html: htmlBody,
    });
    if (!ok) return { sent: false, error };
    console.log(`✉️ Team verification email sent from ${mailUser} to ${to} (team "${teamName}")`);
    return { sent: true, error: null };
  } catch (err) {
    console.error("❌ Failed to send team verification email:", err.message);
    return { sent: false, error: describeMailError(err) };
  }
}

module.exports = {
  sendSuspensionEmail,
  sendTeamVerificationEmail,
};
