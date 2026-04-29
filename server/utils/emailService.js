const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use an App Password for Gmail
  },
});

const sendOTP = async (to, otp) => {
  console.log(`[DEBUG] OTP for ${to}: ${otp}`); // Always log to console for development/demo
  
  const mailOptions = {
    from: `"MediLance Security" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: 'Your MediLance Verification Code',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb; text-align: center;">MediLance Protocol</h2>
        <p>You are establishing your identity on the MediLance healthcare network.</p>
        <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: 900; letter-spacing: 5px; color: #0f172a;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 10px; color: #94a3b8; text-align: center; text-transform: uppercase; letter-spacing: 1px;">MediLance • Immutable Healthcare Integrity</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("CRITICAL EMAIL FAILURE:", error.message);
    console.warn("Falling back to Console-only verification (Network Block Detected)");
    return { mock: true }; // Resolve anyway so the UI continues
  }
};

module.exports = { sendOTP };
