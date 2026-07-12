const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const error = new Error("Email delivery is not configured");
    error.statusCode = 500;
    throw error;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtpout.secureserver.net",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendRegistrationOtpEmail(email, otp, expiresInMinutes) {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || '"PhoneClub" <noreply@thephoneclub.in>',
    to: email,
    subject: "Confirm your PhoneClub email",
    text: `Your PhoneClub verification code is ${otp}. It expires in ${expiresInMinutes} minutes. Do not share this code.`,
    html: `<p>Your PhoneClub verification code is:</p><h2>${otp}</h2><p>It expires in ${expiresInMinutes} minutes. Do not share this code.</p>`,
  });
}

async function sendPasswordResetOtpEmail(email, otp, expiresInMinutes) {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || '"PhoneClub" <noreply@thephoneclub.in>',
    to: email,
    subject: "Reset your PhoneClub password",
    text: `Your PhoneClub password-reset code is ${otp}. It expires in ${expiresInMinutes} minutes. Do not share this code.`,
    html: `<p>Your PhoneClub password-reset code is:</p><h2>${otp}</h2><p>It expires in ${expiresInMinutes} minutes. Do not share this code.</p>`,
  });
}

module.exports = {
  sendRegistrationOtpEmail,
  sendPasswordResetOtpEmail,
};
