/**
 * WhatsApp Bot — Laundry Connect
 * Uses Baileys (free, no Twilio/Meta API needed)
 * Scan QR code with your phone to connect
 */
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pool = require('../db/pool');
const crypto = require('crypto');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
const sessions = new Map(); // phone -> conversation state

// ── Bot conversation states ─────────────────────────────
// welcome -> select_area -> select_shop -> select_service -> confirm -> done
const STATES = {
  WELCOME: 'welcome',
  SELECT_AREA: 'select_area',
  SELECT_SHOP: 'select_shop',
  SELECT_SERVICE: 'select_service',
  ADD_MORE: 'add_more',
  ENTER_ADDRESS: 'enter_address',
  CONFIRM: 'confirm',
  DONE: 'done',
};

function generateOrderNumber() {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(100000, 999999);
  return `LC-${year}-${rand}`;
}

// ── Initialize WhatsApp connection ──────────────────────
async function startWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./whatsapp-auth');

    sock = makeWASocket({
      auth: state,
      browser: ['Laundry Connect', 'Bot', '1.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCode = qr;
        connectionStatus = 'connecting';
        console.log('[WhatsApp] QR Code generated — visit /api/whatsapp/status to scan');
      }

      if (connection === 'close') {
        connectionStatus = 'disconnected';
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log('[WhatsApp] Disconnected. Reason:', reason);

        if (reason !== DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Reconnecting...');
          setTimeout(startWhatsApp, 5000);
        } else {
          console.log('[WhatsApp] Logged out. Delete whatsapp-auth folder and restart to re-link.');
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCode = null;
        console.log('[WhatsApp] Connected successfully!');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const text = msg.message.conversation
          || msg.message.extendedTextMessage?.text
          || '';
        const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');

        if (!text.trim()) continue;

        try {
          await handleMessage(phone, text.trim(), msg.key.remoteJid);
        } catch (err) {
          console.error('[WhatsApp] Error handling message:', err);
          await sendMessage(msg.key.remoteJid, '⚠️ Samahani, kuna tatizo. Jaribu tena baadaye.\n\n_Sorry, something went wrong. Please try again later._');
        }
      }
    });

    return sock;
  } catch (err) {
    console.error('[WhatsApp] Failed to start:', err);
    connectionStatus = 'disconnected';
  }
}

// ── Send message helper ─────────────────────────────────
async function sendMessage(jid, text) {
  if (!sock) return;
  await sock.sendMessage(jid, { text });
}

// ── Main message handler ────────────────────────────────
async function handleMessage(phone, text, jid) {
  const lowerText = text.toLowerCase().trim();

  // Reset commands
  if (['menu', 'start', 'hi', 'hello', 'habari', 'mambo', 'reset', '0'].includes(lowerText)) {
    sessions.delete(phone);
  }

  let session = sessions.get(phone);

  if (!session) {
    // New session — show welcome
    session = { state: STATES.WELCOME, cart: [], shop: null, area: '' };
    sessions.set(phone, session);

    const welcome = `🧺 *LAUNDRY CONNECT*
Karibu! Agiza huduma ya dobi kupitia WhatsApp.

_Welcome! Order laundry services via WhatsApp._

Chagua eneo lako / Choose your area:

1️⃣ Kinondoni
2️⃣ Ilala
3️⃣ Temeke
4️⃣ Ubungo
5️⃣ Kigamboni
6️⃣ Arusha
7️⃣ Dodoma
8️⃣ Mwanza
9️⃣ Mbeya

_Andika nambari (1-9) / Type a number_`;

    session.state = STATES.SELECT_AREA;
    await sendMessage(jid, welcome);
    return;
  }

  // ── SELECT AREA ───────────────────────────────────────
  if (session.state === STATES.SELECT_AREA) {
    const areas = {
      '1': 'Kinondoni', '2': 'Ilala', '3': 'Temeke',
      '4': 'Ubungo', '5': 'Kigamboni', '6': 'Arusha',
      '7': 'Dodoma', '8': 'Mwanza', '9': 'Mbeya',
    };

    const area = areas[lowerText] || text;
    session.area = area;

    // Find shops in this area
    try {
      const result = await pool.query(
        `SELECT id, name, address, phone, rating_avg
         FROM shops
         WHERE is_approved = TRUE
         AND (LOWER(region) LIKE $1 OR LOWER(address) LIKE $1 OR LOWER(name) LIKE $1)
         ORDER BY rating_avg DESC NULLS LAST
         LIMIT 5`,
        [`%${area.toLowerCase()}%`]
      );

      if (result.rows.length === 0) {
        // Try broader search
        const broader = await pool.query(
          `SELECT id, name, address, phone, rating_avg
           FROM shops WHERE is_approved = TRUE
           ORDER BY rating_avg DESC NULLS LAST LIMIT 5`
        );

        if (broader.rows.length === 0) {
          await sendMessage(jid, `😔 Hakuna maduka bado. Jaribu tena baadaye.\n\n_No shops available yet. Try again later._\n\nAndika *menu* kuanza upya.`);
          sessions.delete(phone);
          return;
        }

        session.shops = broader.rows;
        let shopList = `📍 Hakuna maduka eneo la *${area}* lakini haya yanapatikana:\n\n_No shops in ${area}, but these are available:_\n\n`;
        broader.rows.forEach((s, i) => {
          shopList += `${i + 1}️⃣ *${s.name}*\n   📍 ${s.address}\n   ⭐ ${parseFloat(s.rating_avg || 0).toFixed(1)}\n\n`;
        });
        shopList += `_Chagua duka (1-${broader.rows.length}) / Pick a shop_`;

        session.state = STATES.SELECT_SHOP;
        await sendMessage(jid, shopList);
      } else {
        session.shops = result.rows;
        let shopList = `📍 Maduka eneo la *${area}*:\n_Shops in ${area}:_\n\n`;
        result.rows.forEach((s, i) => {
          shopList += `${i + 1}️⃣ *${s.name}*\n   📍 ${s.address}\n   ⭐ ${parseFloat(s.rating_avg || 0).toFixed(1)}\n\n`;
        });
        shopList += `_Chagua duka (1-${result.rows.length}) / Pick a shop_`;

        session.state = STATES.SELECT_SHOP;
        await sendMessage(jid, shopList);
      }
    } catch (err) {
      console.error('[WhatsApp] DB error:', err);
      await sendMessage(jid, '⚠️ Tatizo la mfumo. Jaribu tena.\n_System error. Try again._\n\nAndika *menu* kuanza upya.');
      sessions.delete(phone);
    }
    return;
  }

  // ── SELECT SHOP ───────────────────────────────────────
  if (session.state === STATES.SELECT_SHOP) {
    const idx = parseInt(lowerText) - 1;
    if (isNaN(idx) || idx < 0 || idx >= (session.shops || []).length) {
      await sendMessage(jid, `⚠️ Chagua nambari sahihi (1-${session.shops.length})\n_Pick a valid number_`);
      return;
    }

    session.shop = session.shops[idx];

    // Get services for this shop
    try {
      const services = await pool.query(
        'SELECT * FROM services WHERE shop_id = $1 AND is_active = TRUE ORDER BY price ASC',
        [session.shop.id]
      );

      if (services.rows.length === 0) {
        await sendMessage(jid, `😔 *${session.shop.name}* haina huduma bado.\n_No services available yet._\n\nAndika *menu* kuchagua duka lingine.`);
        sessions.delete(phone);
        return;
      }

      session.services = services.rows;
      session.cart = [];

      let serviceList = `🏪 *${session.shop.name}*\n\nChagua huduma / Pick a service:\n\n`;
      services.rows.forEach((s, i) => {
        const clothingLabels = {
          shirt: '👔 Shati', trousers: '👖 Suruali', dress: '👗 Gauni',
          suit: '🤵 Suti', bedsheet: '🛏 Shuka', curtain: '🪟 Pazia',
          blanket: '🧣 Blanketi', kitenge: '🎨 Kitenge', shoes: '👟 Viatu',
          underwear: '🩲 Chupi',
        };
        const serviceLabels = {
          wash_only: 'Fua tu', wash_iron: 'Fua & Pasi',
          iron_only: 'Pasi tu', dry_clean: 'Dry Clean',
          special: 'Maalum',
        };
        const label = clothingLabels[s.clothing_type] || s.clothing_type;
        const svcLabel = serviceLabels[s.service_type] || s.service_type;
        const price = Math.round(s.price / 500) * 500;

        serviceList += `${i + 1}️⃣ ${label} — ${svcLabel}\n   💰 TZS ${price.toLocaleString()}\n\n`;
      });
      serviceList += `_Andika nambari na idadi, mfano:_ *1 3* _(huduma 1, vipande 3)_`;

      session.state = STATES.SELECT_SERVICE;
      await sendMessage(jid, serviceList);
    } catch (err) {
      console.error('[WhatsApp] Services error:', err);
      await sendMessage(jid, '⚠️ Tatizo. Andika *menu* kuanza upya.');
      sessions.delete(phone);
    }
    return;
  }

  // ── SELECT SERVICE ────────────────────────────────────
  if (session.state === STATES.SELECT_SERVICE || session.state === STATES.ADD_MORE) {
    // Parse: "1 3" = service 1, quantity 3
    const parts = text.split(/[\s,]+/);
    const svcIdx = parseInt(parts[0]) - 1;
    const qty = parseInt(parts[1]) || 1;

    if (isNaN(svcIdx) || svcIdx < 0 || svcIdx >= (session.services || []).length) {
      await sendMessage(jid, `⚠️ Chagua nambari sahihi (1-${session.services.length})\nMfano: *1 2* = huduma 1, vipande 2`);
      return;
    }

    if (qty < 1 || qty > 50) {
      await sendMessage(jid, '⚠️ Idadi lazima iwe 1-50');
      return;
    }

    const service = session.services[svcIdx];
    session.cart.push({
      service_id: service.id,
      clothing_type: service.clothing_type,
      service_type: service.service_type,
      unit_price: service.price,
      quantity: qty,
    });

    const subtotal = session.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const roundedTotal = Math.round(subtotal / 500) * 500;

    let cartSummary = `✅ Imeongezwa!\n\n🛒 *Kikapu chako / Your cart:*\n\n`;
    session.cart.forEach((item, i) => {
      const price = Math.round(item.unit_price / 500) * 500;
      cartSummary += `${i + 1}. ${item.clothing_type} × ${item.quantity} = TZS ${(price * item.quantity).toLocaleString()}\n`;
    });
    cartSummary += `\n💰 *Jumla: TZS ${roundedTotal.toLocaleString()}*\n\n`;
    cartSummary += `Unataka nini? / What next?\n\n`;
    cartSummary += `➕ Andika nambari kuongeza zaidi (mfano: *2 1*)\n`;
    cartSummary += `✅ Andika *maliza* kukamilisha oda\n`;
    cartSummary += `❌ Andika *menu* kuanza upya`;

    session.state = STATES.ADD_MORE;

    if (lowerText === 'maliza' || lowerText === 'done' || lowerText === 'finish') {
      session.state = STATES.ENTER_ADDRESS;
      await sendMessage(jid, `📍 *Weka anwani yako ya kupelekewa:*\n_Enter your delivery address:_\n\nmfano: Nyumba 23, Mtaa wa Shekilango, Sinza`);
      return;
    }

    await sendMessage(jid, cartSummary);
    return;
  }

  // Check for "maliza/done" in ADD_MORE state
  if (session.state === STATES.ADD_MORE && (lowerText === 'maliza' || lowerText === 'done' || lowerText === 'finish')) {
    session.state = STATES.ENTER_ADDRESS;
    await sendMessage(jid, `📍 *Weka anwani yako ya kupelekewa:*\n_Enter your delivery address:_\n\nmfano: Nyumba 23, Mtaa wa Shekilango, Sinza`);
    return;
  }

  // ── ENTER ADDRESS ─────────────────────────────────────
  if (session.state === STATES.ENTER_ADDRESS) {
    if (text.length < 5) {
      await sendMessage(jid, '⚠️ Anwani fupi sana. Andika anwani kamili.\n_Address too short. Enter full address._');
      return;
    }

    session.address = text;
    const subtotal = session.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const roundedTotal = Math.round(subtotal / 500) * 500;

    let confirmation = `📋 *THIBITISHA ODA / CONFIRM ORDER*\n\n`;
    confirmation += `🏪 *${session.shop.name}*\n`;
    confirmation += `📍 ${session.address}\n\n`;
    confirmation += `*Vitu / Items:*\n`;
    session.cart.forEach((item) => {
      const price = Math.round(item.unit_price / 500) * 500;
      confirmation += `• ${item.clothing_type} × ${item.quantity} = TZS ${(price * item.quantity).toLocaleString()}\n`;
    });
    confirmation += `\n💰 *Jumla: TZS ${roundedTotal.toLocaleString()}*\n`;
    confirmation += `_(delivery fee itaongezwa)_\n\n`;
    confirmation += `✅ Andika *ndio* kuthibitisha\n`;
    confirmation += `❌ Andika *menu* kughairi`;

    session.state = STATES.CONFIRM;
    await sendMessage(jid, confirmation);
    return;
  }

  // ── CONFIRM ORDER ─────────────────────────────────────
  if (session.state === STATES.CONFIRM) {
    if (lowerText !== 'ndio' && lowerText !== 'yes' && lowerText !== 'confirm') {
      await sendMessage(jid, '❌ Oda imeghairiwa.\n_Order cancelled._\n\nAndika *menu* kuanza upya.');
      sessions.delete(phone);
      return;
    }

    try {
      // Find or create customer by phone
      const phoneFormatted = phone.startsWith('255') ? '0' + phone.slice(3) : phone;
      let customerResult = await pool.query('SELECT id FROM users WHERE phone = $1 OR phone = $2', [phone, phoneFormatted]);

      let customerId;
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      } else {
        // Create guest customer
        const bcrypt = require('bcryptjs');
        const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const referralCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        const newUser = await pool.query(
          `INSERT INTO users (full_name, phone, password_hash, role, is_verified, referral_code)
           VALUES ($1, $2, $3, 'customer', TRUE, $4) RETURNING id`,
          [`WhatsApp ${phoneFormatted}`, phoneFormatted, tempPassword, referralCode]
        );
        customerId = newUser.rows[0].id;
      }

      // Calculate totals
      const subtotal = session.cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      const deliveryFee = 3000; // Default delivery fee
      const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.005');
      const platformCommission = Math.round(subtotal * commissionRate);
      const totalAmount = subtotal + deliveryFee;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const orderNumber = generateOrderNumber();
        const orderResult = await client.query(
          `INSERT INTO orders (order_number, customer_id, shop_id, subtotal, delivery_fee, platform_commission, total_amount, delivery_address, special_instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [orderNumber, customerId, session.shop.id, subtotal, deliveryFee, platformCommission, totalAmount, session.address, 'Order via WhatsApp']
        );

        const order = orderResult.rows[0];

        for (const item of session.cart) {
          await client.query(
            `INSERT INTO order_items (order_id, service_id, clothing_type, service_type, quantity, unit_price, total_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [order.id, item.service_id, item.clothing_type, item.service_type, item.quantity, item.unit_price, item.unit_price * item.quantity]
          );
        }

        await client.query('UPDATE shops SET total_orders = total_orders + 1 WHERE id = $1', [session.shop.id]);
        await client.query('COMMIT');

        const roundedTotal = Math.round(totalAmount / 500) * 500;

        let success = `🎉 *ODA IMEWEKWA!*\n\n`;
        success += `📝 Nambari: *${orderNumber}*\n`;
        success += `🏪 ${session.shop.name}\n`;
        success += `📍 ${session.address}\n`;
        success += `💰 Jumla: *TZS ${roundedTotal.toLocaleString()}*\n\n`;
        success += `💳 *Lipa kupitia M-Pesa:*\n`;
        success += `Tuma TZS ${roundedTotal.toLocaleString()} kwa *${session.shop.phone || 'nambari ya duka'}*\n\n`;
        success += `Asante kwa kutumia Laundry Connect! 🧺\n`;
        success += `Andika *menu* kuagiza tena.`;

        await sendMessage(jid, success);

        // Notify shop owner if they have WhatsApp
        if (session.shop.phone) {
          const ownerJid = formatPhoneToJid(session.shop.phone);
          if (ownerJid) {
            const ownerMsg = `🔔 *ODA MPYA — ${orderNumber}*\n\n` +
              `Mteja: ${phoneFormatted}\n` +
              `📍 ${session.address}\n` +
              `💰 TZS ${roundedTotal.toLocaleString()}\n\n` +
              `Vitu:\n` +
              session.cart.map(item => `• ${item.clothing_type} × ${item.quantity}`).join('\n') +
              `\n\n_Oda imetoka WhatsApp_`;
            await sendMessage(ownerJid, ownerMsg);
          }
        }

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

    } catch (err) {
      console.error('[WhatsApp] Order creation error:', err);
      await sendMessage(jid, '⚠️ Tatizo la kuweka oda. Jaribu tena.\n_Failed to place order. Try again._\n\nAndika *menu* kuanza upya.');
    }

    sessions.delete(phone);
    return;
  }

  // Default: unrecognized state
  sessions.delete(phone);
  await sendMessage(jid, 'Andika *menu* kuanza.\n_Type *menu* to start._');
}

// ── Format phone to WhatsApp JID ────────────────────────
function formatPhoneToJid(phone) {
  let cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '255' + cleaned.slice(1);
  if (cleaned.startsWith('255') && cleaned.length >= 12) {
    return cleaned + '@s.whatsapp.net';
  }
  return null;
}

// ── Send a message to any phone number ──────────────────
async function sendToPhone(phone, message) {
  const jid = formatPhoneToJid(phone);
  if (!jid || !sock) return false;
  try {
    await sock.sendMessage(jid, { text: message });
    return true;
  } catch (err) {
    console.error('[WhatsApp] Send error:', err);
    return false;
  }
}

// ── Getters for admin API ───────────────────────────────
function getStatus() { return connectionStatus; }
function getQR() { return qrCode; }
function getActiveSessions() { return sessions.size; }

module.exports = {
  startWhatsApp,
  sendToPhone,
  getStatus,
  getQR,
  getActiveSessions,
};
