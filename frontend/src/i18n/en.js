// Lot 8 : textes du site client en anglais (bouton FR / EN, réglage du Patron « Site en anglais »).
// Mêmes clés que fr.js (contrôlé par `npm run langues`). Restent en français : noms et descriptions des plats,
// catégories et boissons (en base), messages WhatsApp, motif d'annulation écrit par l'équipe.
// Les erreurs du serveur (en français) sont traduites ici d'après leur code (voir `error`).
import { formatPrice } from '../utils/format.js';

const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const nightLine = (nightFee) => `including ${formatPrice(nightFee)} night surcharge`;
const feeLabel = (fee) => (fee === 0 ? 'Free delivery' : formatPrice(fee));
// « 22:00 » → « 10 pm », « 06:30 » → « 6:30 am »
const hour = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
const quoted = (name) => (name ? `“${name}”` : 'An item');

// Phrases connues de la grille des frais (code FRAIS_LIVRAISON, backend/src/services/delivery-fees.js)
const ZONE_ERRORS = {
  'Ce quartier n’est plus proposé. Choisissez-en un autre dans la liste.': 'This neighbourhood is no longer offered. Choose another one from the list.',
  'Choisissez votre quartier dans la liste ou partagez votre position.': 'Choose your neighbourhood from the list or share your location.',
  'Choisissez votre quartier dans la liste.': 'Choose your neighbourhood from the list.',
  'Choisissez votre quartier ou partagez votre position.': 'Choose your neighbourhood or share your location.',
  'Choisissez votre quartier.': 'Choose your neighbourhood.',
};

// Champ refusé par le serveur (details[].path) → phrase anglaise
function fieldError(detail, err) {
  if (err?.code === 'FRAIS_LIVRAISON') return error(err);
  const path = detail?.path || '';
  if (path === 'customer.name') return 'Enter your full name.';
  if (path === 'customer.phone') return 'Enter a valid WhatsApp number.';
  if (path === 'payment.payerPhone') return 'Enter the number that paid.';
  if (path.startsWith('payment')) return 'Payment is only by Orange Money, Moov Money or Telecel Money.';
  if (path === 'addressNote') return 'Share your location or enter your neighbourhood and a landmark.';
  if (path.startsWith('location')) return 'Your location could not be read. Share it again, or enter landmarks.';
  if (path === 'mode') return 'Choose delivery or pickup.';
  if (path === 'items') return 'Your order is empty.';
  if (path.startsWith('items')) return 'An item in your order could not be read. Check your order, then try again.';
  if (path.startsWith('delivery')) return 'Choose your neighbourhood.';
  return 'Some information is not valid. Please check the form.';
}

// ctx (facultatif) : productName(id) et nameAt(index) pour nommer le plat en cause
function error(err, ctx = {}) {
  const d = err?.details || {};
  const byId = (id) => ctx.productName?.(id);
  const at = (i) => (i == null ? null : ctx.nameAt?.(i));
  switch (err?.code) {
    case 'ERREUR_RESEAU':
      return 'Connection failed. Check your internet connection and try again.';
    case 'SERVICE_INDISPONIBLE':
      return 'The service is temporarily unavailable. Please try again in a minute.';
    case 'TROP_DE_COMMANDES':
      return 'Too many orders sent. Please try again in a few minutes.';
    case 'TROP_DE_DEMANDES':
      return 'Too many attempts. Please try again in a few minutes.';
    case 'ERREUR':
      return 'Your order could not be saved. Please try again.';
    case 'COMMANDE_INTROUVABLE':
      return 'Order not found.';
    case 'INTROUVABLE':
      return 'Page not found.';
    case 'JSON_INVALIDE':
      return 'Invalid request.';
    case 'PRODUIT_INCONNU':
      return 'An item in your order no longer exists. Refresh the menu.';
    case 'PRODUIT_INDISPONIBLE':
      return `${quoted(byId(d.productId) || at(d.index))} is no longer available right now.`;
    case 'VARIANTE_INCONNUE':
      return `The option chosen for ${quoted(at(d.index))} no longer exists.`;
    case 'CHOIX_REQUIS':
      return `Make your choice for ${quoted(at(d.index))}.`;
    case 'BOISSON_EN_TROP':
      return `${quoted(at(d.index))} does not include a drink. Add it separately.`;
    case 'BOISSONS_A_CHOISIR':
      return `Choose the drinks for ${quoted(at(d.index))}.`;
    case 'BOISSON_INCONNUE':
      return 'A drink you chose no longer exists. Refresh the menu.';
    case 'BOISSON_INDISPONIBLE':
      return `${quoted(byId(d.productId))} is no longer available right now. Choose another drink.`;
    case 'FRAIS_LIVRAISON':
      return ZONE_ERRORS[err.message] || 'Choose your neighbourhood or share your location.';
    case 'FRAIS_CHANGES': {
      const q = d.quote;
      if (!q || q.fee == null) return 'The delivery fee has changed: it will be confirmed by our team by phone. Check, then send again.';
      const fee = q.fee === 0 ? 'free delivery' : q.nightFee ? `${formatPrice(q.fee)}, ${nightLine(q.nightFee)}` : formatPrice(q.fee);
      return `The delivery fee has changed: ${fee}. Check, then send again.`;
    }
    case 'DONNEES_INVALIDES':
      return fieldError(Array.isArray(d) ? d[0] : null);
    case 'AVIS_INTROUVABLE':
      return 'This review link does not exist. Check that it is complete.';
    case 'AVIS_DEJA_DONNE':
      return 'You have already reviewed this order. Thank you!';
    case 'AVIS_FERMES':
      return 'Reviews are not being collected at the moment. Thank you!';
    case 'AVIS_EXPIRE':
      return 'This link is no longer valid: reviews can be given within 7 days of the order.';
    case 'AVIS_INVALIDE':
      return 'Please give a rating to each question.';
    default:
      return 'Something went wrong. Please try again in a moment.';
  }
}

export default {
  lang: {
    group: 'Site language',
  },
  layout: {
    docTitle: 'Belchicken Burkina · Order online',
    homeAria: 'Belchicken Burkina, home',
    subtitle: 'Order online',
    backToMenu: '‹ Back to menu',
    open: 'Open for orders',
    closed: 'Closed',
    status: {
      allDaySaturday: 'open 24 hours today, until midnight',
      allDay: 'open 24 hours today',
      until: (h) => `until ${hour(`${h}:00`)}`,
      midnight: 'reopens at midnight',
      reopen: (h) => `reopens at ${hour(`${h}:00`)}`,
    },
    whatsapp: 'WhatsApp: ',
    navAria: 'Main navigation',
    home: 'Home',
    menu: 'Menu',
    infos: 'Practical info',
    myOrder: 'My order',
    footOrder: 'Order',
    footHelp: 'Help',
    footDeliveryPayment: 'Delivery and payment',
    footHours: 'Opening hours',
    footContact: 'Contact',
    footRestaurant: 'Restaurant: ',
    footWhatsapp: 'WhatsApp (orders and tracking): ',
    footMaps: 'Directions on Google Maps',
    footCfa: 'Prices in CFA francs',
  },
  restaurant: {
    address: 'Kamsonghin, opposite Sonia Hôtel',
    hours: [
      { days: 'Sunday – Thursday', time: '6 am – 11 pm' },
      { days: 'Friday – Saturday', time: 'Open 24 hours' },
    ],
  },
  common: {
    retry: 'Try again',
    seeMenu: 'See the menu',
    directions: 'Directions',
    contactWhatsapp: 'Contact us on WhatsApp',
    loadingOrder: 'Loading your order…',
    menuUnavailable: 'Menu unavailable',
    decrease: 'Decrease',
    increase: 'Increase',
    close: 'Close',
    unavailable: 'Unavailable',
    spicy: 'Spicy',
    number: (n) => `No. ${n}`,
    itemsTotal: 'Food total',
    deliveryFee: 'Delivery fee',
    optional: '(optional)',
  },
  fees: {
    feeLabel,
    nightLine,
    hour,
    drinks: (drinks, lineQuantity = 1) => {
      if (!drinks?.length) return '';
      const total = drinks.reduce((n, d) => n + d.quantity, 0) * lineQuantity;
      return total === 1 ? `Drink: ${drinks[0].name}` : `Drinks: ${drinks.map((d) => `${d.quantity * lineQuantity} ${d.name}`).join(', ')}`;
    },
    paidToCourier: 'Paid to the delivery rider on arrival, in cash or by mobile money with the merchant code.',
    toConfirm: 'Confirmed by our team by phone',
    independent: 'Delivery fee: paid directly to the rider on delivery. It is not included in your payment.',
  },
  date: {
    time,
    full: (iso) => `${new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} at ${time(iso)}`,
  },
  home: {
    title: 'Order your Belchicken meal online',
    lead: 'Choose your dishes, send your order, and our team confirms everything on WhatsApp.',
    deliveryPayment: 'Delivery and payment ›',
    chefTitle: 'Chef Belchicken has you covered',
    chefText: 'Crispy chicken, burgers and buckets, made to order.',
    howTo: 'How to order',
    stepsPhotoAlt: 'A Belchicken rider hands an order to a customer',
    steps: [
      ['Choose your dishes', 'Browse the menu by category.'],
      ['Check your order', 'Adjust quantities if needed.'],
      ['Enter your details', 'Contact, payment and location.'],
      ['Get the confirmation', 'Our team contacts you on WhatsApp.'],
    ],
  },
  menu: {
    loading: 'Loading the menu…',
    search: 'Search for a dish or a number',
    closeSearch: 'Close search',
    openSearch: 'Search for a dish',
    categories: 'Categories',
    results: (n, q) => `${n} result${n > 1 ? 's' : ''} for “${q}”`,
    noResult: 'No dish found. Try a number, for example 7 or 26.',
    others: 'Others',
  },
  card: {
    added: (n) => `${n} added`,
    from: 'From ',
    add: 'Add',
    addAria: (name) => `Add ${name}`,
    unavailableAria: (name) => `${name} unavailable`,
    photoSoon: 'Photo coming soon',
    menuLabel: 'Menu',
  },
  dialog: {
    removeOne: (name) => `Remove one ${name}`,
    addOne: (name) => `Add one ${name}`,
    formula: 'Option',
    yourChoice: 'Your choice',
    yourDrink: 'Your drink ',
    included: '(included)',
    yourDrinks: (n) => `Your ${n} drinks `,
    includedCount: (chosen, n) => `(included) · ${chosen}/${n}`,
    addDrinkLegend: 'Add a drink ',
    addDrinkNote: '(extra, regular price)',
    addDrinkButton: '+ Add a drink',
    kitchenNote: 'Note for the kitchen ',
    notePlaceholder: 'No onion, sauce on the side…',
    chooseDrink: 'Choose your drink',
    moreDrinks: (n) => `${n} more drink${n > 1 ? 's' : ''}`,
    add: 'Add',
  },
  // Lot 11 : kiosk-style menu (/menu, « Menu façon borne » setting)
  borne: {
    back: 'Back',
    prev: 'See previous items',
    next: 'See next items',
    free: 'Included',
    includedDrinks: (n) => (n === 1 ? 'Your included drink' : `Your ${n} included drinks`),
    toChoose: (n) => `${n} to choose`,
    chosen: '✓ Chosen',
    allCategories: 'Search across all menu categories',
    extraDrinks: 'Extra drinks',
    extraNote: 'Extra, at the price shown',
    addNote: '+ Add a note for the kitchen',
  },
  orderBar: {
    count: (n) => `${n} item${n > 1 ? 's' : ''} in your order`,
    see: 'View my order',
  },
  progress: {
    aria: 'Progress',
    steps: ['Choose dishes', 'Check', 'Details', 'Confirmation'],
  },
  // "Simplified order": very little text, one short sentence at most per block
  simple: {
    bar: (n, total) => `Order · ${n} item${n > 1 ? 's' : ''} · ${total}`,
    added: (name) => `+ ${name}`,
    summary: (n, total) => `${n} item${n > 1 ? 's' : ''} · ${total}`,
    edit: 'Change',
    editDone: 'Done',
    sideTitle: 'Your order',
    sideEmpty: 'Choose your dishes.',
    sheetTitle: 'My order',
    close: 'Close',
    empty: 'Your order is empty.',
    order: 'Order',
    title: 'Order',
    delivery: 'Delivery',
    pickup: 'Pickup',
    useLocation: '📍 Use my location',
    locating: 'Finding your location…',
    relocate: '📍 Find my location again',
    onMap: 'Choose on the map',
    mapHint: 'Tap the map where we should deliver.',
    mapDone: 'Point chosen on the map',
    geoDone: 'Location found',
    geoRefused: 'Location unavailable: choose on the map.',
    price: (fee, km) => `Delivery: ${fee}${km ? ` (${km})` : ''}`,
    priceFree: (km) => `Free delivery${km ? ` (${km})` : ''}`,
    priceLater: 'Delivery: price confirmed by our team',
    priceLoading: 'Calculating the price…',
    km: (d) => `${d} km`,
    estimate: 'Estimated distance.',
    landmark: 'Landmark (optional)',
    landmarkPh: 'E.g. near the pharmacy',
    name: 'Your name',
    phone: 'Your phone',
    pay: 'Payment',
    payer: 'Number that paid',
    recap: (meal, fee) => `Meal: ${meal} now.${fee ? ` Delivery: ${fee} to the rider.` : ''}`,
    recapLater: (meal) => `Meal: ${meal} now. Delivery: to the rider.`,
    pickupAt: (address) => `Pickup at the restaurant: ${address}.`,
    send: 'Send my order',
    sending: 'Sending…',
    missingLead: 'Still needed:',
    missing: { geo: 'your location', price: 'the delivery price', name: 'your name', phone: 'your phone', method: 'the operator', payer: 'the number that paid' },
  },
  cart: {
    title: 'My order',
    emptyTitle: 'Your order is empty',
    emptyText: 'Browse the menu and add the dishes you like.',
    remove: 'Remove',
    addMore: '‹ Add more dishes',
    total: 'Total',
    articles: (n) => `${n} item${n > 1 ? 's' : ''}`,
    delivery: 'Delivery',
    deliveryNote: 'Depends on the neighbourhood · free for pickup',
    blocked: 'Remove the unavailable dishes to continue.',
    continue: 'Continue',
    gone: 'No longer available right now',
    changed: 'Option changed: remove this dish, then add it again',
    drinkGone: (name) => `${name} is no longer available: remove this dish and choose another drink`,
    note: (note) => `“${note}”`,
  },
  payCode: {
    payNow: 'Pay now',
    copy: 'Copy the code',
    copied: 'Code copied ✓',
    copyFailed: 'Could not copy: type the code by hand.',
  },
  checkout: {
    title: 'Your details',
    required: 'Fields marked with an asterisk {star} are required.',
    errName: 'Enter your full name.',
    errPhone: 'Enter a valid WhatsApp number.',
    errMethod: 'Choose your mobile money operator.',
    errMethodShort: 'Choose the payment method.',
    errPayer: 'Enter the number that paid.',
    errZoneGps: 'Choose your neighbourhood or share your location.',
    errZone: 'Choose your neighbourhood.',
    errGeo: 'Share your location or enter your neighbourhood and a landmark.',
    errAddr: 'Enter at least a neighbourhood and a landmark.',
    errAddrShort: 'Enter your delivery place.',
    toComplete: (n, list) => `${n} thing${n > 1 ? 's' : ''} to complete: ${list}`,
    modes: {
      LIVRAISON: ['Delivery', 'To your home or office, fee depends on the neighbourhood'],
      A_EMPORTER: ['Pickup', 'You collect your order at the restaurant, no fee'],
    },
    zoneLabel: 'Your neighbourhood ',
    zoneHintGps: 'Choose your neighbourhood, or share your location below: the fee then depends on the distance.',
    zoneHint: 'The delivery fee depends on the neighbourhood.',
    nightHint: (from, to) => `Night surcharge included in the prices, from ${from} to ${to}.`,
    zoneSearch: 'Search for your neighbourhood',
    zoneAria: 'Neighbourhood',
    zoneNone: (q, other) => `No neighbourhood matches “${q}”.${other ? ' Choose “Other neighbourhood”.' : ''}`,
    otherZone: 'Other neighbourhood',
    otherZoneSub: 'You can’t find yours in the list',
    toConfirm: 'To be confirmed',
    km: (d) => `about ${d} km from the restaurant`,
    feeChooseGps: 'Choose your neighbourhood or share your location',
    feeChoose: 'Choose your neighbourhood',
    feeLoading: 'Calculating…',
    feeUnavailable: 'Unavailable',
    feeNightIncluded: ', night surcharge included',
    feeNothing: 'nothing to pay the delivery rider.',
    payHint: 'Choose your operator: the payment code appears with the amount already filled in.',
    payLoadFailed: 'The payment code could not be loaded. ',
    payLoading: 'Loading the payment code…',
    payWith: 'Pay **{amount}** with {operator} using this code:',
    payMerchant: 'Your confirmation will show the name **{merchant}**: this is Belchicken’s account. No fees. Once paid, enter below the number that paid: your order is prepared as soon as the payment is checked.',
    contact: 'Contact details',
    name: 'Full name',
    phone: 'WhatsApp number',
    payment: 'Payment',
    operator: 'Your operator ',
    merchantCode: 'Merchant code',
    payer: 'Number that paid',
    mode: 'Delivery or pickup',
    geoShare: 'Share my location',
    geoShareSub: 'Recommended: the rider comes straight to you.',
    geoSearching: 'Finding your location…',
    geoDenied: 'Location not available',
    geoDeniedSub: 'Allow location access, or enter your landmarks below.',
    geoUnsupported: 'Sharing unavailable. Enter your landmarks below.',
    geoDone: 'Location shared',
    geoAccuracy: (m) => `Accurate to about ${m} m`,
    geoRefresh: 'Update',
    geoButton: 'Share',
    landmarks: 'Landmarks',
    zoneLandmarks: 'Neighbourhood and landmarks',
    landmarksHint: 'Required if you don’t share your location',
    landmarksPh: 'Blue gate after the pharmacy',
    zoneLandmarksPh: 'Patte d’Oie, blue gate after the pharmacy',
    pickupWrite: 'We message you on WhatsApp as soon as your order is ready.',
    yourOrder: 'Your order',
    feeLater: 'Delivery fee depends on your neighbourhood: given after your payment is checked, on WhatsApp and on the tracking page. You pay it to the delivery rider on arrival, in cash or by mobile money with the merchant code.',
    pickupNote: (address) => `Pickup: no delivery fee. You collect your order at the restaurant, ${address}.`,
    blocked: 'A dish is no longer available. Remove it in My order to continue.',
    sending: 'Sending…',
    send: 'Send my order',
    slow: 'Sending, please wait…',
    // Plan 3: delivery fee per kilometre, to accept before paying for the meal
    kmFee: {
      title: 'Your delivery fee',
      line: (fee, km) => `Delivery: ${fee}${km ? ` (${km})` : ''}, to pay the rider`,
      lineZone: (fee, zone) => `Delivery: ${fee} (${zone}), to pay the rider`,
      lineFree: (km) => `Free delivery${km ? ` (${km})` : ''}: nothing to pay the rider`,
      road: (d) => `${d} km by road`,
      estimate: 'Estimated distance: our calculation service is not responding right now.',
      how: 'Paid to the rider on delivery, in cash or by mobile money. Not included in the payment for your meal.',
      accept: 'I accept',
      accepted: 'Fee accepted',
      change: 'Change',
      waiting: 'Share your location or choose your neighbourhood to see your delivery fee.',
      lockPay: 'First accept your delivery fee (step 2): the payment for your meal then appears.',
      needAccept: 'Accept your delivery fee.',
    },
    back: '‹ Back to my order',
  },
  tracking: {
    title: 'Order tracking',
    sent: 'Order sent',
    introFresh: (phone) => `Keep this page: it tracks your order live. We also message you on WhatsApp at ${phone}.`,
    intro: (reference) => `Order ${reference}. This page updates by itself.`,
    steps: {
      PAIEMENT_A_VERIFIER: 'Order received',
      PAYEE: 'Payment checked',
      EN_PREPARATION: 'Being prepared',
      EN_LIVRAISON: 'On the way',
      LIVREE: 'Delivered',
      PRETE: 'Ready for pickup',
      RETIREE: 'Collected',
    },
    aria: 'Your order tracking',
    cancelled: 'Order cancelled',
    live: 'Live updates',
    offline: 'Connection lost, trying again…',
    summary: 'Order summary',
    reference: 'Reference',
    item: 'Item',
    qty: 'Qty',
    amount: 'Amount',
    total: 'Total',
    customer: 'Customer',
    payment: 'Payment',
    paidFrom: (phone) => ` · from ${phone}`,
    delivery: 'Delivery',
    positionShared: 'Location shared',
    pickup: 'Pickup',
    pickupInfo: (address) => `Collect at the restaurant, ${address} · no delivery fee`,
    feeToConfirm: 'To be confirmed by our team by phone, then shown here',
    feeLater: 'Depends on your neighbourhood: shown here once your payment is checked',
    feeFree: 'Free delivery: nothing to pay the delivery rider',
    feePaid: 'paid, thank you',
    feeDue: 'to pay the delivery rider on arrival',
    print: 'Print',
    backToMenu: 'Back to menu',
    feeHow: 'To pay the delivery rider on arrival, in cash or by mobile money with the merchant code:',
    feeMerchant: 'Your confirmation will show the name **{merchant}**: {account}. No fees.',
    accountPartner: 'this is our delivery partner’s account',
    accountBelchicken: 'this is Belchicken’s account',
    checking: 'We are checking your payment of **{amount}** on our merchant phone.',
    pickupChecking: 'We are checking your payment of **{amount}** on our merchant phone. We will message you on WhatsApp as soon as your order is ready.',
    pickupPaid: 'Payment checked, thank you! Your order will now be prepared. We will message you as soon as it is ready for pickup.',
    pickupPreparing: 'Your order is being prepared. We will message you on WhatsApp as soon as it is ready for pickup.',
    pickupReady: 'Your order is ready! Come and collect it at the restaurant.',
    pickupCode: 'At the counter, give the **4-digit pickup code** you received on WhatsApp in the “order ready” message.',
    pickupDone: 'Order collected. Thank you for your trust, enjoy your meal!',
    knownFree: ' Free delivery: nothing to pay the delivery rider.',
    knownFee: ' Delivery fee: **{fee}**{night}, to pay the delivery rider on arrival.',
    reason: 'Reason: **{reason}**. ',
    contactUs: 'For any question, contact us on WhatsApp.',
    checkingToConfirm: ' Our team will call you to confirm the delivery fee.',
    checkingLater: ' Then we will show you the delivery fee for your neighbourhood here and on WhatsApp.',
    paidToConfirm: 'Payment checked, thank you! Our team will call you to confirm the delivery fee: it will then appear here.',
    paidFeeLater: 'Payment checked, thank you! We are working out the delivery fee for your neighbourhood: it will appear here in a moment and be sent to you on WhatsApp.',
    preparing: 'Your order is being prepared.',
    paidWillPrepare: 'Payment checked, thank you! Your order will now be prepared.',
    willPrepare: 'Your order will now be prepared.',
    freeDelivery: ' Free delivery: nothing to pay the delivery rider.',
    feeReceived: 'Delivery fee of **{fee}** received. ',
    onTheWayCode: 'Your order is on the way! Keep your phone close: the rider may call you. Give them the code you received on WhatsApp.',
    onTheWay: 'Your order is on the way! Keep your phone close: the rider may call you.',
    onTheWayFree: ' Free delivery: nothing to pay the delivery rider. Give them the code you received on WhatsApp.',
    delivered: 'Order delivered. Thank you for your trust, enjoy your meal!',
    // Plan 4, tracking without WhatsApp
    direct: {
      introFresh: 'Keep this page: it tracks your order live. You can also get an alert on this phone.',
      onTheWayCode: 'Your order is on the way! Keep your phone close. Give the rider the delivery code shown here.',
      onTheWayFree: ' Free delivery: nothing to pay the delivery rider. Give them the delivery code shown here.',
      pickupChecking: 'We are checking your payment of **{amount}** on our merchant phone. This page tells you as soon as your order is ready.',
      pickupPaid: 'Payment checked, thank you! Your order will now be prepared. This page tells you as soon as it is ready for pickup.',
      pickupPreparing: 'Your order is being prepared. This page tells you as soon as it is ready for pickup.',
      pickupCode: 'At the counter, give the **4-digit pickup code** shown on this page.',
      checkingLater: ' Then we will show you the delivery fee for your neighbourhood here.',
      paidFeeLater: 'Payment checked, thank you! We are working out the delivery fee for your neighbourhood: it will appear here in a moment.',
      courier: 'Your rider',
      call: (name) => `Call ${name}`,
      code: 'Delivery code',
      codeHelp: 'Give this code to the rider when they hand you your order.',
      pickupCodeTitle: 'Pickup code',
      pickupCodeHelp: 'Give this code at the counter.',
      thanks: 'Thank you for ordering from Belchicken Burkina!',
      review: 'Leave a review',
      share: 'Share the link',
      copy: 'Copy the link',
      copied: 'Link copied',
      keep: 'Keep this link to find your order again, or send it to the person receiving it.',
      alertsOn: 'Get an alert on this phone',
      alertsBusy: 'Turning on…',
      alertsDone: 'Alerts on: you will be told when your order leaves and when it is delivered.',
      alertsIos: 'On iPhone: tap Share then “Add to Home Screen”, then open Belchicken from your home screen to get alerts. Otherwise, keep this page open: it updates by itself.',
      alertsDenied: 'Alerts are blocked in your phone settings. Keep this page open: it updates by itself.',
      alertsUnsupported: 'This phone cannot receive alerts from the site. Keep this page open: it updates by itself.',
      alertsError: 'Alerts could not be turned on. Keep this page open: it updates by itself.',
      locked: 'To see your rider, the delivery code and the amount to pay, open the tracking link you got when ordering, on the phone that placed the order.',
      current: 'Your current order',
      currentOpen: (reference) => `Order ${reference}: see tracking`,
    },
  },
  review: {
    docTitle: 'Your review · Belchicken Burkina',
    subtitle: 'Your review',
    words: ['Very bad', 'Bad', 'Average', 'Good', 'Excellent'],
    starAria: (n, word) => `${n} star${n > 1 ? 's' : ''}: ${word}`,
    loading: 'Loading…',
    notFoundTitle: 'Link not found',
    notFoundText: 'This review link does not exist. Check that it is complete, or message us on WhatsApp.',
    errorTitle: 'Page unavailable',
    thanksTitle: (name) => `Thank you${name ? ` ${name}` : ''}!`,
    thanksText: 'Your review has been saved. It helps us serve you better. See you soon at Belchicken Burkina!',
    expiredTitle: 'Link expired',
    expiredText: 'Reviews can be given within 7 days of the order. To tell us something, message us on WhatsApp.',
    closedTitle: 'Reviews unavailable',
    closedText: 'Reviews are not being collected at the moment. To tell us something, message us on WhatsApp.',
    questions: {
      callCenter: ['The call center', 'Welcome, speed, payment'],
      food: ['The restaurant', 'Taste, quantity, presentation'],
      delivery: ['The delivery', 'Time, rider, condition of the order'],
    },
    missing: (list) => `Choose a rating for: ${list}.`,
    hello: (name) => `Hello${name ? ` ${name}` : ''}!`,
    lead: 'How was your {pickup}order **{reference}**? Tap the stars, it takes a minute.',
    leadPickup: 'pickup ',
    comment: 'A comment?',
    commentPh: 'What you liked, what we can improve…',
    sending: 'Sending…',
    send: 'Send my review',
    foot: 'One review per order. Your number is never shown.',
  },
  infos: {
    title: 'Practical info',
    lead: 'Delivery, payment, opening hours and contact.',
    delivery: 'Delivery',
    deliveryText: 'We deliver to homes and offices. The fee depends on your neighbourhood: once your payment is checked, our team tells you the amount on WhatsApp and on your order tracking page. You pay it to the delivery rider on arrival, in cash or by mobile money with the merchant code. You can also collect your order at the restaurant.',
    payment: 'Payment',
    paymentText: 'Payment is made before delivery, by Orange Money, Moov Money or Telecel Money, with the merchant code. When you order, the code appears with the amount already filled in: just dial it, then enter the number that paid.',
    amountWord: 'amount',
    merchant: 'Name shown on your confirmation: **{merchant}**, Belchicken’s account. No fees.',
    hours: 'Opening hours',
    contact: 'Contact',
    restaurant: 'Restaurant',
    whatsapp: 'WhatsApp',
    whatsappSub: 'Orders and tracking',
    address: 'Address',
    plusCode: 'Plus Code',
  },
  install: {
    aria: 'Install the app',
    title: 'Install the app',
    text: 'Order from your home screen',
    how: 'How?',
    install: 'Install',
    close: 'Close',
    step1: 'Tap the **Share** button {icon} at the bottom of the screen (or at the top on iPad).',
    step2: 'Scroll down, then tap **Add to Home Screen**.',
    step3: 'Tap **Add**: the {name} icon appears on your home screen.',
    shareIcon: '(square with an arrow pointing up)',
  },
  error,
  fieldError,
};
