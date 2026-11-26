/**
 * FILE: src/config/executiveSample.js
 * SAMPLE DATA (10 Nov 2026) for the executive dashboard when the server has no GET /reports/executive-overview
 * (the original backend). Taken from the portal's M&E testing data for FY 2025/2026 (institutions' own 2025/26 M&E
 * tools; Ministry departments shaped on the 2025/26 M&E report). NOT official Ministry figures: the page shows a
 * National figures (GDP share, sector growth, exports) follow the 2025/26 M&E report (PPT slides 4-5); jobs, new industries,
 * SME loan value and investment are invented sample values.
 * permanent "sample data" banner whenever this is used, and switches to real data once the endpoint exists.
 */
export const EXECUTIVE_SAMPLE = {
 "type": "executive-overview",
 "generatedAt": null,
 "filters": {
  "financialYear": "2025/2026"
 },
 "financialYear": "2025/2026",
 "previousFinancialYear": "2024/2025",
 "headline": [
  {
   "key": "companies",
   "labelSw": "Makampuni yaliyosajiliwa",
   "labelEn": "Companies registered",
   "unit": "number",
   "combine": "sum",
   "actual": 19714,
   "target": 19640,
   "indicators": 1,
   "institutions": [
    "Business Registrations and Licensing Agency"
   ],
   "achievementPercent": 100.38,
   "contributions": [
    {
     "institutionCode": "BRELA",
     "actual": 19714
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 4686
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 4205
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 6003
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 4820
    }
   ],
   "previousActual": 18578,
   "cumulativeActual": 87933,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "business_names",
   "labelSw": "Majina ya biashara yaliyosajiliwa",
   "labelEn": "Business names registered",
   "unit": "number",
   "combine": "sum",
   "actual": 36156,
   "target": 33800,
   "indicators": 1,
   "institutions": [
    "Business Registrations and Licensing Agency"
   ],
   "achievementPercent": 106.97,
   "contributions": [
    {
     "institutionCode": "BRELA",
     "actual": 36156
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 9690
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 7633
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 11024
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 7809
    }
   ],
   "previousActual": 35310,
   "cumulativeActual": 158228,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "industrial_licences",
   "labelSw": "Leseni za viwanda",
   "labelEn": "Industrial licences issued",
   "unit": "number",
   "combine": "sum",
   "actual": 623,
   "target": 437,
   "indicators": 1,
   "institutions": [
    "Business Registrations and Licensing Agency"
   ],
   "achievementPercent": 142.56,
   "contributions": [
    {
     "institutionCode": "BRELA",
     "actual": 623
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 145
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 118
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 215
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 145
    }
   ],
   "previousActual": 542,
   "cumulativeActual": 2648,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "business_licences",
   "labelSw": "Leseni za biashara",
   "labelEn": "Business licences issued",
   "unit": "number",
   "combine": "sum",
   "actual": 22893,
   "target": 21582,
   "indicators": 1,
   "institutions": [
    "Business Registrations and Licensing Agency"
   ],
   "achievementPercent": 106.07,
   "contributions": [
    {
     "institutionCode": "BRELA",
     "actual": 22893
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 7630
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 4867
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 5128
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 5268
    }
   ],
   "previousActual": 22617,
   "cumulativeActual": 104463,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "markets",
   "labelSw": "Masoko: maonesho na misheni",
   "labelEn": "Market access: fairs and missions",
   "unit": "number",
   "combine": "sum",
   "actual": 19,
   "target": 19,
   "indicators": 2,
   "institutions": [
    "Business Registrations and Licensing Agency",
    "National Development Corporation"
   ],
   "achievementPercent": 100,
   "contributions": [
    {
     "institutionCode": "BRELA",
     "actual": 14
    },
    {
     "institutionCode": "NDC",
     "actual": 5
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 7
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 6
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 2
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 4
    }
   ],
   "previousActual": 18,
   "cumulativeActual": 84,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "technologies",
   "labelSw": "Teknolojia zilizobuniwa",
   "labelEn": "Technologies developed",
   "unit": "number",
   "combine": "sum",
   "actual": 117,
   "target": 150,
   "indicators": 4,
   "institutions": [
    "Centre for Agricultural Mechanisation and Rural Technology",
    "Small Industries Development Organization",
    "Tanzania Engineering and Manufacturing Design Organization"
   ],
   "achievementPercent": 78,
   "contributions": [
    {
     "institutionCode": "CAMARTEC",
     "actual": 92
    },
    {
     "institutionCode": "SIDO",
     "actual": 21
    },
    {
     "institutionCode": "TEMDO",
     "actual": 4
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 12
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 24
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 14
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 67
    }
   ],
   "previousActual": 99,
   "cumulativeActual": 460,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "research",
   "labelSw": "Tafiti zilizokamilika",
   "labelEn": "Research studies completed",
   "unit": "number",
   "combine": "sum",
   "actual": 111,
   "target": 111,
   "indicators": 3,
   "institutions": [
    "College of Business Education",
    "Tanzania Trade Development Authority",
    "Tanzania Bureau of Standards"
   ],
   "achievementPercent": 100,
   "contributions": [
    {
     "institutionCode": "TBS",
     "actual": 100
    },
    {
     "institutionCode": "CBE",
     "actual": 10
    },
    {
     "institutionCode": "TANTRADE",
     "actual": 1
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 14.5
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 20.5
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 43.3
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 37.7
    }
   ],
   "previousActual": 96.45,
   "cumulativeActual": 432.61,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "sme_loans_count",
   "labelSw": "Mikopo kwa SMEs",
   "labelEn": "Loans to SMEs",
   "unit": "number",
   "combine": "sum",
   "actual": 330,
   "target": 350,
   "indicators": 1,
   "institutions": [
    "Small Industries Development Organization"
   ],
   "achievementPercent": 94.29,
   "contributions": [
    {
     "institutionCode": "SIDO",
     "actual": 330
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 0
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 0.01
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 0
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 329.99
    }
   ],
   "previousActual": 296,
   "cumulativeActual": 350.56,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "gdp_share",
   "labelSw": "Mchango wa viwanda kwenye Pato la Taifa",
   "labelEn": "Industry share of GDP",
   "unit": "%",
   "combine": "average",
   "actual": 5.9,
   "target": 8.5,
   "indicators": 1,
   "institutions": [
    "NBS"
   ],
   "achievementPercent": 69.41,
   "contributions": [
    {
     "institutionCode": "NBS",
     "actual": 5.9
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 5.8
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 5.9
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 5.9
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 5.9
    }
   ],
   "previousActual": 6.8
  },
  {
   "key": "sector_growth",
   "labelSw": "Ukuaji wa sekta ya viwanda",
   "labelEn": "Industrial sector growth",
   "unit": "%",
   "combine": "average",
   "actual": 5.2,
   "target": 6.0,
   "indicators": 1,
   "institutions": [
    "NBS"
   ],
   "achievementPercent": 86.67,
   "contributions": [
    {
     "institutionCode": "NBS",
     "actual": 5.2
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 5.0
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 5.1
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 5.3
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 5.2
    }
   ],
   "previousActual": 4.8
  },
  {
   "key": "trade_growth",
   "labelSw": "Ukuaji wa sekta ya biashara",
   "labelEn": "Trade sector growth",
   "unit": "%",
   "combine": "average",
   "actual": 5.1,
   "target": 5.5,
   "indicators": 1,
   "institutions": [
    "NBS"
   ],
   "achievementPercent": 92.73,
   "contributions": [
    {
     "institutionCode": "NBS",
     "actual": 5.1
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 4.9
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 5.0
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 5.2
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 5.1
    }
   ],
   "previousActual": 4.9
  },
  {
   "key": "exports_usd",
   "labelSw": "Mauzo ya bidhaa nje",
   "labelEn": "Exports",
   "unit": "USD",
   "combine": "sum",
   "actual": 10080000000,
   "target": 11000000000,
   "indicators": 1,
   "institutions": [
    "BoT"
   ],
   "achievementPercent": 91.64,
   "contributions": [
    {
     "institutionCode": "BoT",
     "actual": 10080000000
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 2310000000
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 2450000000
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 2620000000
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 2700000000
    }
   ],
   "previousActual": 8700000000,
   "cumulativeActual": 41200000000,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "jobs",
   "labelSw": "Ajira zilizozalishwa",
   "labelEn": "Jobs created",
   "unit": "number",
   "combine": "sum",
   "actual": 52340,
   "target": 50000,
   "indicators": 1,
   "institutions": [
    "Taasisi za Wizara"
   ],
   "achievementPercent": 104.68,
   "contributions": [
    {
     "institutionCode": "SIDO",
     "actual": 31200
    },
    {
     "institutionCode": "TANTRADE",
     "actual": 13640
    },
    {
     "institutionCode": "NDC",
     "actual": 7500
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 11800
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 12650
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 13470
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 14420
    }
   ],
   "previousActual": 47120,
   "cumulativeActual": 213500,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "new_industries",
   "labelSw": "Viwanda vipya",
   "labelEn": "New industries established",
   "unit": "number",
   "combine": "sum",
   "actual": 486,
   "target": 450,
   "indicators": 1,
   "institutions": [
    "Taasisi za Wizara"
   ],
   "achievementPercent": 108.0,
   "contributions": [
    {
     "institutionCode": "SIDO",
     "actual": 351
    },
    {
     "institutionCode": "BRELA",
     "actual": 135
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 104
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 117
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 126
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 139
    }
   ],
   "previousActual": 431,
   "cumulativeActual": 1960,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "sme_loans_amount",
   "labelSw": "Thamani ya mikopo kwa SMEs",
   "labelEn": "Value of loans to SMEs",
   "unit": "TZS",
   "combine": "sum",
   "actual": 48200000000,
   "target": 45000000000,
   "indicators": 1,
   "institutions": [
    "Small Industries Development Organization"
   ],
   "achievementPercent": 107.11,
   "contributions": [
    {
     "institutionCode": "SIDO",
     "actual": 48200000000
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 10900000000
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 11800000000
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 12400000000
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 13100000000
    }
   ],
   "previousActual": 41500000000,
   "cumulativeActual": 176000000000,
   "cumulativeFrom": "2021/2022"
  },
  {
   "key": "investment",
   "labelSw": "Uwekezaji",
   "labelEn": "Investment",
   "unit": "USD",
   "combine": "sum",
   "actual": 6600000000,
   "target": 6000000000,
   "indicators": 1,
   "institutions": [
    "TIC"
   ],
   "achievementPercent": 110.0,
   "contributions": [
    {
     "institutionCode": "TIC",
     "actual": 6600000000
    }
   ],
   "series": [
    {
     "periodLabel": "2025/2026 Q1",
     "actual": 1500000000
    },
    {
     "periodLabel": "2025/2026 Q2",
     "actual": 1620000000
    },
    {
     "periodLabel": "2025/2026 Q3",
     "actual": 1690000000
    },
    {
     "periodLabel": "2025/2026 Q4",
     "actual": 1790000000
    }
   ],
   "previousActual": 5800000000,
   "cumulativeActual": 24100000000,
   "cumulativeFrom": "2021/2022"
  }
 ],
 "summary": {
  "indicators": 1014,
  "submissions": 428,
  "deliveryPercent": 83.06,
  "fullyAchieved": 684,
  "underperforming": 207,
  "publishedSubmissions": 428,
  "institutions": 13
 },
 "budget": {
  "approvedBudget": "139420608941.96",
  "actualReceived": "37407181503.36",
  "actualExpenditure": "100968285986.16",
  "budgetUtilisationPercent": 72.6,
  "financialCoveragePercent": 77.57,
  "receivedUtilisationPercent": null,
  "annualBudgetCount": 85,
  "legacyBudgetSubmissions": 88
 },
 "institutions": [
  {
   "institutionCode": "BRELA",
   "institutionName": "Business Registrations and Licensing Agency",
   "indicators": 34,
   "submissions": 16,
   "institutions": 1,
   "deliveryPercent": 95.47,
   "fullyAchieved": 28,
   "underperforming": 2,
   "approvedBudget": "38076493588.47",
   "actualReceived": "25579029442.20",
   "actualExpenditure": "24853269235.36",
   "budgetUtilisationPercent": 65.27,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": 97.16,
   "annualBudgetCount": 4,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 30.2,
   "compositeScore": 89.43,
   "rating": "High"
  },
  {
   "institutionCode": "MIT",
   "institutionName": "Ministry of Industry and Trade",
   "indicators": 89,
   "submissions": 156,
   "institutions": 1,
   "deliveryPercent": 94.17,
   "fullyAchieved": 61,
   "underperforming": 4,
   "approvedBudget": "12360005000.00",
   "actualReceived": "11828152061.16",
   "actualExpenditure": "11418622588.36",
   "budgetUtilisationPercent": 92.38,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": 96.54,
   "annualBudgetCount": 39,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 1.79,
   "compositeScore": 93.81,
   "rating": "High"
  },
  {
   "institutionCode": "FCC",
   "institutionName": "Fair Competition Commission",
   "indicators": 133,
   "submissions": 20,
   "institutions": 1,
   "deliveryPercent": 90.96,
   "fullyAchieved": 119,
   "underperforming": 13,
   "approvedBudget": "13588152791.00",
   "actualReceived": null,
   "actualExpenditure": "12597576464.00",
   "budgetUtilisationPercent": 92.71,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 5,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": -1.75,
   "compositeScore": 91.31,
   "rating": "High"
  },
  {
   "institutionCode": "WRRB",
   "institutionName": "Warehouse Receipts Regulatory Board",
   "indicators": 65,
   "submissions": 28,
   "institutions": 1,
   "deliveryPercent": 89.93,
   "fullyAchieved": 52,
   "underperforming": 7,
   "approvedBudget": "5406831512.95",
   "actualReceived": null,
   "actualExpenditure": "4994138389.92",
   "budgetUtilisationPercent": 92.37,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 7,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": -2.44,
   "compositeScore": 90.42,
   "rating": "High"
  },
  {
   "institutionCode": "TBS",
   "institutionName": "Tanzania Bureau of Standards",
   "indicators": 20,
   "submissions": 8,
   "institutions": 1,
   "deliveryPercent": 86.48,
   "fullyAchieved": 12,
   "underperforming": 3,
   "approvedBudget": null,
   "actualReceived": null,
   "actualExpenditure": null,
   "budgetUtilisationPercent": null,
   "financialCoveragePercent": 0,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 0,
   "legacyBudgetSubmissions": 8,
   "deliveryExpenditureGap": null,
   "compositeScore": null,
   "rating": "High"
  },
  {
   "institutionCode": "WMA",
   "institutionName": "Weights and Measures Agency",
   "indicators": 85,
   "submissions": 20,
   "institutions": 1,
   "deliveryPercent": 85.22,
   "fullyAchieved": 52,
   "underperforming": 17,
   "approvedBudget": "47329304485.54",
   "actualReceived": null,
   "actualExpenditure": "39277939854.68",
   "budgetUtilisationPercent": 82.99,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 5,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 2.23,
   "compositeScore": 84.77,
   "rating": "High"
  },
  {
   "institutionCode": "TANTRADE",
   "institutionName": "Tanzania Trade Development Authority",
   "indicators": 109,
   "submissions": 28,
   "institutions": 1,
   "deliveryPercent": 84.58,
   "fullyAchieved": 75,
   "underperforming": 21,
   "approvedBudget": "7133082898.00",
   "actualReceived": null,
   "actualExpenditure": "4255943667.60",
   "budgetUtilisationPercent": 59.66,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 7,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 24.92,
   "compositeScore": 79.6,
   "rating": "High"
  },
  {
   "institutionCode": "NDC",
   "institutionName": "National Development Corporation",
   "indicators": 53,
   "submissions": 24,
   "institutions": 1,
   "deliveryPercent": 81.51,
   "fullyAchieved": 34,
   "underperforming": 14,
   "approvedBudget": null,
   "actualReceived": null,
   "actualExpenditure": null,
   "budgetUtilisationPercent": null,
   "financialCoveragePercent": 0,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 0,
   "legacyBudgetSubmissions": 24,
   "deliveryExpenditureGap": null,
   "compositeScore": null,
   "rating": "High"
  },
  {
   "institutionCode": "FCT",
   "institutionName": "Fair Competition Tribunal",
   "indicators": 85,
   "submissions": 20,
   "institutions": 1,
   "deliveryPercent": 79.69,
   "fullyAchieved": 62,
   "underperforming": 20,
   "approvedBudget": "4019908168.00",
   "actualReceived": null,
   "actualExpenditure": "1424962882.00",
   "budgetUtilisationPercent": 35.45,
   "financialCoveragePercent": 100,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 5,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 44.24,
   "compositeScore": 70.84,
   "rating": "High"
  },
  {
   "institutionCode": "CBE",
   "institutionName": "College of Business Education",
   "indicators": 127,
   "submissions": 24,
   "institutions": 1,
   "deliveryPercent": 79.08,
   "fullyAchieved": 79,
   "underperforming": 33,
   "approvedBudget": null,
   "actualReceived": null,
   "actualExpenditure": null,
   "budgetUtilisationPercent": null,
   "financialCoveragePercent": 0,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 0,
   "legacyBudgetSubmissions": 24,
   "deliveryExpenditureGap": null,
   "compositeScore": null,
   "rating": "High"
  },
  {
   "institutionCode": "TEMDO",
   "institutionName": "Tanzania Engineering and Manufacturing Design Organization",
   "indicators": 52,
   "submissions": 28,
   "institutions": 1,
   "deliveryPercent": 73.69,
   "fullyAchieved": 27,
   "underperforming": 17,
   "approvedBudget": "9017743250.00",
   "actualReceived": null,
   "actualExpenditure": "1782746800.24",
   "budgetUtilisationPercent": 20.56,
   "financialCoveragePercent": 85.71,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 7,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 53.13,
   "compositeScore": 63.06,
   "rating": "High"
  },
  {
   "institutionCode": "SIDO",
   "institutionName": "Small Industries Development Organization",
   "indicators": 142,
   "submissions": 32,
   "institutions": 1,
   "deliveryPercent": 73.34,
   "fullyAchieved": 77,
   "underperforming": 45,
   "approvedBudget": null,
   "actualReceived": null,
   "actualExpenditure": null,
   "budgetUtilisationPercent": null,
   "financialCoveragePercent": 0,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 0,
   "legacyBudgetSubmissions": 32,
   "deliveryExpenditureGap": null,
   "compositeScore": null,
   "rating": "High"
  },
  {
   "institutionCode": "CAMARTEC",
   "institutionName": "Centre for Agricultural Mechanisation and Rural Technology",
   "indicators": 20,
   "submissions": 24,
   "institutions": 1,
   "deliveryPercent": 53.99,
   "fullyAchieved": 6,
   "underperforming": 11,
   "approvedBudget": "2489087248.00",
   "actualReceived": null,
   "actualExpenditure": "363086104.00",
   "budgetUtilisationPercent": 14.61,
   "financialCoveragePercent": 83.33,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 6,
   "legacyBudgetSubmissions": 0,
   "deliveryExpenditureGap": 39.38,
   "compositeScore": 46.11,
   "rating": "Moderate"
  }
 ],
 "sectors": [
  {
   "sectorName": "Trade",
   "indicators": 709,
   "submissions": 284,
   "institutions": 8,
   "deliveryPercent": 86.39,
   "fullyAchieved": 519,
   "underperforming": 115,
   "approvedBudget": "125513776443.96",
   "actualReceived": "35186600377.08",
   "actualExpenditure": "96672451281.92",
   "budgetUtilisationPercent": 77.02,
   "financialCoveragePercent": 91.55,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 65,
   "legacyBudgetSubmissions": 24,
   "deliveryExpenditureGap": 9.37,
   "compositeScore": 84.52,
   "rating": "High",
   "institutionCodes": [
    "BRELA",
    "CBE",
    "FCC",
    "FCT",
    "TANTRADE",
    "WMA",
    "WRRB",
    "MIT"
   ]
  },
  {
   "sectorName": "Industry",
   "indicators": 358,
   "submissions": 248,
   "institutions": 6,
   "deliveryPercent": 78.51,
   "fullyAchieved": 206,
   "underperforming": 93,
   "approvedBudget": "21516834498.00",
   "actualReceived": "9625680668.00",
   "actualExpenditure": "11436954582.60",
   "budgetUtilisationPercent": 54.03,
   "financialCoveragePercent": 70.97,
   "receivedUtilisationPercent": null,
   "annualBudgetCount": 46,
   "legacyBudgetSubmissions": 64,
   "deliveryExpenditureGap": 24.48,
   "compositeScore": 73.61,
   "rating": "High",
   "institutionCodes": [
    "CAMARTEC",
    "NDC",
    "SIDO",
    "TBS",
    "TEMDO",
    "MIT"
   ]
  }
 ],
 "exceptions": {
  "Overachievement": 290,
  "Underperformance": 136,
  "Zero delivery": 71
 },
 "previous": {
  "summary": {
   "indicators": 1014,
   "submissions": 428,
   "deliveryPercent": 83.3,
   "fullyAchieved": 611,
   "underperforming": 217,
   "publishedSubmissions": 428,
   "institutions": 13
  },
  "budget": {
   "budgetUtilisationPercent": 73.84
  }
 },
 "sample": true
};
