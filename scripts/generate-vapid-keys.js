#!/usr/bin/env node

/**
 * One-time script to generate VAPID keys for Web Push notifications.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.js
 *
 * Copy the output into your .env.local file.
 */

const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Add these to your .env.local:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@taskhub.local`);
console.log(`\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
