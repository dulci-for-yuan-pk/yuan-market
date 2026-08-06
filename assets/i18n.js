/* ============================================================
   YUAN MARKET — i18n dictionary
   Single source of truth for every visible string.
   Fallback chain: requested lang -> en. A missing translation can
   therefore never leave the wrong language stranded on screen.
   RULE: never write digits in Urdu-Indic form. Always 0-9.
   ============================================================ */
window.YUAN_I18N = {
  en: {
    /* nav + chrome */
    'nav.market':'Market', 'nav.how':'How it works', 'nav.pricing':'Pricing',
    'nav.about':'About', 'nav.orders':'My orders', 'nav.login':'Sign in',
    'nav.account':'Account', 'nav.admin':'Admin', 'nav.seller':'My shop',
    'nav.logout':'Sign out', 'nav.menu':'Menu', 'nav.close':'Close',
    'brand.sub':'Yuan Market',
    'act.theme':'Switch day or night', 'act.lang':'Change language',
    'act.whatsapp':'WhatsApp',

    /* hero */
    'hero.eyebrow':'Yiwu · Baigou · Guangzhou → Pakistan',
    'hero.h1a':'The real China price.', 'hero.h1b':'Nothing hidden.',
    'hero.lede':'We show you the price written on the Chinese seller’s own board, today’s exchange rate, and every cost of landing it at your shop — freight, duty, sales tax, clearing — each on its own line.',
    'hero.lede2':'Our profit is one line on that same sheet: a flat 20% service fee. Nothing is quietly added anywhere else.',
    'hero.cta1':'Browse the market', 'hero.cta2':'How it works',
    'hero.k1':'Years in trade', 'hero.k2':'Our only fee',
    'hero.k3':'Hidden charges', 'hero.k4':'Licence needed',
    'hero.k4v':'None',

    /* ledger */
    'led.title':'How a price is built', 'led.sub':'Worked example',
    'led.goods':'Chinese shop price', 'led.conv':'Converted at today’s rate',
    'led.freight':'Sea freight to Karachi', 'led.duty':'Customs duty',
    'led.tax':'Sales tax & clearing', 'led.inland':'Delivery to your city',
    'led.fee':'Yuan.pk service fee', 'led.total':'Landed at your shop',
    'led.pending':'rate being confirmed', 'led.perhs':'per HS code',
    'led.once':'once costs are set',
    'led.foot':'Every figure comes from a real quote or an official rate. We publish nothing we cannot show you proof of.',

    /* tiers — the core trust distinction */
    'tier.verified':'Visited in person', 'tier.indicative':'Not yet visited',
    'tier.verified.help':'Mirza Javaid Iqbal has stood in this shop, seen the goods and written down the price himself.',
    'tier.indicative.help':'This is the supplier’s own listed price on their marketplace page, captured automatically. The sourcing price below it is approximate until he visits and negotiates in person.',
    'tier.listedprice':'Listed on', 'tier.approx':'Approximate sourcing price',
    'tier.captured':'Captured', 'tier.viewsource':'View original listing',

    /* product */
    'p.moq':'Minimum order', 'p.china':'China price', 'p.landed':'Landed, per',
    'p.market':'Market now', 'p.breakdown':'See the full breakdown',
    'p.order':'Place an order', 'p.nopay':'No payment now',
    'p.unit.piece':'piece','p.unit.set':'set','p.unit.carton':'carton','p.unit.dozen':'dozen',
    'p.supplier':'Supplier', 'p.qty':'Quantity',
    'p.costspending':'costs being confirmed',

    /* listings page */
    'list.title':'On the shelf right now', 'list.count':'items listed',
    'list.all':'All', 'list.filter':'Filter', 'list.sort':'Sort',
    'list.empty.h':'The shelves are being filled',
    'list.empty.p':'Mirza Javaid Iqbal is in the market photographing goods and writing down real prices. Listings appear here the moment each one is verified. Meanwhile, send your list on WhatsApp and we will price it for you directly.',
    'list.empty.cta':'Send your list on WhatsApp',
    'list.error':'We could not load the catalogue just now. Please send your list on WhatsApp and we will reply with a full costing.',

    /* how it works */
    'how.eyebrow':'Four steps', 'how.title':'From a shop in Yiwu to a shop in Multan',
    'how.s1.t':'Pick your goods', 'how.s1.p':'Browse the market or send your own list on WhatsApp. Bulk quantities only — this is for dealers and wholesalers.',
    'how.s2.t':'See the whole sheet', 'how.s2.p':'The Chinese price, today’s rate, and every cost to land it at your shop — before you commit anything.',
    'how.s3.t':'Order with no payment', 'how.s3.p':'You place the order free. We contact the supplier and confirm price and availability first.',
    'how.s4.t':'Pay only once confirmed', 'how.s4.p':'When the supplier confirms, we issue an invoice. You pay into the company account, then we buy, ship, clear and deliver.',

    /* order flow */
    'ord.place':'Place order', 'ord.placed':'Order placed',
    'ord.status.placed':'Placed', 'ord.status.enquiring':'Checking with supplier',
    'ord.status.confirmed':'Confirmed by supplier', 'ord.status.invoiced':'Invoice issued',
    'ord.status.paid':'Paid', 'ord.status.sourcing':'Being bought',
    'ord.status.shipped':'Shipped', 'ord.status.delivered':'Delivered',
    'ord.status.cancelled':'Cancelled',
    'ord.none':'You have no orders yet.',
    'ord.nopay.note':'Placing an order costs you nothing. We only ask for payment after the supplier confirms the price and stock, and we send you a proper invoice.',

    /* auth */
    'auth.title':'Sign in', 'auth.phone':'Your mobile number',
    'auth.phone.hint':'We will send a code to this number on WhatsApp. No charge.',
    'auth.send':'Send code on WhatsApp', 'auth.code':'Enter the code',
    'auth.code.hint':'Check your WhatsApp for a 6-digit code.',
    'auth.verify':'Verify and continue', 'auth.resend':'Send again',
    'auth.name':'Your name', 'auth.business':'Shop or business name', 'auth.city':'City',
    'auth.register':'Create account', 'auth.badcode':'That code is not right. Try again.',
    'auth.expired':'That code has expired. Ask for a new one.',

    /* seller */
    'sell.title':'My shop', 'sell.listings':'My products',
    'sell.request':'Request a price change',
    'sell.request.note':'You cannot change the public price yourself. Send us the new price and we will review it — this is what keeps the market honest for buyers.',
    'sell.current':'Current price', 'sell.proposed':'New price',
    'sell.submit':'Send for review', 'sell.pending':'Under review',
    'sell.accepted':'Accepted', 'sell.rejected':'Not accepted',

    /* admin */
    'adm.title':'Admin', 'adm.dash':'Overview', 'adm.listings':'Listings',
    'adm.orders':'Orders', 'adm.sellers':'Suppliers', 'adm.buyers':'Buyers',
    'adm.costs':'Cost settings', 'adm.requests':'Price requests',
    'adm.supplier.contact':'Supplier contact', 'adm.ask.dulci':'Ask DULCi to email this supplier',
    'adm.costs.note':'Enter what you are actually charged. Every price on the site is calculated from these figures, so nothing here may be a guess.',
    'adm.costs.help':'Ask DULCi to research this rate',

    /* footer + misc */
    'foot.tagline':'Yuan.pk Pvt. Ltd. — transparent bulk sourcing from China for Pakistani wholesalers, dealers and general stores.',
    'foot.market':'Market','foot.company':'Company','foot.contact':'Contact',
    'foot.cats':'Categories','foot.goods':'Available goods','foot.terms':'Payment terms',
    'misc.loading':'Loading', 'misc.retry':'Try again', 'misc.save':'Save',
    'misc.cancel':'Cancel', 'misc.back':'Back', 'misc.rateoff':'Live rate unavailable — we will not show a guessed rate.'
  },

  ur: {
    'nav.market':'مارکیٹ','nav.how':'طریقہ کار','nav.pricing':'قیمت','nav.about':'تعارف',
    'nav.orders':'میرے آرڈر','nav.login':'داخل ہوں','nav.account':'اکاؤنٹ','nav.admin':'انتظام',
    'nav.seller':'میری دکان','nav.logout':'باہر نکلیں','nav.menu':'فہرست','nav.close':'بند کریں',
    'brand.sub':'یوآن مارکیٹ',
    'act.theme':'دن یا رات','act.lang':'زبان بدلیں','act.whatsapp':'واٹس ایپ',

    'hero.eyebrow':'یوو · بیگو · گوانگژو ← پاکستان',
    'hero.h1a':'چین کی اصل قیمت۔','hero.h1b':'کچھ چھپایا نہیں۔',
    'hero.lede':'ہم آپ کو وہی قیمت دکھاتے ہیں جو چینی دکاندار کے اپنے بورڈ پر لکھی ہے، آج کا ریٹ، اور آپ کی دکان تک مال پہنچنے کا ہر خرچہ — کرایہ، ڈیوٹی، سیلز ٹیکس، کلیئرنگ — ہر ایک الگ لائن میں۔',
    'hero.lede2':'ہمارا منافع بھی اُسی کاغذ پر ایک لائن ہے: سیدھی 20% سروس فیس۔ اس کے علاوہ ایک روپیہ بھی چپکے سے نہیں جوڑا جاتا۔',
    'hero.cta1':'مارکیٹ دیکھیں','hero.cta2':'یہ کیسے چلتا ہے',
    'hero.k1':'سال کا تجربہ','hero.k2':'صرف اتنی فیس','hero.k3':'چھپا ہوا خرچہ',
    'hero.k4':'لائسنس کی ضرورت','hero.k4v':'کوئی نہیں',

    'led.title':'قیمت کیسے بنتی ہے','led.sub':'نمونہ',
    'led.goods':'چینی دکان کی قیمت','led.conv':'آج کے ریٹ پر روپے میں',
    'led.freight':'کراچی تک سمندری کرایہ','led.duty':'کسٹم ڈیوٹی',
    'led.tax':'سیلز ٹیکس اور کلیئرنگ','led.inland':'آپ کے شہر تک ترسیل',
    'led.fee':'یوآن ڈاٹ پی کے سروس فیس','led.total':'آپ کی دکان پر پہنچ کر',
    'led.pending':'ریٹ کی تصدیق باقی','led.perhs':'ایچ ایس کوڈ کے مطابق',
    'led.once':'خرچے طے ہونے پر',
    'led.foot':'ہر ہندسہ کسی اصل ریٹ یا سرکاری شرح سے آتا ہے۔ جس چیز کا ثبوت نہ دکھا سکیں، وہ ہم لکھتے ہی نہیں۔',

    'tier.verified':'خود جا کر دیکھا ہوا','tier.indicative':'ابھی جا کر نہیں دیکھا',
    'tier.verified.help':'مرزا جاوید اقبال خود اس دکان میں گئے، مال دیکھا اور قیمت اپنے ہاتھ سے لکھی۔',
    'tier.indicative.help':'یہ سپلائر کی اپنی ویب سائٹ پر لکھی ہوئی قیمت ہے جو خودکار طور پر لی گئی ہے۔ نیچے دی گئی سورسنگ قیمت اندازاً ہے — جب تک وہ خود جا کر سودا نہ کر لیں۔',
    'tier.listedprice':'یہاں درج ہے','tier.approx':'اندازاً سورسنگ قیمت',
    'tier.captured':'تاریخ','tier.viewsource':'اصل اشتہار دیکھیں',

    'p.moq':'کم از کم آرڈر','p.china':'چین کی قیمت','p.landed':'آپ تک پہنچ کر، فی',
    'p.market':'آج کی مارکیٹ','p.breakdown':'پورا حساب دیکھیں',
    'p.order':'آرڈر کریں','p.nopay':'ابھی کوئی رقم نہیں',
    'p.unit.piece':'عدد','p.unit.set':'سیٹ','p.unit.carton':'کارٹن','p.unit.dozen':'درجن',
    'p.supplier':'سپلائر','p.qty':'تعداد','p.costspending':'خرچے کی تصدیق باقی',

    'list.title':'اِس وقت دستیاب مال','list.count':'اشیاء',
    'list.all':'سب','list.filter':'چھانٹیں','list.sort':'ترتیب',
    'list.empty.h':'مارکیٹ ابھی سجائی جا رہی ہے',
    'list.empty.p':'مرزا جاوید اقبال اِس وقت مارکیٹ میں مال کی تصاویر لے رہے ہیں اور اصل قیمتیں لکھ رہے ہیں۔ جس چیز کی تصدیق ہوتی جائے گی، وہ فوراً یہاں آ جائے گی۔ تب تک اپنی لسٹ واٹس ایپ پر بھیج دیں، ہم براہِ راست حساب بنا دیں گے۔',
    'list.empty.cta':'اپنی لسٹ واٹس ایپ پر بھیجیں',
    'list.error':'اس وقت فہرست کھل نہیں سکی۔ اپنی لسٹ واٹس ایپ پر بھیج دیں، ہم پورا حساب بنا کر جواب دیں گے۔',

    'how.eyebrow':'چار مرحلے','how.title':'یوو کی دکان سے ملتان کی دکان تک',
    'how.s1.t':'اپنا مال چنیں','how.s1.p':'مارکیٹ دیکھیں یا اپنی لسٹ واٹس ایپ پر بھیج دیں۔ صرف تھوک مقدار — یہ ڈیلر اور ہول سیل والوں کے لیے ہے۔',
    'how.s2.t':'پورا حساب دیکھیں','how.s2.p':'چینی قیمت، آج کا ریٹ، اور دکان تک پہنچنے کا ہر خرچہ — آپ کے کچھ بھی طے کرنے سے پہلے۔',
    'how.s3.t':'آرڈر بغیر ادائیگی','how.s3.p':'آرڈر کرنے پر کچھ نہیں لگتا۔ ہم پہلے سپلائر سے قیمت اور مال کی دستیابی پکی کرتے ہیں۔',
    'how.s4.t':'تصدیق کے بعد ادائیگی','how.s4.p':'سپلائر کی تصدیق کے بعد ہم بل بھیجتے ہیں۔ آپ کمپنی کے کھاتے میں رقم جمع کراتے ہیں، پھر ہم خرید، شپنگ، کلیئرنگ اور ترسیل کرتے ہیں۔',

    'ord.place':'آرڈر کریں','ord.placed':'آرڈر ہو گیا',
    'ord.status.placed':'آرڈر ہوا','ord.status.enquiring':'سپلائر سے پوچھا جا رہا ہے',
    'ord.status.confirmed':'سپلائر نے تصدیق کر دی','ord.status.invoiced':'بل بھیج دیا گیا',
    'ord.status.paid':'ادائیگی ہو گئی','ord.status.sourcing':'خریداری جاری',
    'ord.status.shipped':'روانہ ہو گیا','ord.status.delivered':'پہنچ گیا',
    'ord.status.cancelled':'منسوخ',
    'ord.none':'ابھی آپ کا کوئی آرڈر نہیں۔',
    'ord.nopay.note':'آرڈر کرنے پر آپ سے کچھ نہیں لیا جاتا۔ رقم صرف تب مانگی جاتی ہے جب سپلائر قیمت اور مال کی تصدیق کر دے اور ہم آپ کو باقاعدہ بل بھیج دیں۔',

    'auth.title':'داخل ہوں','auth.phone':'آپ کا موبائل نمبر',
    'auth.phone.hint':'ہم اسی نمبر پر واٹس ایپ کے ذریعے کوڈ بھیجیں گے۔ کوئی خرچہ نہیں۔',
    'auth.send':'واٹس ایپ پر کوڈ بھیجیں','auth.code':'کوڈ لکھیں',
    'auth.code.hint':'واٹس ایپ پر آیا ہوا 6 ہندسوں کا کوڈ دیکھیں۔',
    'auth.verify':'تصدیق کر کے آگے بڑھیں','auth.resend':'دوبارہ بھیجیں',
    'auth.name':'آپ کا نام','auth.business':'دکان یا کاروبار کا نام','auth.city':'شہر',
    'auth.register':'اکاؤنٹ بنائیں','auth.badcode':'یہ کوڈ درست نہیں۔ دوبارہ کوشش کریں۔',
    'auth.expired':'کوڈ کی معیاد ختم ہو گئی۔ نیا کوڈ منگوائیں۔',

    'sell.title':'میری دکان','sell.listings':'میرا مال',
    'sell.request':'قیمت کی تبدیلی کی درخواست',
    'sell.request.note':'آپ خود عوامی قیمت تبدیل نہیں کر سکتے۔ نئی قیمت ہمیں بھیجیں، ہم دیکھ کر فیصلہ کریں گے — یہی چیز خریداروں کے لیے مارکیٹ کو سچا رکھتی ہے۔',
    'sell.current':'موجودہ قیمت','sell.proposed':'نئی قیمت',
    'sell.submit':'جائزے کے لیے بھیجیں','sell.pending':'زیرِ غور',
    'sell.accepted':'منظور','sell.rejected':'منظور نہیں ہوئی',

    'adm.title':'انتظام','adm.dash':'مجموعی صورتحال','adm.listings':'مال کی فہرست',
    'adm.orders':'آرڈر','adm.sellers':'سپلائر','adm.buyers':'خریدار',
    'adm.costs':'خرچوں کی ترتیب','adm.requests':'قیمت کی درخواستیں',
    'adm.supplier.contact':'سپلائر کا رابطہ','adm.ask.dulci':'ڈلسی سے کہیں کہ سپلائر کو ای میل کرے',
    'adm.costs.note':'وہی لکھیں جو آپ سے حقیقت میں لیا جاتا ہے۔ سائٹ کی ہر قیمت انہی ہندسوں سے بنتی ہے، اس لیے یہاں کوئی اندازہ نہ ہو۔',
    'adm.costs.help':'ڈلسی سے یہ شرح معلوم کرائیں',

    'foot.tagline':'یوآن ڈاٹ پی کے پرائیویٹ لمیٹڈ — پاکستانی ہول سیلرز، ڈیلرز اور جنرل اسٹورز کے لیے چین سے کھلے حساب پر تھوک خریداری۔',
    'foot.market':'مارکیٹ','foot.company':'کمپنی','foot.contact':'رابطہ',
    'foot.cats':'اقسام','foot.goods':'دستیاب مال','foot.terms':'ادائیگی کی شرائط',
    'misc.loading':'کھل رہا ہے','misc.retry':'دوبارہ کوشش','misc.save':'محفوظ کریں',
    'misc.cancel':'منسوخ','misc.back':'واپس',
    'misc.rateoff':'ریٹ دستیاب نہیں — ہم اندازے کا ریٹ نہیں دکھائیں گے۔'
  },

  /* Chinese — seller-facing interface */
  zh: {
    'nav.market':'市场','nav.how':'流程','nav.pricing':'价格','nav.about':'关于我们',
    'nav.orders':'我的订单','nav.login':'登录','nav.account':'账户','nav.admin':'管理',
    'nav.seller':'我的店铺','nav.logout':'退出','nav.menu':'菜单','nav.close':'关闭',
    'brand.sub':'元市场',
    'act.theme':'日间/夜间','act.lang':'切换语言','act.whatsapp':'WhatsApp',

    'p.moq':'起订量','p.china':'中国价格','p.landed':'到店价，每',
    'p.market':'当前市场价','p.breakdown':'查看完整成本明细',
    'p.order':'下单','p.nopay':'现在无需付款',
    'p.unit.piece':'个','p.unit.set':'套','p.unit.carton':'箱','p.unit.dozen':'打',
    'p.supplier':'供应商','p.qty':'数量','p.costspending':'成本待确认',

    'tier.verified':'已实地考察','tier.indicative':'尚未实地考察',
    'tier.listedprice':'挂牌平台','tier.approx':'预估采购价',
    'tier.captured':'采集日期','tier.viewsource':'查看原始链接',

    'sell.title':'我的店铺','sell.listings':'我的产品',
    'sell.request':'申请修改价格',
    'sell.request.note':'您无法直接修改公开价格。请将新价格提交给我们审核 — 这正是让市场对买家保持诚信的机制。',
    'sell.current':'当前价格','sell.proposed':'新价格',
    'sell.submit':'提交审核','sell.pending':'审核中',
    'sell.accepted':'已通过','sell.rejected':'未通过',

    'auth.title':'登录','auth.phone':'您的手机号码',
    'auth.phone.hint':'我们会通过 WhatsApp 向该号码发送验证码，免费。',
    'auth.send':'发送验证码','auth.code':'输入验证码',
    'auth.code.hint':'请查收 WhatsApp 上的 6 位验证码。',
    'auth.verify':'验证并继续','auth.resend':'重新发送',
    'auth.name':'您的姓名','auth.business':'店铺或公司名称','auth.city':'城市',
    'auth.register':'创建账户','auth.badcode':'验证码不正确，请重试。',
    'auth.expired':'验证码已过期，请重新获取。',

    'ord.status.placed':'已下单','ord.status.enquiring':'正在向供应商询价',
    'ord.status.confirmed':'供应商已确认','ord.status.invoiced':'已开具发票',
    'ord.status.paid':'已付款','ord.status.sourcing':'采购中',
    'ord.status.shipped':'已发货','ord.status.delivered':'已送达',
    'ord.status.cancelled':'已取消',

    'misc.loading':'加载中','misc.retry':'重试','misc.save':'保存',
    'misc.cancel':'取消','misc.back':'返回'
  }
};
