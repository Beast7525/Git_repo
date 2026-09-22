const nodemailer = require("nodemailer");

const mailUser = process.env.MAIL_USER;
const mailPassword = process.env.MAIL_PASSWORD || process.env.MAIL_PASS;

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: mailUser,
    pass: mailPassword,
  },
});

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
    await mailTransport.sendMail({
      from: `Gitrepo Admin <${mailUser}>`,
      to: toEmail,
      subject: subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`✉️ Suspension email sent successfully to ${toEmail}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to send suspension email:", err.message);
    return false;
  }
}

async function sendGroupInvitationEmail(toEmail, memberUsername, groupName, creatorName, acceptUrl) {
  if (!mailUser || !mailPassword) {
    console.warn("⚠️ Mail credentials not configured. Skipping group invitation email.");
    return false;
  }

  const subject = `Invitation to join group "${groupName}" on Gitrepo`;
  const textBody = `Hello ${memberUsername || "Developer"},\n\n` +
    `${creatorName || "A team creator"} has invited you to join the team group "${groupName}" on Gitrepo.\n\n` +
    `To accept this invitation and become a member of the group, please click the link below:\n` +
    `${acceptUrl}\n\n` +
    `If you did not expect this invitation, you can safely ignore this email.\n\n` +
    `Best regards,\nGitrepo Team`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background-color: #0d1711; color: #e7f1e5; border-radius: 12px; border: 1px solid rgba(167, 221, 166, 0.2);">
      <h2 style="color: #a7dda6; margin-top: 0; font-size: 1.4rem;">🎉 Team Group Invitation</h2>
      <p style="font-size: 1rem; color: #d0e0d5;">Hello <strong>${memberUsername || "Developer"}</strong>,</p>
      <p style="color: #9eafa3; line-height: 1.5;">
        <strong>${creatorName || "A team owner"}</strong> has invited you to join the group <strong style="color: #ffffff;">${groupName}</strong> on Gitrepo.
      </p>
      
      <div style="margin: 28px 0; text-align: center;">
        <a href="${acceptUrl}" target="_blank" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
          ✓ Accept Invitation
        </a>
      </div>

      <p style="font-size: 0.82rem; color: #748779; word-break: break-all;">
        If the button above does not work, copy and paste this link into your browser:<br />
        <a href="${acceptUrl}" style="color: #a7dda6;">${acceptUrl}</a>
      </p>
      <hr style="border: 0; border-top: 1px solid rgba(167, 221, 166, 0.2); margin: 24px 0;" />
      <p style="font-size: 0.8rem; color: #748779; margin: 0;">Gitrepo Team Collaboration</p>
    </div>
  `;

  try {
    await mailTransport.sendMail({
      from: `Gitrepo Team <${mailUser}>`,
      to: toEmail,
      subject: subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`✉️ Group invitation email sent successfully to ${toEmail}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to send group invitation email:", err.message);
    return false;
  }
}

module.exports = {
  sendSuspensionEmail,
  sendGroupInvitationEmail,
};
