const en = {
  // Auth
  allFieldsRequired: 'All fields are required',
  invalidEmail: 'Invalid email address',
  invalidPhone: 'Invalid Tanzanian phone number (e.g. 0768188065)',
  weakPassword: 'Password must be at least 8 characters with uppercase, lowercase, and a number',
  invalidRole: 'Invalid role',
  alreadyRegistered: 'Email or phone already registered',
  registrationSuccess: 'Registration successful. Check your phone/email for the verification code.',
  otpFailed: 'Registration successful. OTP failed to send — contact support.',
  invalidOtpFormat: 'Invalid OTP format',
  invalidOrExpiredOtp: 'Invalid or expired OTP',
  userNotFound: 'User not found',
  emailVerified: 'Email verified successfully',
  emailRequired: 'Email is required',
  otpSentBoth: 'New OTP sent to your phone and email',
  otpSendFailed: 'Failed to send OTP',
  phonePasswordRequired: 'Phone and password are required',
  accountLocked: (min) => `Account temporarily locked. Try again in ${min} minutes.`,
  invalidCredentials: 'Invalid credentials',
  verifyFirst: 'Please verify your account first',
  validEmailRequired: 'Valid email is required',
  resetCodeSent: 'Password reset code sent to your email and phone',
  resetLinkSent: 'If this email exists, a reset link has been sent',
  invalidResetCode: 'Invalid or expired reset code',
  passwordResetSuccess: 'Password reset successful. You can now log in with your new password.',
  refreshTokenRequired: 'Refresh token required',
  invalidRefreshToken: 'Invalid refresh token',
  noTokenProvided: 'No token provided',
  invalidToken: 'Invalid or expired token',
  accessDenied: 'Access denied',

  // Shops
  shopNotFound: 'Shop not found',
  nameAddressRequired: 'Name and address are required',
  shopAlreadyRegistered: 'You already have a shop registered',
  shopCreated: 'Shop created! Waiting for admin approval.',
  notYourShop: 'Not your shop',

  // Orders
  missingFields: 'Missing required fields',
  tooManyItems: 'Too many items in order (max 50)',
  addressTooLong: 'Delivery address too long',
  invalidItem: 'Invalid item: service_id and quantity (1-100) required',
  serviceNotFound: (id) => `Service ${id} not found`,
  orderPlaced: 'Order placed! Proceed to payment.',
  orderNotFound: 'Order not found',
  invalidStatus: 'Invalid status',
  notYourOrder: 'Not your order',

  // Payments
  orderIdMethodRequired: 'order_id and method are required',
  invalidPaymentMethod: 'Invalid payment method',
  phoneRequiredMobile: 'Phone number is required for mobile money payments',
  invalidPhoneNumber: 'Invalid Tanzanian phone number',
  orderNotFoundOrPaid: 'Order not found or already paid',
  cashPaymentRecorded: 'Cash payment recorded. Order confirmed!',
  paymentGatewayError: 'Payment gateway error. Please try again.',
  paymentInitiated: 'Payment initiated — check your phone for USSD prompt',
  transactionNotFound: 'Transaction not found',

  // Messages
  notAllowed: 'Not allowed',
  shopIdRequired: 'shop_id is required',
  cannotChatOwnShop: 'Cannot chat with your own shop',
  conversationNotFound: 'Conversation not found',
  messageRequired: 'Message content is required',
  messageTooLong: 'Message too long (max 2000 chars)',

  // Admin
  shopApproved: 'Shop approved!',
  shopRejected: 'Shop rejected',

  // Owner
  noShopFound: 'No shop found',
  noFieldsToUpdate: 'No fields to update',
  shopUpdated: 'Shop updated',

  // Server
  tooManyRequests: 'Too many requests. Please try again later.',
  tooManyLogins: 'Too many login attempts. Please wait 15 minutes.',
  tooManyOtp: 'Too many OTP requests. Please wait a few minutes.',
  internalError: 'An internal error occurred. Please try again later.',

  // SMS
  smsOtp: (otp) => `Your Laundry Connect verification code is: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,
  smsReset: (otp) => `Your Laundry Connect password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore.`,

  // Email
  emailOtpSubject: 'Your Laundry Connect Verification Code',
  emailOtpGreeting: 'Welcome! Your verification code is:',
  emailOtpFooter: "This code expires in 10 minutes. If you didn't request this, ignore this email.",
  emailResetSubject: 'Reset Your Laundry Connect Password',
  emailResetGreeting: 'Hello! You requested a password reset for your account.',
  emailResetInstruction: 'Click the button below to set a new password:',
  emailResetButton: 'Reset Password',
  emailResetLinkNote: 'Or copy this link into your browser:',
  emailResetCodeLabel: 'Your reset code is:',
  emailResetFooter: "This link expires in 10 minutes. If you didn't request this, your account is safe — just ignore this email.",
};

const sw = {
  // Auth
  allFieldsRequired: 'Sehemu zote zinahitajika',
  invalidEmail: 'Anwani ya barua pepe si sahihi',
  invalidPhone: 'Nambari ya simu ya Tanzania si sahihi (mfano. 0768188065)',
  weakPassword: 'Nywila lazima iwe na angalau herufi 8, herufi kubwa, ndogo, na nambari',
  invalidRole: 'Jukumu si sahihi',
  alreadyRegistered: 'Barua pepe au nambari ya simu tayari imesajiliwa',
  registrationSuccess: 'Usajili umefanikiwa. Angalia simu/barua pepe yako kwa nambari ya uthibitisho.',
  otpFailed: 'Usajili umefanikiwa. OTP imeshindwa kutumwa — wasiliana na msaada.',
  invalidOtpFormat: 'Muundo wa OTP si sahihi',
  invalidOrExpiredOtp: 'OTP si sahihi au imeisha muda',
  userNotFound: 'Mtumiaji hajapatikana',
  emailVerified: 'Barua pepe imethibitishwa kikamilifu',
  emailRequired: 'Barua pepe inahitajika',
  otpSentBoth: 'OTP mpya imetumwa kwa simu na barua pepe yako',
  otpSendFailed: 'Imeshindwa kutuma OTP',
  phonePasswordRequired: 'Nambari ya simu na nywila zinahitajika',
  accountLocked: (min) => `Akaunti imefungwa kwa muda. Jaribu tena baada ya dakika ${min}.`,
  invalidCredentials: 'Taarifa za kuingia si sahihi',
  verifyFirst: 'Tafadhali thibitisha akaunti yako kwanza',
  validEmailRequired: 'Barua pepe sahihi inahitajika',
  resetCodeSent: 'Nambari ya kubadilisha imetumwa kwa barua pepe na simu yako',
  resetLinkSent: 'Ikiwa barua pepe hii ipo, kiungo cha kubadilisha kimetumwa',
  invalidResetCode: 'Nambari ya kubadilisha si sahihi au imeisha muda',
  passwordResetSuccess: 'Nywila imebadilishwa kikamilifu. Sasa unaweza kuingia na nywila yako mpya.',
  refreshTokenRequired: 'Tokeni ya kuburudisha inahitajika',
  invalidRefreshToken: 'Tokeni ya kuburudisha si sahihi',
  noTokenProvided: 'Hakuna tokeni iliyotolewa',
  invalidToken: 'Tokeni si sahihi au imeisha muda',
  accessDenied: 'Ufikiaji umekataliwa',

  // Shops
  shopNotFound: 'Duka halijapatikana',
  nameAddressRequired: 'Jina na anwani vinahitajika',
  shopAlreadyRegistered: 'Tayari una duka lililosajiwa',
  shopCreated: 'Duka limeundwa! Linasubiri idhini ya msimamizi.',
  notYourShop: 'Si duka lako',

  // Orders
  missingFields: 'Sehemu zinazohitajika hazipo',
  tooManyItems: 'Vitu vingi sana kwenye oda (upeo 50)',
  addressTooLong: 'Anwani ya kupelekea ni ndefu sana',
  invalidItem: 'Kitu si sahihi: service_id na kiasi (1-100) vinahitajika',
  serviceNotFound: (id) => `Huduma ${id} haijapatikana`,
  orderPlaced: 'Oda imewekwa! Endelea na malipo.',
  orderNotFound: 'Oda haijapatikana',
  invalidStatus: 'Hali si sahihi',
  notYourOrder: 'Si oda yako',

  // Payments
  orderIdMethodRequired: 'order_id na njia ya malipo vinahitajika',
  invalidPaymentMethod: 'Njia ya malipo si sahihi',
  phoneRequiredMobile: 'Nambari ya simu inahitajika kwa malipo ya simu',
  invalidPhoneNumber: 'Nambari ya simu ya Tanzania si sahihi',
  orderNotFoundOrPaid: 'Oda haijapatikana au tayari imelipwa',
  cashPaymentRecorded: 'Malipo ya taslimu yamerekodiwa. Oda imethibitishwa!',
  paymentGatewayError: 'Hitilafu ya malipo. Tafadhali jaribu tena.',
  paymentInitiated: 'Malipo yameanzishwa — angalia simu yako kwa USSD',
  transactionNotFound: 'Muamala haujapatikana',

  // Messages
  notAllowed: 'Hairuhusiwi',
  shopIdRequired: 'shop_id inahitajika',
  cannotChatOwnShop: 'Huwezi kuzungumza na duka lako mwenyewe',
  conversationNotFound: 'Mazungumzo hayajapatikana',
  messageRequired: 'Ujumbe unahitajika',
  messageTooLong: 'Ujumbe ni mrefu sana (upeo herufi 2000)',

  // Admin
  shopApproved: 'Duka limeidhinishwa!',
  shopRejected: 'Duka limekataliwa',

  // Owner
  noShopFound: 'Hakuna duka lililopatikana',
  noFieldsToUpdate: 'Hakuna sehemu za kubadilisha',
  shopUpdated: 'Duka limesasishwa',

  // Server
  tooManyRequests: 'Maombi mengi sana. Tafadhali jaribu tena baadaye.',
  tooManyLogins: 'Majaribio mengi ya kuingia. Tafadhali subiri dakika 15.',
  tooManyOtp: 'Maombi mengi ya OTP. Tafadhali subiri dakika chache.',
  internalError: 'Hitilafu ya ndani imetokea. Tafadhali jaribu tena baadaye.',

  // SMS
  smsOtp: (otp) => `Nambari yako ya uthibitisho ya Laundry Connect ni: ${otp}. Nambari hii itaisha baada ya dakika 10. Usimwambie mtu yeyote.`,
  smsReset: (otp) => `Nambari yako ya kubadilisha nywila ya Laundry Connect ni: ${otp}. Nambari hii itaisha baada ya dakika 10. Ikiwa hukuomba, puuza.`,

  // Email
  emailOtpSubject: 'Nambari Yako ya Uthibitisho ya Laundry Connect',
  emailOtpGreeting: 'Karibu! Nambari yako ya uthibitisho ni:',
  emailOtpFooter: 'Nambari hii itaisha baada ya dakika 10. Ikiwa hukuomba, puuza barua pepe hii.',
  emailResetSubject: 'Badilisha Nywila Yako ya Laundry Connect',
  emailResetGreeting: 'Habari! Umeomba kubadilisha nywila ya akaunti yako.',
  emailResetInstruction: 'Bonyeza kitufe hapa chini kuweka nywila mpya:',
  emailResetButton: 'Badilisha Nywila',
  emailResetLinkNote: 'Au nakili kiungo hiki kwenye kivinjari chako:',
  emailResetCodeLabel: 'Nambari yako ya kubadilisha ni:',
  emailResetFooter: 'Kiungo hiki kitaisha baada ya dakika 10. Ikiwa hukuomba, akaunti yako ni salama — puuza barua pepe hii.',
};

const translations = { en, sw };

/**
 * Get translation function for a given language
 * @param {string} lang - 'en' or 'sw'
 * @returns {function} t(key, ...args)
 */
function getTranslator(lang = 'en') {
  const dict = translations[lang] || translations.en;
  return function t(key, ...args) {
    const val = dict[key] ?? translations.en[key] ?? key;
    if (typeof val === 'function') return val(...args);
    return val;
  };
}

/**
 * Express middleware to detect language from Accept-Language header or ?lang= query
 */
function languageMiddleware(req, res, next) {
  // Check query param first, then header
  let lang = req.query.lang;
  if (!lang) {
    const acceptLang = req.headers['accept-language'] || '';
    if (acceptLang.includes('sw')) lang = 'sw';
  }
  req.lang = lang === 'sw' ? 'sw' : 'en';
  req.t = getTranslator(req.lang);
  next();
}

module.exports = { getTranslator, languageMiddleware, translations };
