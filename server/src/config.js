import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'smartship-dev-secret-change-me',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  mongoUri: process.env.MONGODB_URI || '',
  // Carrier integration (real provider webhook; falls back to built-in simulator)
  carrierApiUrl: process.env.CARRIER_API_URL || '',
  carrierApiKey: process.env.CARRIER_API_KEY || '',
  carrierWebhookSecret: process.env.CARRIER_WEBHOOK_SECRET || 'smartship-simulated-secret',
  // Outbound notification delivery channel (optional webhook sink)
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || '',
  // Business-rule engine
  rulesSweepEnabled: process.env.RULES_SWEEP !== 'off',
  rulesSweepIntervalMin: Math.max(1, parseInt(process.env.RULES_SWEEP_INTERVAL_MIN || '5', 10)),
};
