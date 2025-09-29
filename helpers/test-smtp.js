import nodemailer from "nodemailer";

const smtpConfig = {
  host: "smtp.gmail.com",
  port: 465,                  // 465 for SSL, 587 for TLS
  secure: true,              
  auth: {
    user: "info@bitplaypro.com",
    pass: "Digital@2025#"
  }
};

async function testSMTP() {
  try {
    console.log("Creating transporter...");
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("SMTP connection successful!");

    // Send a test email
    console.log("Sending test email...");
    const info = await transporter.sendMail({
      from: `"SMTP Test" <${smtpConfig.auth.user}>`,
      to: "growthdev2@gmail.com",
      subject: "SMTP Test",
      text: "This is a test email to verify SMTP settings.",
    });

    console.log("Test email sent!");
    console.log("Message ID:", info.messageId);
  } catch (err) {
    console.error("SMTP test failed:");
    console.error(err);
  }
}

testSMTP();
