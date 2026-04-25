import type { CustomerProfile, DemoScenario } from "../types.js";

export const demoCustomers: CustomerProfile[] = [
  {
    id: "cust_001",
    full_name: "Aziz Karimov",
    phone_masked: "+99890XXX2233",
    age: 34,
    income_range: "8-12 mln so'm",
    segment: "salary",
    risk_level: "medium",
    is_pep: false,
    kyc_status: "needs_update",
    products: [
      { id: "prod_001", type: "overdraft", title: "Ish haqi overdrafti", status: "active", balance_range: "3-5 mln so'm" },
      { id: "prod_002", type: "card", title: "Humo salary karta", status: "active", balance_range: "oylik tushum bor" },
      { id: "prod_003", type: "insurance", title: "Kredit sug'urtasi", status: "eligible", balance_range: "mos" }
    ],
    last_interaction: "Kredit foizi bo'yicha maslahat so'ragan",
    next_best_products: ["Kredit karta", "Kredit sug'urtasi", "Refinancing maslahat"]
  },
  {
    id: "cust_002",
    full_name: "Dilnoza Ergasheva",
    phone_masked: "+99893XXX4411",
    age: 29,
    income_range: "5-8 mln so'm",
    segment: "mass",
    risk_level: "low",
    is_pep: false,
    kyc_status: "complete",
    products: [
      { id: "prod_004", type: "card", title: "Visa Classic", status: "active", balance_range: "normal" },
      { id: "prod_005", type: "deposit", title: "3 oylik omonat", status: "eligible", balance_range: "2-5 mln so'm" }
    ],
    last_interaction: "Karta bloklanishi bo'yicha murojaat qilgan",
    next_best_products: ["Digital karta xavfsizligi", "Omonat", "SMS xabarnoma"]
  }
];

export const demoScenarios: DemoScenario[] = [
  {
    id: "credit-objection",
    title: "Kredit e'tirozi",
    description: "Mijoz kreditga qiziqadi, lekin foiz qimmat deb xavotir bildiradi.",
    customer_message:
      "Assalomu alaykum, menga 50 million so'm kredit kerak edi. 24 oyga olmoqchiman, lekin foizi qimmat bo'lsa kerak.",
    transcript: [
      { speaker: "customer", text: "Assalomu alaykum, menga 50 million so'm kredit kerak edi." },
      { speaker: "agent", text: "Qanday muddatga olmoqchisiz?" },
      { speaker: "customer", text: "24 oyga. Lekin foizi qimmat bo'lsa kerak." }
    ]
  },
  {
    id: "complaint-routing",
    title: "Shikoyat va routing",
    description: "Mijoz kartadan pul yechilganini aytadi, AI ticket ochib status beradi.",
    customer_message:
      "Kecha kartamdan 250 ming so'm yechilib ketdi, men bu to'lovni qilmaganman. Tezroq tekshirib bering.",
    transcript: [
      { speaker: "customer", text: "Kecha kartamdan 250 ming so'm yechilib ketdi." },
      { speaker: "agent", text: "To'lovni o'zingiz qilmaganingizni tasdiqlaysizmi?" },
      { speaker: "customer", text: "Ha, men qilmaganman, shikoyat yozib bering." }
    ]
  },
  {
    id: "compliance-risk",
    title: "Compliance risk",
    description: "Operator noto'g'ri va'da beradigan holat.",
    customer_message: "Kreditni tezroq olsam bo'ladimi? Agar ariza bersam 100 foiz tasdiqlanadimi?",
    transcript: [
      { speaker: "customer", text: "Kreditni tezroq olsam bo'ladimi?" },
      { speaker: "agent", text: "Ha, ariza qoldirsangiz aniq tasdiqlanadi." },
      { speaker: "customer", text: "Foizini keyin bilib olarman." }
    ]
  },
  {
    id: "ai-outbound",
    title: "AI outbound call",
    description: "AI agent kredit to'lovi bo'yicha qo'ng'iroq qiladi va muammoni CRMga yozadi.",
    customer_message:
      "Men to'lovni ertaga qilaman, lekin ilovada to'lov tugmasi ishlamayapti. Menga yordam kerak.",
    transcript: [
      { speaker: "agent", text: "Assalomu alaykum, bu bank AI yordamchisi. Kredit to'lovingiz bo'yicha eslatma uchun bog'landim." },
      { speaker: "customer", text: "Men to'lovni ertaga qilaman, lekin ilovada to'lov tugmasi ishlamayapti." },
      { speaker: "agent", text: "Murojaatingizni digital support bo'limiga yuboraman va statusini CRMda progressga o'tkazaman." }
    ]
  }
];

export const productReferences = {
  credit_request: [
    {
      id: "credit-disclosure",
      title: "Kredit shartlari disclosure",
      category: "compliance",
      why_it_matters: "Foiz, muddat va umumiy to'lovni shaffof aytish compliance riskini kamaytiradi.",
      script_anchor: "Aniq tasdiq skoring natijasiga bog'liq, umumiy to'lov oldindan ko'rsatiladi.",
      verified: true
    },
    {
      id: "credit-card-insurance",
      title: "Kredit karta + sug'urta",
      category: "cross-sell",
      why_it_matters: "Overdraft ishlatadigan salary mijozga ehtiyot limit va himoya paketi mos keladi.",
      script_anchor: "Oylik tushumingiz stabil bo'lgani uchun limitli karta va sug'urta paketini ko'rib chiqish mumkin.",
      verified: true
    }
  ],
  card_opening: [
    {
      id: "card-security",
      title: "Karta xavfsizligi",
      category: "service",
      why_it_matters: "Karta bloklanishi va fraud holatlarida tez ticket ochish kerak.",
      script_anchor: "Kartani vaqtincha bloklab, fraud tekshiruv ticketini ochamiz.",
      verified: true
    }
  ],
  deposit: [
    {
      id: "deposit-mobile",
      title: "Mobil omonat",
      category: "deposit",
      why_it_matters: "Omonatni masofadan ochish call-center yukini kamaytiradi.",
      script_anchor: "Ilova orqali muddat va shartlarni solishtirib omonat ochishingiz mumkin.",
      verified: true
    }
  ],
  leasing: [
    {
      id: "leasing-precheck",
      title: "Lizing pre-check",
      category: "leasing",
      why_it_matters: "Boshlang'ich to'lov va obyekt qiymati oldindan tekshiriladi.",
      script_anchor: "Lizing uchun obyekt qiymati, boshlang'ich to'lov va hujjatlarni tekshirib chiqamiz.",
      verified: true
    }
  ],
  complaint: [
    {
      id: "complaint-ticket",
      title: "Shikoyat ticket",
      category: "service",
      why_it_matters: "Mijoz murojaat raqami va SLA olishi kerak.",
      script_anchor: "Murojaatingiz uchun ticket ochildi, statusini kuzatib boramiz.",
      verified: true
    }
  ],
  general_question: [
    {
      id: "service-routing",
      title: "Xizmat routing",
      category: "service",
      why_it_matters: "Mijoz ehtiyojiga qarab bo'limga yo'naltiriladi.",
      script_anchor: "Kerakli bo'limga ulayman yoki murojaat ochib beraman.",
      verified: false
    }
  ]
} as const;
