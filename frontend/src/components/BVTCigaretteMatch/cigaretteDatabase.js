// Reference data for the BVT brand-switch tool.
//
// CIGARETTE_DATABASE: the "target" cigarettes a promoter can search for — what the
// contacted smoker currently uses. `name` is the Persian name as it is actually
// said in the Iranian market (colors in Persian: آبی / نقره‌ای / طلایی / ...),
// `en` is the English pack name, `aliases` are every other spelling a promoter
// might type (old transliterations like «بلو/سیلور», international line names).
// tar/nicotine (mg) are approximate — taken from the numbers printed on packs /
// published Iranian-market tables where known, otherwise estimated from the
// line's strength class (e.g. a "4" or "Silver" line ≈ 4mg / 0.4mg). Good
// enough for a "closest match" recommendation, not for a compliance label.
// Where a source gave a range, `tar`/`nicotine` hold the midpoint (used for
// matching) and `tarLabel`/`nicotineLabel` hold the original range for display.
//
// `bvtFamily: 'nano'|'compact'` narrows the recommendation to that BVT segment
// (see matchBvtProduct) — set on nano/super-slim and compact formats.
//
// BVT_PRODUCTS: our own four products. Tar/nicotine values come directly from
// the client's own spec sheet.

const cig = (id, name, en, tar, nicotine, { aliases = [], ...rest } = {}) => ({
  id, name, en, aliases: [en, ...aliases], tar, nicotine, ...rest,
});
const NANO = 'nano';
const COMPACT = 'compact';

export const CIGARETTE_DATABASE = [
  // 🚬 Winston
  cig('winston_super_slim_blue', 'وینستون سوپراسلیم آبی', 'Winston Super Slim Blue', 6, 0.5, { aliases: ['Winston XS Blue', 'Winston Slim Blue', 'وینستون اسلیم آبی', 'وینستون ایکس اس آبی'], bvtFamily: NANO }),
  cig('winston_super_slim_silver', 'وینستون سوپراسلیم نقره‌ای', 'Winston Super Slim Silver', 5, 0.5, { aliases: ['Winston XS Silver', 'Winston Slim Silver', 'Winston Slim Ultra', 'وینستون نقره‌ای سوپراسلیم'], bvtFamily: NANO }),
  cig('winston_xstyle_blue', 'وینستون ایکس استایل آبی', 'Winston XStyle Blue', 6, 0.5, { aliases: ['Winston Style Blue', 'وینستون استایل آبی'] }),
  cig('winston_xstyle_silver', 'وینستون ایکس استایل نقره‌ای', 'Winston XStyle Silver', 4, 0.3, { aliases: ['Winston Style Silver', 'Winston Style Ultra', 'وینستون استایل نقره‌ای'] }),
  cig('winston_nano_blue', 'وینستون نانو آبی', 'Winston Nano Blue', 6, 0.5, { aliases: ['Winston Nano Light'], bvtFamily: NANO }),
  cig('winston_nano_silver', 'وینستون نانو نقره‌ای', 'Winston Nano Silver', 4, 0.4, { aliases: ['Winston Nano Ultra'], bvtFamily: NANO }),
  cig('winston_nova_blue', 'وینستون نوا آبی', 'Winston Nova Blue', 6, 0.5, { aliases: ['Winston Nova Light'], bvtFamily: NANO }),
  cig('winston_nova_silver', 'وینستون نوا نقره‌ای', 'Winston Nova Silver', 4, 0.4, { bvtFamily: NANO }),
  cig('winston_nova_white', 'وینستون نوا سفید', 'Winston Nova White', 1, 0.1, { bvtFamily: NANO }),
  cig('winston_compact_blue', 'وینستون کامپکت آبی', 'Winston Compact Blue', 6, 0.5, { aliases: ['Winston Compact Light'], bvtFamily: COMPACT }),
  cig('winston_compact_silver', 'وینستون کامپکت نقره‌ای', 'Winston Compact Silver', 5, 0.5, { bvtFamily: COMPACT }),
  cig('winston_red', 'وینستون قرمز (عقابی)', 'Winston Red', 10, 0.8, { aliases: ['Winston Classic', 'وینستون کلاسیک', 'وینستون عقابی'] }),
  cig('winston_blue', 'وینستون آبی (لایت)', 'Winston Blue', 8, 0.6, { aliases: ['Winston Light', 'وینستون لایت', 'وینستون بلو'] }),
  cig('winston_silver', 'وینستون نقره‌ای (اولترا)', 'Winston Silver', 4, 0.4, { aliases: ['Winston Ultra', 'Winston White', 'وینستون اولترا', 'وینستون سفید'] }),
  cig('winston_classic_long', 'وینستون کلاسیک پایه بلند', 'Winston Classic 100s', 9, 0.8, { aliases: ['Winston Classic Long', 'Winston 100s'] }),
  cig('winston_4', 'وینستون ۴', 'Winston 4', 4, 0.4),
  cig('winston_platinum_4', 'وینستون پلاتینیوم ۴', 'Winston Platinum 4', 4, 0.4),

  // 🚬 Kent
  cig('kent_mix_aroma_freshlock', 'کنت میکس آروما فرش‌لاک', 'Kent Mix Aroma Freshlock', 7, 0.6, { aliases: ['Kent Mix Aroma'] }),
  cig('kent_mix_freshlock', 'کنت میکس فرش‌لاک', 'Kent Mix Freshlock', 7, 0.6, { aliases: ['Kent Mix', 'Kent Mix 7', 'Kent Purple', 'کنت بنفش', 'کنت میکس'] }),
  cig('kent_switch_8_freshlock', 'کنت سوییچ ۸ فرش‌لاک', 'Kent Switch 8 Freshlock', 8, 0.6, { aliases: ['Kent Switch8 Freshlock', 'Kent Switch 8', 'کنت سوئیچ ۸'] }),
  cig('kent_demi_slim_switch', 'کنت دمی اسلیم سوییچ', 'Kent Demi Slim Switch', 6, 0.5, { aliases: ['کنت دمی اسلیم سوئیچ'] }),
  cig('kent_demi_switch', 'کنت دمی سوییچ', 'Kent Demi Switch', 6, 0.5, { aliases: ['کنت دمی سوئیچ'] }),
  cig('kent_hdi_6', 'کنت HDi ۶ (آبی)', 'Kent HDi 6', 6, 0.5, { aliases: ['Kent HD 6', 'Kent 6', 'Kent Blue', 'کنت اچ دی آی ۶', 'کنت ۶', 'کنت آبی'] }),
  cig('kent_hdi_4', 'کنت HDi ۴ (نقره‌ای)', 'Kent HDi 4', 4, 0.4, { aliases: ['Kent HD 4', 'Kent Silver', 'کنت اچ دی آی ۴', 'کنت نقره‌ای'] }),
  cig('kent_hdi_1', 'کنت HDi ۱ (سفید)', 'Kent HDi 1', 1, 0.1, { aliases: ['Kent HD 1', 'Kent White', 'کنت اچ دی آی ۱', 'کنت سفید'] }),
  cig('kent_red_pug', 'کنت قرمز PUG', 'Kent Red PUG', 10, 0.8, { aliases: ['Kent Red', 'کنت قرمز'] }),
  cig('kent_8_pug', 'کنت ۸ PUG', 'Kent 8 PUG', 8, 0.6, { aliases: ['Kent 8', 'Kent Core 8', 'کنت ۸'] }),
  cig('kent_4_pug', 'کنت ۴ PUG', 'Kent 4 PUG', 4, 0.4, { aliases: ['Kent 4', 'Kent Core 4', 'کنت ۴'] }),
  cig('kent_1_pug', 'کنت ۱ PUG', 'Kent 1 PUG', 1, 0.1, { aliases: ['Kent 1', 'Kent Core 1', 'کنت ۱'] }),
  cig('kent_plus_8_freshlock', 'کنت پلاس ۸ فرش‌لاک', 'Kent Plus 8 Freshlock', 8, 0.6, { aliases: ['Kent Plus8 Freshlock', 'Kent Plus 8'] }),
  cig('kent_plus_6_freshlock', 'کنت پلاس ۶ فرش‌لاک', 'Kent Plus 6 Freshlock', 6, 0.5, { aliases: ['Kent Plus6 Freshlock', 'Kent Plus 6'] }),
  cig('kent_plus_4_freshlock', 'کنت پلاس ۴ فرش‌لاک', 'Kent Plus 4 Freshlock', 4, 0.4, { aliases: ['Kent Plus4 Freshlock', 'Kent Plus 4'] }),
  cig('kent_nanoclick', 'کنت نانوکلیک', 'Kent Nanoclick', 5, 0.5, { aliases: ['Kent Nano Click', 'کنت نانو کلیک'], bvtFamily: NANO }),
  cig('kent_nanotek_4', 'کنت نانوتک ۴', 'Kent Nanotek 4', 4, 0.4, { aliases: ['Kent Nano 4', 'کنت نانو ۴'], bvtFamily: NANO }),
  cig('kent_nanotek_1', 'کنت نانوتک ۱', 'Kent Nanotek 1', 1, 0.1, { aliases: ['Kent Nano 1', 'کنت نانو ۱'], bvtFamily: NANO }),
  cig('kent_ss100_blue', 'کنت SS100 آبی', 'Kent SS100 Blue', 7, 0.6, { aliases: ['Kent Super Slim 100 Blue', 'کنت سوپراسلیم ۱۰۰ آبی', 'کنت اس اس ۱۰۰ آبی'], bvtFamily: NANO }),
  cig('kent_ss100_silver', 'کنت SS100 نقره‌ای', 'Kent SS100 Silver', 5, 0.5, { aliases: ['Kent Super Slim 100 Silver', 'کنت سوپراسلیم ۱۰۰ نقره‌ای', 'کنت اس اس ۱۰۰ نقره‌ای'], bvtFamily: NANO }),
  cig('kent_ss100_click', 'کنت SS100 کلیک', 'Kent SS100 Click', 8, 0.6, { aliases: ['Kent Super Slim 100 Click', 'کنت سوپراسلیم ۱۰۰ کلیک', 'کنت اس اس ۱۰۰ کلیک'], bvtFamily: NANO }),
  cig('kent_crystal_6', 'کنت کریستال ۶', 'Kent Crystal 6', 6, 0.5),
  cig('kent_crystal_4', 'کنت کریستال ۴', 'Kent Crystal 4', 4, 0.4),
  cig('kent_viva_6', 'کنت ویوا ۶', 'Kent VIVA 6mg', 6, 0.5, { aliases: ['Kent Viva 6'] }),
  cig('kent_viva_4', 'کنت ویوا ۴', 'Kent VIVA 4mg', 4, 0.4, { aliases: ['Kent Viva 4'] }),
  cig('kent_green_click_5', 'کنت کلیک سبز ۵', 'Kent Green Click 5', 5, 0.3, { aliases: ['Kent Click', 'کنت سبز کلیک'] }),
  cig('kent_power_8', 'کنت پاور ۸', 'Kent Power 8', 8, 0.6),

  // 🚬 Pall Mall
  cig('pallmall_red', 'پال مال قرمز', 'Pall Mall Red', 10, 0.8),
  cig('pallmall_blue', 'پال مال آبی', 'Pall Mall Blue', 8, 0.7, { aliases: ['Pall Mall Blue Market', 'پال مال بلو'] }),
  cig('pallmall_silver', 'پال مال نقره‌ای', 'Pall Mall Silver', 4, 0.4, { aliases: ['Pall Mall Silver Market', 'پال مال سیلور'] }),
  cig('pallmall_amber_boost', 'پال مال امبر بوست', 'Pall Mall Amber Boost', 5, 0.4),
  cig('pallmall_boost_5', 'پال مال بوست ۵', 'Pall Mall Boost 5', 5, 0.4),
  cig('pallmall_boost_8', 'پال مال بوست ۸', 'Pall Mall Boost 8', 8, 0.6),
  cig('pallmall_cool', 'پال مال کول', 'Pall Mall Cool', 8, 0.7),

  // 🚬 Montana
  cig('montana_red', 'مونتانا قرمز', 'Montana Red', 10, 0.8),
  cig('montana_gold', 'مونتانا طلایی', 'Montana Gold', 6, 0.5, { aliases: ['مونتانا گلد'] }),
  cig('montana_silver', 'مونتانا نقره‌ای', 'Montana Silver', 4, 0.4, { aliases: ['مونتانا سیلور'] }),
  cig('montana_nano_gold', 'مونتانا نانو طلایی', 'Montana Nano Gold', 6, 0.6, { aliases: ['Montana Nano Blue', 'مونتانا نانو آبی'], bvtFamily: NANO }),
  cig('montana_nano_silver', 'مونتانا نانو نقره‌ای', 'Montana Nano Silver', 4, 0.4, { bvtFamily: NANO }),
  cig('montana_red_nano', 'مونتانا نانو قرمز', 'Montana Nano Red', 4, 0.4, { aliases: ['Montana Red Nano'], bvtFamily: NANO }),
  cig('montana_gold_demi', 'مونتانا طلایی دمی', 'Montana Gold Demi', 6, 0.5, { aliases: ['Montana Demi Gold', 'مونتانا دمی طلایی'] }),
  cig('montana_demi_blue', 'مونتانا دمی آبی', 'Montana Demi Blue', 6, 0.5),
  cig('montana_demi_silver', 'مونتانا دمی نقره‌ای', 'Montana Demi Silver', 4, 0.4),
  cig('montana_sline_gold', 'مونتانا اس‌لاین طلایی', 'Montana S-Line Gold', 6, 0.5, { aliases: ['Montana SLine Gold', 'مونتانا اس لاین طلایی'] }),
  cig('montana_sline_silver', 'مونتانا اس‌لاین نقره‌ای', 'Montana S-Line Silver', 4, 0.4, { aliases: ['Montana SLine Silver', 'مونتانا اس لاین نقره‌ای'] }),

  // 🚬 Crystal
  cig('crystal_mode_blue', 'کریستال مود آبی', 'Crystal Mode Blue', 6, 0.5),
  cig('crystal_mode_silver', 'کریستال مود نقره‌ای', 'Crystal Mode Silver', 4, 0.4),
  cig('crystal_extra_blue', 'کریستال اکسترا آبی', 'Crystal Extra Blue', 7, 0.6),
  cig('crystal_extra_silver', 'کریستال اکسترا نقره‌ای', 'Crystal Extra Silver', 5, 0.4),
  cig('crystal_smart_blue', 'کریستال اسمارت آبی', 'Crystal Smart Blue', 6, 0.5),
  cig('crystal_select_capsule', 'کریستال سلکت (کپسولی)', 'Crystal Select (Capsule)', 6, 0.5, { aliases: ['Crystal Select', 'کریستال سلکت'] }),

  // 🚬 Blake (the old «بلک نانو / بلک دمی» entries were this brand)
  cig('blake_demi_blue', 'بلیک دمی آبی', 'Blake Demi Blue', 6, 0.5, { aliases: ['Black Demi Blue', 'بلک دمی آبی', 'بلک دمی بلو'] }),
  cig('blake_demi_silver', 'بلیک دمی نقره‌ای', 'Blake Demi Silver', 4, 0.4, { aliases: ['بلک دمی نقره‌ای'] }),
  cig('blake_nano', 'بلیک نانو', 'Blake Nano', 5, 0.5, { aliases: ['Black Nano Original', 'بلک نانو'], bvtFamily: NANO }),
  cig('blake_nano_1', 'بلیک نانو ۱', 'Blake Nano 1', 1, 0.1, { aliases: ['بلک نانو ۱'], bvtFamily: NANO }),
  cig('blake_superslim100_blue', 'بلیک سوپراسلیم ۱۰۰ آبی', 'Blake Superslim100 Blue', 6, 0.5, { aliases: ['Blake Super Slim 100 Blue'], bvtFamily: NANO }),
  cig('blake_superslim100_silver', 'بلیک سوپراسلیم ۱۰۰ نقره‌ای', 'Blake Superslim100 Silver', 4, 0.4, { aliases: ['Blake Super Slim 100 Silver'], bvtFamily: NANO }),
  cig('blake_king_size', 'بلیک کینگ سایز', 'Blake King Size', 10, 0.8, { aliases: ['Blake King'] }),

  // 🚬 Camel
  cig('camel_compact_blue', 'کمل کامپکت آبی', 'Camel Compact Blue', 6, 0.5, { bvtFamily: COMPACT }),
  cig('camel_compact_silver', 'کمل کامپکت نقره‌ای', 'Camel Compact Silver', 5, 0.5, { bvtFamily: COMPACT }),
  cig('camel_senso_gold', 'کمل سنسو طلایی', 'Camel Senso Gold', 6, 0.6, { aliases: ['Camel Senso Nano Gold', 'کمل سنسو گلد'], bvtFamily: NANO }),
  cig('camel_senso_silver', 'کمل سنسو نقره‌ای', 'Camel Senso Silver', 4, 0.4, { aliases: ['Camel Senso Nano Silver', 'کمل سنسور نقره‌ای', 'کمل سنسو سیلور'], bvtFamily: NANO }),
  cig('camel_blue', 'کمل آبی', 'Camel Blue', 8, 0.7, { aliases: ['Camel Light', 'کمل بلو'] }),
  cig('camel_silver', 'کمل نقره‌ای', 'Camel Silver', 4, 0.4, { aliases: ['کمل سیلور'] }),
  cig('camel_black', 'کمل مشکی', 'Camel Black', 8, 0.6, { aliases: ['کمل بلک'] }),
  cig('camel_white', 'کمل سفید', 'Camel White', 3, 0.3, { aliases: ['کمل وایت'] }),
  cig('camel_yellow', 'کمل زرد (اورجینال)', 'Camel Yellow', 10, 0.9, { aliases: ['Camel Original'] }),

  // 🚬 G1 / Magna
  cig('g1_nano_black', 'جی‌وان نانو مشکی', 'G1 Nano Black', 6, 0.6, { aliases: ['G1 Black', 'جی وان بلک'], bvtFamily: NANO }),
  cig('g1_nano_silver', 'جی‌وان نانو نقره‌ای', 'G1 Nano Silver', 4, 0.4, { aliases: ['G1 Silver', 'جی وان سیلور'], bvtFamily: NANO }),
  cig('g1_nano_white', 'جی‌وان نانو سفید', 'G1 Nano White', 3, 0.3, { aliases: ['G1 White'], bvtFamily: NANO }),
  cig('g1_compact_blue', 'جی‌وان کامپکت آبی', 'G1 Compact Blue', 6, 0.5, { bvtFamily: COMPACT }),
  cig('g1_compact_silver', 'جی‌وان کامپکت نقره‌ای', 'G1 Compact Silver', 5, 0.5, { bvtFamily: COMPACT }),
  cig('g1_king_size_blue', 'جی‌وان کینگ سایز آبی', 'G1 King Size Blue', 8, 0.7),
  cig('g1_king_size_silver', 'جی‌وان کینگ سایز نقره‌ای', 'G1 King Size Silver', 5, 0.5),
  cig('magna_silver', 'مگنا نقره‌ای', 'Magna Silver', 4, 0.4, { aliases: ['Magna Ultra', 'مگنا اولترا'] }),
  cig('magna_red', 'مگنا قرمز', 'Magna Red', 12, 0.9),
  cig('magna_light', 'مگنا لایت (سفید)', 'Magna Light', 8, 0.7, { aliases: ['Magna White', 'مگنا سفید'] }),

  // 🚬 Onyx
  cig('onyx_nano_gold', 'اونیکس نانو طلایی', 'Onyx Nano Gold', 6, 0.6, { bvtFamily: NANO }),
  cig('onyx_nano_silver', 'اونیکس نانو نقره‌ای', 'Onyx Nano Silver', 4, 0.4, { bvtFamily: NANO }),
  cig('onyx_super_slim_gold', 'اونیکس سوپراسلیم طلایی', 'Onyx Super Slims Gold', 6, 0.6, { aliases: ['Onyx Super Slims Gold 83 PUG', 'اونیکس سوپر اسلیم گلد'], bvtFamily: NANO }),
  cig('onyx_super_slim_silver', 'اونیکس سوپراسلیم نقره‌ای', 'Onyx Super Slims Silver', 4, 0.4, { aliases: ['Onyx Super Slims Silver 83 PUG', 'اونیکس سوپر اسلیم سیلور'], bvtFamily: NANO }),
  cig('onyx_compact_gold', 'اونیکس کامپکت طلایی', 'Onyx Compact Gold', 7, 0.6, { bvtFamily: COMPACT }),
  cig('onyx_compact_silver', 'اونیکس کامپکت نقره‌ای', 'Onyx Compact Silver', 5, 0.5, { bvtFamily: COMPACT }),
  cig('onyx_king_size_gold', 'اونیکس کینگ سایز طلایی', 'Onyx King Size Gold', 6, 0.5, { aliases: ['Onyx Gold', 'اونیکس گلد'] }),
  cig('onyx_king_size_silver', 'اونیکس کینگ سایز نقره‌ای', 'Onyx King Size Silver', 4, 0.4, { aliases: ['Onyx Silver', 'اونیکس سیلور'] }),

  // 🚬 Bahman / Tir / Homa (Iranian Tobacco Co.)
  cig('bahman_short', 'بهمن کوتاه', 'Bahman Short', 12, 0.9, { aliases: ['Bahman Red', 'بهمن قرمز', 'بهمن کوچک', 'Bahman Small'] }),
  cig('bahman_medium', 'بهمن متوسط', 'Bahman Medium', 11, 0.8),
  cig('bahman_soft', 'بهمن سافت', 'Bahman Soft', 9, 0.7),
  cig('bahman_natural', 'بهمن نچرال', 'Bahman Natural', 9, 0.7),
  cig('bahman_vivify', 'بهمن ویویفای (VIVIFY)', 'Bahman Vivify', 6, 0.5, { aliases: ['Bahman VIVIFY'] }),
  cig('bahman_ultralight', 'بهمن الترالایت', 'Bahman Ultra Light', 6, 0.5, { aliases: ['Bahman Ultra', 'بهمن اولترا', 'بهمن اولترا لایت'] }),
  cig('bahman_light', 'بهمن لایت', 'Bahman Light', 8, 0.75),
  cig('bahman_hard', 'بهمن هارد', 'Bahman Hard', 12, 0.9),
  cig('bahman_hard_round_corner', 'بهمن هارد راندکرنر', 'Bahman Hard Round Corner', 12, 0.9, { aliases: ['بهمن هارد راند کرنر'] }),
  cig('bahman_super_slim_black', 'بهمن سوپراسلیم مشکی', 'Bahman Super Slim Black', 6, 0.5, { bvtFamily: NANO }),
  cig('bahman_super_slim_blue', 'بهمن سوپراسلیم آبی', 'Bahman Super Slim Blue', 4, 0.4, { aliases: ['Bahman Super Slim'], bvtFamily: NANO }),
  cig('bahman_nano_black', 'بهمن نانو مشکی', 'Bahman Nano Black', 6, 0.6, { aliases: ['Bahman Nanotek Black', 'بهمن نانوتک مشکی'], bvtFamily: NANO }),
  cig('bahman_nano_silver', 'بهمن نانو نقره‌ای', 'Bahman Nano Silver', 4, 0.4, { aliases: ['Bahman Nanotek Silver', 'بهمن نانوتک نقره‌ای'], bvtFamily: NANO }),
  cig('bahman_nano_white', 'بهمن نانو سفید', 'Bahman Nano White', 4, 0.4, { aliases: ['Bahman Nanotek White', 'بهمن نانوتک سفید'], bvtFamily: NANO }),
  cig('bahman_t4', 'تی ۴ (T4)', 'T4', 4, 0.4, { aliases: ['Bahman T4', 'بهمن T4', 'تی فور'] }),
  cig('bahman_book', 'بهمن کتابی', 'Bahman Book', 10.5, 0.7, { aliases: ['بهمن بوک'] }),
  cig('tir_short', 'تیر کوتاه', 'Tir Short', 12, 0.9),
  cig('tir_medium', 'تیر متوسط', 'Tir Medium', 11, 0.8),
  cig('tir_gostareh', 'تیر گستاره', 'Tir Gostareh', 9, 0.7),
  cig('tir_light', 'تیر لایت', 'Tir Light', 9, 0.8),
  cig('tir_slim_book', 'تیر اسلیم کتابی', 'Tir Slim Book', 7, 0.7, { aliases: ['Tir Slim Black', 'تیر اسلیم مشکی'] }),
  cig('homa_light', 'هما لایت', 'Homa Light', 8, 0.7),

  // 🚬 Sink / Clip / Coco / Variance / Play / Cavallo
  cig('sink_blue', 'سینک آبی', 'Sink Blue', 7, 0.6, { aliases: ['Sync Blue'] }),
  cig('sink_red', 'سینک قرمز', 'Sink Red', 10, 0.8, { aliases: ['Sync Red'] }),
  cig('sink_yellow', 'سینک زرد', 'Sink Yellow', 8, 0.7, { aliases: ['Sync Yellow'] }),
  cig('clip', 'کلیپ', 'Clip', 6, 0.5),
  cig('coco', 'کوکو', 'Coco', 5, 0.4),
  cig('variance', 'واریانس', 'Variance', 6, 0.5),
  cig('play_blue', 'پلی آبی', 'Play Blue', 6, 0.5),
  cig('play_green', 'پلی سبز', 'Play Green', 6, 0.5, { aliases: ['Play Menthol', 'پلی منتول'] }),
  cig('cavallo_slim_blue', 'کاوالو اسلیم آبی', 'Cavallo Slim Blue', 6, 0.5, { bvtFamily: NANO }),
  cig('cavallo_slim_silver', 'کاوالو اسلیم نقره‌ای', 'Cavallo Slim Silver', 4, 0.4, { aliases: ['کاوالو اسلیم نقره'], bvtFamily: NANO }),
  cig('cavallo_black', 'کاوالو مشکی', 'Cavallo Black', 5, 0.4, { aliases: ['کاوالو بلک'], bvtFamily: NANO }),
  cig('cavallo_white', 'کاوالو سفید', 'Cavallo White', 3, 0.3, { aliases: ['کاوالو وایت'], bvtFamily: NANO }),
  cig('cavallo_mango', 'کاوالو انبه', 'Cavallo Mango', 5, 0.4, { aliases: ['Cavallo Flavor'] }),
  cig('cavallo_blueberry', 'کاوالو بلوبری', 'Cavallo Blueberry', 5, 0.4),
  cig('cavallo_black_illegal', 'کاوالو مشکی غیرمجاز', 'Cavallo Black Illegal', 6, 0.6, { aliases: ['کاوالو بلک غیرمجاز'], bvtFamily: NANO }),
  cig('cavallo_white_illegal', 'کاوالو سفید غیرمجاز', 'Cavallo White Illegal', 4, 0.4, { aliases: ['کاوالو وایت غیرمجاز'], bvtFamily: NANO }),

  // 🚬 Philip Morris / Napoli / Mond / Foreman / Dunhill / Captain Black / Senator
  cig('philip_morris_blue', 'فیلیپ موریس آبی', 'Philip Morris Blue', 6, 0.5),
  cig('philip_morris_white', 'فیلیپ موریس سفید', 'Philip Morris White', 4, 0.4),
  cig('napoli_white', 'ناپولی سفید', 'Napoli White', 4, 0.4, { aliases: ['Napoli Silver', 'ناپولی سیلور', 'ناپولی نقره‌ای'] }),
  cig('napoli_black', 'ناپولی مشکی', 'Napoli Black', 6, 0.5, { aliases: ['ناپولی بلک'] }),
  cig('napoli_blue', 'ناپولی آبی', 'Napoli Blue', 7, 0.6, { aliases: ['ناپولی بلو'] }),
  cig('napoli_red', 'ناپولی قرمز', 'Napoli Red', 10, 0.8),
  cig('napoli_nano_one_illegal', 'ناپولی نانو وان غیرمجاز', 'Napoli Nano One Illegal', 3, 0.3, { bvtFamily: NANO }),
  cig('napoli_nano_black_illegal', 'ناپولی نانو مشکی غیرمجاز', 'Napoli Nano Black Illegal', 6, 0.6, { aliases: ['ناپولی نانو بلک غیرمجاز'], bvtFamily: NANO }),
  cig('napoli_fanpack_gold_nano', 'ناپولی فن‌پک طلایی نانو', 'Napoli Fanpack Gold Nano', 6, 0.6, { aliases: ['Napoli Fanpack Gold', 'ناپولی فن پک گلد'], bvtFamily: NANO }),
  cig('napoli_fanpack_silver_nano', 'ناپولی فن‌پک نقره‌ای نانو', 'Napoli Fanpack Silver Nano', 4, 0.4, { aliases: ['Napoli Fanpack Silver', 'ناپولی فن پک سیلور'], bvtFamily: NANO }),
  cig('mond', 'موند', 'Mond', 8, 0.6, { aliases: ['Mond Original', 'Mond Blue', 'موند اوریجینال', 'موند آبی'] }),
  cig('mond_white', 'موند سفید', 'Mond White', 4, 0.4, { aliases: ['موند وایت'] }),
  cig('mond_black', 'موند مشکی', 'Mond Black', 6, 0.5, { aliases: ['Mond Slim Black', 'موند بلک'] }),
  cig('mond_nano_blue_black', 'موند نانو آبی مشکی', 'Mond Nano Blue Black', 7, 0.6, { bvtFamily: COMPACT }),
  cig('mond_nano_blue_white', 'موند نانو آبی سفید', 'Mond Nano Blue White', 5, 0.5, { bvtFamily: COMPACT }),
  cig('mond_touch_edition_black', 'موند تاچ ادیشن مشکی', 'Mond Touch Edition Black', 7, 0.6, { bvtFamily: COMPACT }),
  cig('mond_touch_edition_blue', 'موند تاچ ادیشن آبی', 'Mond Touch Edition Blue', 7, 0.6, { bvtFamily: COMPACT }),
  cig('mond_touch_edition_silver', 'موند تاچ ادیشن نقره‌ای', 'Mond Touch Edition Silver', 5, 0.5, { bvtFamily: COMPACT }),
  cig('mond_queen_edition_gold', 'موند کویین ادیشن طلایی', 'Mond Queen Edition Gold', 7, 0.6, { bvtFamily: COMPACT }),
  cig('mond_queen_edition_black', 'موند کویین ادیشن مشکی', 'Mond Queen Edition Black', 7, 0.6, { bvtFamily: COMPACT }),
  cig('foreman_nano_black', 'فورمن نانو مشکی', 'Foreman Nano Black', 6, 0.6, { aliases: ['Forman Nano Black', 'Foreman Nano Black Illegal', 'فرمن نانو بلک'], bvtFamily: NANO }),
  cig('foreman_nano_blue', 'فورمن نانو آبی', 'Foreman Nano Blue', 6, 0.6, { aliases: ['Forman Nano Blue', 'Foreman Nano Dark Blue Illegal', 'فرمن نانو بلو'], bvtFamily: NANO }),
  cig('foreman_nano_white', 'فورمن نانو سفید', 'Foreman Nano White', 4, 0.4, { aliases: ['Forman Nano White', 'Foreman Nano White Illegal', 'فرمن نانو وایت'], bvtFamily: NANO }),
  cig('foreman_original', 'فورمن قرمز (اوریجینال)', 'Foreman Original', 10, 0.8, { aliases: ['Foreman Red', 'فرمن قرمز'] }),
  cig('foreman_blue', 'فورمن آبی', 'Foreman Blue', 8, 0.6, { aliases: ['فرمن بلو'] }),
  cig('foreman_silver', 'فورمن نقره‌ای', 'Foreman Silver', 4, 0.4, { aliases: ['فرمن سیلور'] }),
  cig('dunhill_international', 'دانهیل اینترنشنال قرمز', 'Dunhill International', 10, 0.9, { aliases: ['Dunhill Red', 'دانهیل قرمز', 'دانهیل'] }),
  cig('dunhill_international_black', 'دانهیل اینترنشنال مشکی', 'Dunhill International Black', 10, 0.8),
  cig('dunhill_blue', 'دانهیل آبی', 'Dunhill Blue', 8, 0.7),
  cig('dunhill_gold', 'دانهیل طلایی', 'Dunhill Gold', 4, 0.5, { aliases: ['Dunhill Light', 'دانهیل گلد'] }),
  cig('captain_black', 'کاپتان بلک', 'Captain Black', 5, 0.4, { aliases: ['Captain Black X-Slim Silver', 'کاپیتان بلک'] }),
  cig('senator', 'سناتور', 'Senator', 8, 0.6, { aliases: ['Senator Blue', 'سناتور آبی'] }),

  // 🚬 Marlboro — all regular-format packs; `bvtFamily: COMPACT` follows the
  // client's rule for king-size lines (see CLIENT_MATCHES), so nicotine/tar
  // only pick blue vs silver. Add explicit CLIENT_MATCHES entries to override.
  cig('marlboro_red', 'مارلبرو قرمز', 'Marlboro Red', 10, 0.8, { aliases: ['Marlboro', 'Marlboro Classic', 'Marlboro Full Flavor', 'مارلبرو اصلی', 'مارلبرو کلاسیک'], bvtFamily: COMPACT }),
  cig('marlboro_red_100', 'مارلبرو قرمز بلند (۱۰۰)', 'Marlboro Red 100s', 10, 0.8, { aliases: ['Marlboro 100', 'مارلبرو قرمز ۱۰۰'], bvtFamily: COMPACT }),
  cig('marlboro_gold', 'مارلبرو طلایی (لایت)', 'Marlboro Gold', 6, 0.5, { aliases: ['Marlboro Light', 'Marlboro Gold Original', 'Marlboro Lights', 'مارلبرو گلد', 'مارلبرو لایت'], bvtFamily: COMPACT }),
  cig('marlboro_gold_100', 'مارلبرو طلایی بلند (۱۰۰)', 'Marlboro Gold 100s', 6, 0.5, { aliases: ['Marlboro Light 100', 'مارلبرو گلد ۱۰۰'], bvtFamily: COMPACT }),
  cig('marlboro_gold_advance', 'مارلبرو گلد ادونس', 'Marlboro Gold Advance', 6, 0.5, { aliases: ['Marlboro Advance'], bvtFamily: COMPACT }),
  cig('marlboro_silver_blue', 'مارلبرو نقره‌ای (سیلور بلو)', 'Marlboro Silver Blue', 4, 0.4, { aliases: ['Marlboro Silver', 'Marlboro Ultra Light', 'مارلبرو سیلور', 'مارلبرو اولترا لایت'], bvtFamily: COMPACT }),
  cig('marlboro_gold_touch', 'مارلبرو گلد تاچ', 'Marlboro Gold Touch', 5, 0.4, { aliases: ['Marlboro Touch', 'مارلبرو تاچ'], bvtFamily: COMPACT }),
  cig('marlboro_fine_touch', 'مارلبرو فاین تاچ', 'Marlboro Fine Touch', 4, 0.4, { bvtFamily: COMPACT }),
  cig('marlboro_touch_silver', 'مارلبرو تاچ نقره‌ای', 'Marlboro Silver Touch', 3, 0.3, { aliases: ['Marlboro Touch Silver'], bvtFamily: COMPACT }),
  cig('marlboro_crafted_red', 'مارلبرو کرفتد قرمز', 'Marlboro Crafted Red', 10, 0.8, { aliases: ['Marlboro Crafted', 'Marlboro Crafted Selection'], bvtFamily: COMPACT }),
  cig('marlboro_crafted_gold', 'مارلبرو کرفتد طلایی', 'Marlboro Crafted Gold', 6, 0.5, { bvtFamily: COMPACT }),
  cig('marlboro_premium_black', 'مارلبرو پریمیوم مشکی', 'Marlboro Premium Black', 6, 0.5, { aliases: ['Marlboro Black', 'مارلبرو بلک', 'مارلبرو مشکی'], bvtFamily: COMPACT }),
  cig('marlboro_premium_gold', 'مارلبرو پریمیوم طلایی', 'Marlboro Premium Gold', 4, 0.4, { bvtFamily: COMPACT }),
  cig('marlboro_filter_plus', 'مارلبرو فیلتر پلاس قرمز', 'Marlboro Filter Plus', 8, 0.7, { aliases: ['Marlboro Filter Plus Red', 'Marlboro Filter Plus Full'], bvtFamily: COMPACT }),
  cig('marlboro_filter_plus_4', 'مارلبرو فیلتر پلاس ۴', 'Marlboro Filter Plus 4', 4, 0.4, { aliases: ['Marlboro Filter Plus Blue', 'Marlboro Filter Plus Mild'], bvtFamily: COMPACT }),
  cig('marlboro_filter_plus_one', 'مارلبرو فیلتر پلاس وان (۱)', 'Marlboro Filter Plus One', 1, 0.1, { aliases: ['Marlboro Filter Plus 1'], bvtFamily: COMPACT }),
  cig('marlboro_white_one', 'مارلبرو سفید وان (۱)', 'Marlboro White One', 1, 0.1, { aliases: ['Marlboro One', 'Marlboro 1', 'مارلبرو وایت وان', 'مارلبرو وان'], bvtFamily: COMPACT }),
  cig('marlboro_menthol', 'مارلبرو منتول (سبز)', 'Marlboro Menthol', 8, 0.6, { aliases: ['Marlboro Green', 'Marlboro Fresh Menthol', 'مارلبرو سبز', 'مارلبرو نعنایی'], bvtFamily: COMPACT }),
  cig('marlboro_white_menthol', 'مارلبرو منتول سفید', 'Marlboro White Menthol', 6, 0.5, { aliases: ['مارلبرو وایت منتول'], bvtFamily: COMPACT }),
  cig('marlboro_black_menthol', 'مارلبرو منتول مشکی', 'Marlboro Black Menthol', 8, 0.6, { aliases: ['مارلبرو بلک منتول'], bvtFamily: COMPACT }),
  cig('marlboro_ice_blast', 'مارلبرو آیس بلاست', 'Marlboro Ice Blast', 8, 0.6, { aliases: ['Marlboro Ice Blast 8'], bvtFamily: COMPACT }),
  cig('marlboro_ice_blast_5', 'مارلبرو آیس بلاست ۵', 'Marlboro Ice Blast 5', 5, 0.4, { bvtFamily: COMPACT }),
  cig('marlboro_ice_blast_1', 'مارلبرو آیس بلاست وان (۱)', 'Marlboro Ice Blast One', 1, 0.1, { aliases: ['Marlboro Ice Blast Mega 1', 'Marlboro Ice Blast 1', 'مارلبرو آیس بلاست مگا ۱'], bvtFamily: COMPACT }),
  cig('marlboro_double_burst', 'مارلبرو دابل برست', 'Marlboro Double Burst', 6, 0.5, { aliases: ['Marlboro Double Mix', 'مارلبرو دابل میکس'], bvtFamily: COMPACT }),
  cig('marlboro_double_fusion', 'مارلبرو دابل فیوژن', 'Marlboro Double Fusion', 6, 0.5, { bvtFamily: COMPACT }),
  cig('marlboro_beyond_blue', 'مارلبرو بیاند بلو', 'Marlboro Beyond Blue', 5, 0.4, { bvtFamily: COMPACT }),
  cig('marlboro_shuffle', 'مارلبرو شافل', 'Marlboro Shuffle', 5, 0.4, { aliases: ['Marlboro Shuffle Ice'], bvtFamily: COMPACT }),
  cig('marlboro_summer_splash_2', 'مارلبرو سامر اسپلش ۲', 'Marlboro Summer Splash 2', 2, 0.2, { bvtFamily: COMPACT }),
  cig('marlboro_summer_splash_5', 'مارلبرو سامر اسپلش ۵', 'Marlboro Summer Splash 5', 5, 0.4, { aliases: ['Marlboro Summer Splash'], bvtFamily: COMPACT }),
  cig('marlboro_mint_storm', 'مارلبرو مینت استورم', 'Marlboro Mint Storm', 7, 0.5, { bvtFamily: COMPACT }),
  cig('marlboro_vista_forest_mist', 'مارلبرو ویستا فارست میست', 'Marlboro Vista Forest Mist', 6, 0.5, { aliases: ['Marlboro Vista', 'مارلبرو ویستا'], bvtFamily: COMPACT }),
  cig('marlboro_vista_garden_splash', 'مارلبرو ویستا گاردن اسپلش', 'Marlboro Vista Garden Splash', 6, 0.5, { bvtFamily: COMPACT }),
  cig('marlboro_vista_tropical_splash', 'مارلبرو ویستا تروپیکال اسپلش', 'Marlboro Vista Tropical Splash', 6, 0.5, { bvtFamily: COMPACT }),
  cig('marlboro_edge', 'مارلبرو ادج', 'Marlboro Edge', 6, 0.5, { bvtFamily: COMPACT }),

  // 🚬 ESSE
  cig('esse_blue', 'اسه آبی', 'ESSE Blue', 5, 0.5, { aliases: ['ESSE Light', 'اسه بلو'], bvtFamily: NANO }),
  cig('esse_menthol', 'اسه منتول (نعنایی)', 'ESSE Menthol', 5, 0.4, { bvtFamily: NANO }),
  cig('esse_silver', 'اسه نقره‌ای', 'ESSE Silver', 3, 0.3, { aliases: ['اسه سیلور'], bvtFamily: NANO }),
  cig('esse_black', 'اسه مشکی', 'ESSE Black', 4, 0.4, { aliases: ['اسه بلک'], bvtFamily: NANO }),
  cig('esse_change', 'اسه چنج', 'ESSE Change', 4, 0.4, { bvtFamily: NANO }),
  cig('esse_grape', 'اسه انگور', 'ESSE Grape', 4, 0.4, { bvtFamily: NANO }),

  // 🚬 Mevius
  cig('mevius_one', 'میویوس وان (۱)', 'Mevius One', 1, 0.1, { aliases: ['Mevius 1'] }),
  cig('mevius_sky_blue', 'میویوس اسکای بلو', 'Mevius Sky Blue', 7, 0.6, { aliases: ['Mevius Light'] }),
  cig('mevius_original_blue', 'میویوس اوریجینال بلو', 'Mevius Original Blue', 9, 0.8),
  cig('mevius_wind_blue_4', 'میویوس ویند بلو ۴', 'Mevius Wind Blue 4', 4, 0.4),
  cig('mevius_option_purple_5', 'میویوس آپشن بنفش ۵', 'Mevius Option Purple 5', 5, 0.5),
  cig('mevius_option_purple_8', 'میویوس آپشن بنفش ۸', 'Mevius Option Purple 8', 7, 0.7),

  // 🚬 Biston / Oscar / Perth / Bens
  cig('biston_red', 'بیستون قرمز', 'Biston Red', 12, 0.9),
  cig('biston_white', 'بیستون سفید', 'Biston White', 8, 0.6, { aliases: ['بیستون وایت'] }),
  cig('biston_nano_black', 'بیستون نانو مشکی', 'Biston Nano Black', 4, 0.4, { aliases: ['بیستون نانو بلک'], bvtFamily: NANO }),
  cig('oscar_black', 'اسکار مشکی', 'Oscar Black', 5, 0.4, { aliases: ['اسکار بلک'] }),
  cig('oscar_silver', 'اسکار نقره‌ای', 'Oscar Silver', 3, 0.3, { aliases: ['اسکار سیلور'] }),
  cig('oscar_nano_silver', 'اسکار نانو نقره‌ای', 'Oscar Nano Silver', 4, 0.4, { aliases: ['اسکار نانو سیلور'], bvtFamily: NANO }),
  cig('oscar_nano_silver_dnp', 'اسکار نانو نقره‌ای DNP', 'Oscar Nano Silver DNP', 4, 0.4, { aliases: ['اسکار نانو سیلور DNP'], bvtFamily: NANO }),
  cig('oscar_nano_one_dnp', 'اسکار نانو وان DNP', 'Oscar Nano One DNP', 3, 0.3, { bvtFamily: NANO }),
  cig('perth_nano_white_illegal', 'پرت نانو سفید غیرمجاز', 'Perth Nano White Illegal', 4, 0.4, { aliases: ['Perth Nano White', 'پرت نانو وایت'], bvtFamily: NANO }),
  cig('perth_nano_black_illegal', 'پرت نانو مشکی غیرمجاز', 'Perth Nano Black Illegal', 6, 0.6, { aliases: ['Perth Nano Black', 'پرت نانو بلک'], bvtFamily: NANO }),
  cig('bens_nano_white_illegal', 'بنس نانو سفید غیرمجاز', 'Bens Nano White Illegal', 4, 0.4, { aliases: ['Bens Nano White', 'بنس نانو وایت'], bvtFamily: NANO }),
  cig('bens_nano_blue_illegal', 'بنس نانو آبی غیرمجاز', 'Bens Nano Blue Illegal', 6, 0.6, { aliases: ['Bens Nano Blue', 'بنس نانو بلو'], bvtFamily: NANO }),

  // 🚬 Others
  cig('lucky_strike_red', 'لاکی استرایک قرمز', 'Lucky Strike Red', 10, 0.8, { aliases: ['Lucky Strike', 'Lucky Strike Resized Wild'] }),
  cig('davidoff_classic', 'دیویدوف کلاسیک', 'Davidoff Classic', 10, 0.9),
  cig('davidoff_shape_black', 'دیویدوف شیپ مشکی', 'Davidoff Shape Black', 6, 0.5, { aliases: ['دیویدوف شیپ بلک'] }),
  cig('monte_carlo_blue', 'مونت کارلو آبی', 'Monte Carlo Blue', 8, 0.6, { aliases: ['مونت کارلو بلو'] }),
  cig('lm_red', 'ال اند ام قرمز', 'L&M Red', 10, 0.8, { aliases: ['LM Red'] }),
  cig('lm_blue', 'ال اند ام آبی', 'L&M Blue', 7, 0.6, { aliases: ['LM Blue', 'ال اند ام بلو'] }),
  cig('farvardin', 'فروردین', 'Farvardin', 15, 1.0),
  cig('30_medium', 'سی (۳۰)', '30', 8, 0.7, { aliases: ['Si'] }),
  cig('57_medium', '۵۷ متوسط', '57', 11, 0.8),
  cig('caspian', 'کاسپین', 'Caspian', 10, 0.8),
  cig('zica_red', 'زیکا قرمز', 'Zica Red', 11, 0.8),
  cig('milano_black', 'میلانو مشکی', 'Milano Black', 5, 0.4, { aliases: ['میلانو بلک'] }),
];

// Our own products — tar/nicotine values from the client spec. image paths
// point at /public/images/bvt. `accent` is each pack's real-world color, used
// to tint its card.
export const BVT_PRODUCTS = [
  { id: 'pallmall_compact_blue', name: 'Pall Mall Compact Blue', image: '/images/bvt/pallmall-compact-blue.jpg', tar: 7, tarLabel: '7mg', nicotine: 0.6, nicotineLabel: '0.6mg', accent: '#2563eb', family: 'compact' },
  { id: 'pallmall_compact_silver', name: 'Pall Mall Compact Silver', image: '/images/bvt/pallmall-compact-silver.jpg', tar: 5, tarLabel: '5mg', nicotine: 0.5, nicotineLabel: '0.5mg', accent: '#64748b', family: 'compact' },
  { id: 'pallmall_nano_silver', name: 'Pall Mall Nano Silver', image: '/images/bvt/pallmall-nano-silver.jpg', tar: 4, tarLabel: '4mg', nicotine: 0.4, nicotineLabel: '0.4mg', accent: '#94a3b8', family: 'nano' },
  { id: 'pallmall_nano_blue', name: 'Pall Mall Nano Blue', image: '/images/bvt/pallmall-nano-blue.jpg', tar: 6, tarLabel: '6mg', nicotine: 0.6, nicotineLabel: '0.6mg', accent: '#3b82f6', family: 'nano' },
];

// The client's own switch table: which of our products each competitor pack
// is swapped for. This wins over the nicotine/tar math in matchBvtProduct —
// entries not listed here fall back to that math. Entries marked «پیشنهادی»
// weren't in the client's table and were filled in by analogy with their
// closest listed sibling (same line/strength).
const CB = 'pallmall_compact_blue';
const CS = 'pallmall_compact_silver';
const NB = 'pallmall_nano_blue';
const NS = 'pallmall_nano_silver';

export const CLIENT_MATCHES = {
  // Kent
  kent_mix_aroma_freshlock: CB, kent_mix_freshlock: CB, kent_switch_8_freshlock: CB,
  kent_demi_slim_switch: CS, kent_demi_switch: CS /* پیشنهادی */,
  kent_hdi_6: CS, kent_hdi_4: CS, kent_hdi_1: CS,
  kent_red_pug: CB, kent_8_pug: CB, kent_4_pug: CS, kent_1_pug: CS,
  kent_plus_8_freshlock: CB, kent_plus_6_freshlock: CS, kent_plus_4_freshlock: CS,
  kent_nanoclick: NS, kent_nanotek_4: NS, kent_nanotek_1: NS,
  kent_ss100_blue: NB, kent_ss100_silver: NS, kent_ss100_click: NB,
  kent_crystal_6: CS, kent_crystal_4: CS, kent_viva_6: CS, kent_viva_4: CS,
  // Pall Mall
  pallmall_red: CB, pallmall_blue: CB, pallmall_silver: CS,
  // Montana
  montana_red: CB, montana_gold: CB, montana_nano_gold: NB, montana_nano_silver: NS,
  montana_gold_demi: CB, montana_demi_blue: CS, montana_demi_silver: CS, // پیشنهادی
  montana_sline_gold: NB, montana_sline_silver: NS, // پیشنهادی
  // Crystal
  crystal_mode_blue: CB, crystal_mode_silver: CS, crystal_extra_blue: NB, crystal_extra_silver: NS,
  crystal_smart_blue: NB, crystal_select_capsule: NS,
  // Blake
  blake_demi_blue: CS, blake_demi_silver: CS, blake_nano: NS, blake_nano_1: NS,
  blake_superslim100_blue: NB, blake_superslim100_silver: NS, blake_king_size: CS,
  // Winston
  winston_super_slim_blue: NB, winston_super_slim_silver: NS,
  winston_xstyle_blue: CB, winston_xstyle_silver: CS,
  winston_nano_blue: NB, winston_nano_silver: NS,
  winston_nova_blue: CB, winston_nova_silver: CS, winston_nova_white: CS,
  winston_compact_blue: CB, winston_compact_silver: CS,
  winston_red: CB, winston_blue: CB, winston_silver: CS,
  // Camel
  camel_compact_blue: CB, camel_compact_silver: CS, camel_senso_gold: NB, camel_senso_silver: NS,
  camel_blue: CB, camel_silver: CS, camel_black: CB, camel_white: CS,
  // G1 / Magna
  g1_nano_black: NB, g1_nano_silver: NS, g1_nano_white: NS,
  g1_compact_blue: CB, g1_compact_silver: CS,
  g1_king_size_blue: CB, g1_king_size_silver: CS,
  magna_silver: CS,
  // Onyx
  onyx_nano_gold: NB, onyx_nano_silver: NS, onyx_super_slim_gold: NB, onyx_super_slim_silver: NS,
  onyx_compact_gold: CB, onyx_compact_silver: CS, onyx_king_size_gold: CB, onyx_king_size_silver: CS,
  // Philip Morris / Napoli / Mond / Foreman / Dunhill / Captain Black / Senator
  philip_morris_blue: CB, philip_morris_white: CS,
  napoli_white: NS, napoli_black: NB, napoli_blue: NB,
  mond: NS,
  foreman_nano_black: NB, foreman_nano_blue: NB, foreman_nano_white: NS,
  dunhill_international: NS, dunhill_international_black: NS, dunhill_blue: NS, dunhill_gold: NS,
  captain_black: CB, senator: CB,
  // Bahman / Tir / Homa
  bahman_short: CB, bahman_medium: CB,
  bahman_super_slim_black: NB, bahman_super_slim_blue: NB,
  bahman_nano_black: NB, bahman_nano_silver: NS, bahman_nano_white: NS,
  // پیشنهادی ↓
  bahman_soft: CB, bahman_natural: CB, bahman_hard: CB, bahman_hard_round_corner: CB,
  bahman_light: CB, bahman_book: CB, bahman_vivify: CS, bahman_ultralight: CS, bahman_t4: CS,
  tir_short: CB, tir_medium: CB, tir_gostareh: CB, tir_light: CB, tir_slim_book: CB, homa_light: CB,
  // Marlboro (پیشنهادی) — gold/light lines follow «Montana Gold / Winston Blue →
  // Compact Blue»; the rest of Marlboro is left to the nicotine/tar math.
  marlboro_gold: CB, marlboro_gold_100: CB, marlboro_gold_advance: CB, marlboro_crafted_gold: CB,
};
CIGARETTE_DATABASE.forEach((c) => { if (CLIENT_MATCHES[c.id]) c.bvt = CLIENT_MATCHES[c.id]; });

const faToEnDigits = (s) => String(s || '')
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/٫/g, '.');

// Folds the spelling variants promoters actually type into one form: Arabic
// ي/ى/ك vs Persian ی/ک, آ vs ا, ZWNJ or not («نقره‌ای» / «نقره ای» / «نقرهای»),
// Persian vs Latin digits, and "Plus8"/"SS100" glued letter+digit tokens.
const normalize = (s) => faToEnDigits(s)
  .toLowerCase()
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ؤ/g, 'و')
  .replace(/ة/g, 'ه')
  .replace(/[ً-ٰٟ]/g, '')
  .replace(/[‌‍‎‏]/g, '')
  .replace(/([a-z؀-ۿ])(\d)/g, '$1 $2')
  .replace(/(\d)([a-z؀-ۿ])/g, '$1 $2')
  .replace(/[()\-_.,/+«»"']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Same product word in Persian / Finglish / English → one key, so «آبی»,
// «بلو» and "blue" all find the same pack. Keys are already normalize()d.
const SYNONYMS = {
  blue: ['ابی', 'بلو', 'blue'],
  silver: ['نقره', 'نقرهای', 'سیلور', 'silver'],
  gold: ['طلایی', 'طلائی', 'گلد', 'gold'],
  black: ['مشکی', 'بلک', 'black'],
  white: ['سفید', 'وایت', 'white'],
  red: ['قرمز', 'red'],
  yellow: ['زرد', 'yellow'],
  green: ['سبز', 'green'],
  purple: ['بنفش', 'purple'],
  nano: ['نانو', 'nano'],
  compact: ['کامپکت', 'compact'],
  superslim: ['سوپراسلیم', 'superslim', 'superslims'],
  slim: ['اسلیم', 'slim', 'slims'],
  king: ['کینگ', 'king'],
  switch: ['سوییچ', 'سوئیچ', 'switch'],
  click: ['کلیک', 'click'],
  light: ['لایت', 'light'],
  ultra: ['اولترا', 'الترا', 'ultra'],
};
const CANONICAL = new Map();
Object.entries(SYNONYMS).forEach(([key, words]) => words.forEach(w => CANONICAL.set(w, key)));
const canon = (t) => CANONICAL.get(t) || t;

// Built once: every token of the name/en/aliases (raw + canonical) plus a
// space-less join, so «سوپر اسلیم» still finds «سوپراسلیم» and vice versa.
const SEARCH_INDEX = CIGARETTE_DATABASE.map((c) => {
  const texts = [c.name, c.en, ...(c.aliases || [])].map(normalize);
  const tokens = new Set();
  texts.forEach(t => t.split(' ').forEach(w => { if (w) { tokens.add(w); tokens.add(canon(w)); } }));
  return { c, name: normalize(c.name), tokens: [...tokens], joined: texts.map(t => t.replace(/ /g, '')).join('|') };
});

const tokenMatches = (entry, t) => {
  const key = canon(t);
  return entry.tokens.some(w => w === key || w.startsWith(t)) || entry.joined.includes(t);
};

// A query that's purely numeric (e.g. "0.7" or its Persian-digit form) is read
// as a nicotine mg value and matches everything within a small tolerance of it,
// closest first — a promoter can search by what's printed on the pack even
// when they don't know (or can't spell) the brand name. Otherwise every word
// of the query must match (in any order, any script/spelling); results whose
// Persian name starts with the query rank first.
export function searchCigarettes(query, limit = 30) {
  const raw = faToEnDigits(query).trim();
  if (!raw) return [];

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const target = parseFloat(raw);
    return CIGARETTE_DATABASE
      .filter(c => Math.abs(c.nicotine - target) <= 0.07)
      .sort((a, b) => Math.abs(a.nicotine - target) - Math.abs(b.nicotine - target))
      .slice(0, limit);
  }

  const q = normalize(raw);
  if (!q) return [];
  const qTokens = q.split(' ');
  const qJoined = q.replace(/ /g, '');
  return SEARCH_INDEX
    .filter(e => e.joined.includes(qJoined) || qTokens.every(t => tokenMatches(e, t)))
    .map(e => ({ c: e.c, rank: e.name.startsWith(q) ? 0 : e.name.includes(q) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(r => r.c);
}

// Nicotine is the primary axis (it's what a switched smoker actually notices),
// tar only nudges the choice when both sides of the comparison have a value.
// A CIGARETTE_DATABASE entry can carry a `bvtFamily: 'nano'|'compact'` when the
// target is a nano/super-slim or compact format (or the client has already
// decided which BVT segment it should switch to) — that narrows the candidates
// to BVT products with a matching `family` first, then nicotine/tar only pick
// the closest color *within* it. Falls back to comparing all candidates when
// the target has no `bvtFamily` or the given product list carries no `family` tags.
export function matchBvtProduct(target, bvtProducts = BVT_PRODUCTS) {
  if (!target) return null;
  if (target.bvt) {
    const fixed = bvtProducts.find(p => p.id === target.bvt);
    if (fixed) return fixed;
  }
  let candidates = bvtProducts;
  if (target.bvtFamily) {
    const inFamily = bvtProducts.filter(p => p.family === target.bvtFamily);
    if (inFamily.length) candidates = inFamily;
  }
  let best = null;
  let bestScore = Infinity;
  for (const p of candidates) {
    let score = Math.abs(target.nicotine - p.nicotine);
    if (target.tar != null && p.tar != null) {
      score += Math.abs(target.tar - p.tar) * 0.08;
    }
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// Every distribution's location is stored as the same `https://maps.google.com/?q=lat,lng`
// string the promoter app's own GPS/location field already uses (see EventForm.jsx's
// captureLocation) — this pulls the raw coordinates back out for map rendering.
export function parseLatLngFromMapsUrl(url) {
  if (!url) return null;
  const match = String(url).match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}
