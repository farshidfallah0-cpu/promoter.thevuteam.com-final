/**
 * Data for the Mehram supermarket report.
 *
 * Cities live here; stores live in ./mehramStores.js (each store's `city` must equal
 * one entry of MEHRAM_CITIES). All cities have stores. Any extra key
 * listed in STORE_INFO_FIELDS is shown automatically in the info modal when the
 * store has a value for it (add a new row there to expose a new column).
 */

export { MEHRAM_STORES } from './mehramStores';

/**
 * Stores can carry a week window (epoch ms of a week start, see weekStart() in mehramVisits.js):
 * `addedFrom` = first week the store exists in the plan (shown as «تازه اضافه شده»), `removedFrom` =
 * first week it is gone (it reported «همکاری نمی‌کند»). Earlier weeks are never touched. week 'all' = no window.
 */
export const isStoreActiveInWeek = (store, week) => week === 'all'
  || ((!store.addedFrom || week >= store.addedFrom) && (!store.removedFrom || week < store.removedFrom));
export const isStoreNew = (store, week) => !!store.addedFrom && (week === 'all' || week >= store.addedFrom);

// Tehran was once split into west / east; reports saved back then still carry those names.
export const normCity = (c) => (c === 'تهران غرب' || c === 'تهران شرق' ? 'تهران' : c);

export const MEHRAM_CITIES = [
  'تهران',
  'کرج',
  'تبریز',
  'رشت',
  'مازندران',
  'مشهد',
];

// Order = order of rows in the info modal.
export const STORE_INFO_FIELDS = [
  { key: 'name', label: 'نام سوپرمارکت', icon: 'store' },
  { key: 'sellerName', label: 'نام فروشنده', icon: 'user' },
  { key: 'mobile', label: 'شماره موبایل', icon: 'phone', kind: 'tel' },
  { key: 'landline', label: 'شماره تلفن', icon: 'phone', kind: 'tel' },
  { key: 'city', label: 'شهر', icon: 'city' },
  { key: 'district', label: 'منطقه', icon: 'city' },
  { key: 'town', label: 'شهر واقعی (طبق مختصات)', icon: 'city' },
  { key: 'address', label: 'آدرس', icon: 'pin' },
  { key: 'postalCode', label: 'کد پستی', icon: 'pin' },
  { key: 'customerClass', label: 'کلاس مشتری', icon: 'note' },
  { key: 'activityType', label: 'نوع فعالیت', icon: 'store' },
  { key: 'route', label: 'مسیر ویزیت', icon: 'pin' },
  { key: 'visitor', label: 'ویزیتور', icon: 'user' },
];

// Shelf-report multiple-choice questions. `value` is what gets saved/exported.
// `noteOn` (optional) = the option that also requires a written explanation;
// the text is saved in the report's `notes[key]`.
export const SHELF_QUESTIONS = [
  // `noteOptional`: the written explanation opens for `noteOn` but may be left empty.
  { key: 'storeCooperates', title: 'همکاری فروشگاه', options: ['همکاری می‌کند', 'همکاری نمی‌کند'], noteOn: 'همکاری نمی‌کند', noteOptional: true },
  { key: 'shelfTalkerInstall', title: 'شلف تاکر نصب شده؟', options: ['بله', 'خیر'], noteOn: 'خیر' },
  // Was «وضعیت شلف» (مرتب / نامنظم / …): same key, so older reports keep their recorded answers.
  { key: 'shelfStatus', title: 'وضعیت شلف تاکر قبلی', options: ['محصول مهرام دارد', 'محصول مهرام کم دارد', 'محصول مهرام ندارد', 'شلف تاکر ندارد'] },
];

// Questions come from the section's own settings (field.shelfQuestions, editable
// in the event builder); an unset field falls back to the defaults above.
export const getShelfQuestions = (field) => {
  if (!Array.isArray(field?.shelfQuestions)) return sortQuestions(SHELF_QUESTIONS);
  // Drop half-edited entries (blank title / blank options / fewer than 2 options).
  return sortQuestions(field.shelfQuestions
    .map((q) => {
      const options = (q.options || []).map((o) => String(o).trim()).filter(Boolean);
      return { ...q, title: String(q.title || '').trim(), options, noteOn: options.includes(q.noteOn) ? q.noteOn : undefined };
    })
    .filter((q) => q.key && q.title && q.options.length >= 2));
};

// «گروه محصولات»: stock status of each product group in the store, plus one
// required photo. Saved per report as `products: { [key]: status }` + `productsPhoto`.
export const PRODUCT_GROUPS = [
  { key: 'pickles', title: 'ترشیجات و خیارشورها' },
  { key: 'olives', title: 'زیتون' },
  { key: 'juices', title: 'افشره‌ها (آب نارنج، آبغوره، آبلیمو)' },
  { key: 'canned', title: 'کنسروها و رب‌ها' },
  { key: 'jamHoney', title: 'مربا و عسل' },
];

// Display order, whatever order an event's own settings hold: unknown keys keep their place after these.
const byPriority = (order) => (list) => [...list].sort((a, b) => {
  const ia = order.indexOf(a.key); const ib = order.indexOf(b.key);
  return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
});
const sortQuestions = byPriority(['storeCooperates', 'shelfTalkerInstall', 'shelfStatus']);
const sortGroups = byPriority(['pickles', 'olives', 'juices', 'canned', 'jamHoney']);

export const PRODUCT_STATUSES = ['موجود', 'ناکافی', 'موجود نیست'];

export const getProductGroups = (field) => {
  if (!Array.isArray(field?.productGroups)) return PRODUCT_GROUPS;
  return sortGroups(field.productGroups
    .map((g) => ({ ...g, title: String(g.title || '').trim() }))
    .filter((g) => g.key && g.title));
};

/** «همه / در انتظار تایید / تایید شده / تایید نشده» — one supermarket report's approval state against the chosen chip. */
export const mehramStateMatches = (state, filter) => {
  if (!filter || filter === 'all') return true;
  if (filter === 'approved') return state === 'approved';
  if (filter === 'rejected') return state === 'rejected';
  return state === 'pending' || state === 'changed';
};
