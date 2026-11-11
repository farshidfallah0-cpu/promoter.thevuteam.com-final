// SAMPLE of the store list. The real file `mehramStores.js` (same schema, ~730 stores with owners' names / phones / addresses)
// is NOT in this public repo — it is listed in .gitignore. To build from a fresh clone:
//   cp mehramStores.sample.js mehramStores.js        (an app with 4 demo stores), or restore the real file (docs/OPERATIONS.md).
//
// Schema of one store:
//   id            customer code (کد مشتری) — unique, string
//   city          must equal an entry of MEHRAM_CITIES in mehramData.js («تهران» covers west + east)
//   name, sellerName, mobile, landline, district, address, postalCode, customerClass, activityType, route, visitor — plain info
//   lat, lng      coordinates (drives the map, directions buttons and the «out of area» check)
//   samplingSelected  (optional) true = picked for sampling
//   addedFrom     (optional) epoch ms of the Saturday-00:00 (Tehran) week start the store first exists in the plan
//   removedFrom   (optional) epoch ms of the week start it is gone from (e.g. it stopped cooperating); earlier weeks are untouched
// National IDs are deliberately never imported: this file ships in the public JS bundle.
export const MEHRAM_STORES = [
  {"id": "5110000001", "city": "تهران", "name": "سوپر نمونه یک", "sellerName": "فروشنده‌ی نمونه", "mobile": "09120000001", "landline": "02100000001", "district": "تهران 5", "address": "آدرس نمونه - خیابان نمونه - پلاک ۱", "postalCode": "1234567890", "customerClass": "A+", "activityType": "سوپرمارکت", "route": "مسیر نمونه ۱", "visitor": "ویزیتور نمونه", "samplingSelected": true, "lat": 35.7391, "lng": 51.3103},
  {"id": "5110000002", "city": "تهران", "name": "سوپر نمونه دو (تازه اضافه‌شده)", "sellerName": "فروشنده‌ی نمونه", "address": "آدرس نمونه", "customerClass": "A", "activityType": "سوپرمارکت", "lat": 35.7001, "lng": 51.4002, "addedFrom": 1793392200000},
  {"id": "5110000003", "city": "تهران", "name": "سوپر نمونه سه (حذف‌شده از هفته‌ی ۳)", "sellerName": "فروشنده‌ی نمونه", "address": "آدرس نمونه", "customerClass": "A", "activityType": "سوپرمارکت", "lat": 35.7201, "lng": 51.3902, "removedFrom": 1793997000000},
  {"id": "5130000004", "city": "مازندران", "name": "فروشگاه نمونه چهار", "sellerName": "فروشنده‌ی نمونه", "address": "ساری - خیابان نمونه", "customerClass": "B", "activityType": "سوپرمارکت", "visitor": "ویزیتور نمونه", "lat": 36.5629, "lng": 52.6716},
];
