from __future__ import annotations

import logging
from typing import List, Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.pretty import Pretty
from rich.table import Table


# --- Configuration ---
import os
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")  # was hard-coded; now read from the environment (never commit keys)

# Pricing per 1M tokens (USD) - Gemini 1.5 Flash/Lite rates
PRICING = {
    "gemini-2.5-flash-lite": {"in": 0.075, "out": 0.30},
    "gemini-2.5-flash": {"in": 0.075, "out": 0.30},
    "gemini-1.5-flash": {"in": 0.075, "out": 0.30},
    "gemini-1.5-pro": {"in": 3.50, "out": 10.50},
}


console = Console()
logger = logging.getLogger("promoter_analyzer")


# --- Schema ---
class PromoterKPI(BaseModel):
    ساعت_کار_ثبت_شده: Optional[float] = None
    درصد_تکمیل_کارها: Optional[int] = Field(None, description="۰ تا ۱۰۰")
    کیفیت_تعامل_با_mخاطب: Optional[int] = Field(None, description="۰ تا ۱۰")
    نظم_و_مسئولیت_پذیری: Optional[int] = Field(None, description="۰ تا ۱۰")
    رعایت_استانداردهای_برند: Optional[int] = Field(None, description="۰ تا ۱۰")


class PromoterReport(BaseModel):
    شناسه_پروموتر: Optional[str] = None
    خلاصه_اجرایی: str
    نکات_کلیدی: List[str]
    نقاط_قوت: List[str]
    نقاط_ضعف: List[str]
    ریسک_ها_و_هشدارها: List[str]
    KPI: PromoterKPI
    پیشنهادهای_عملیاتی_هفته_بعد: List[str]
    سوالات_پیگیری: List[str]
    امتیاز_نهایی_از_100: int


# --- Core Logic ---
def analyze_promoter_texts(
    texts: List[str], promoter_id: str = "نامشخص", model: str = "gemini-2.5-flash-lite"
) -> PromoterReport:
    if not any(t.strip() for t in texts):
        raise ValueError("No valid text provided.")

    llm = ChatGoogleGenerativeAI(model=model, google_api_key=GOOGLE_API_KEY, temperature=0.2)
    runnable = llm.with_structured_output(PromoterReport, method="json_schema", include_raw=True)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "تو یک تحلیل‌گر عملکرد تیم‌های میدانی هستی. خروجی فقط فارسی، عملیاتی و بر اساس شواهد متن باشد."),
            ("human", "شناسه پروموتر: {pid}\n\nگزارش‌ها:\n{content}"),
        ]
    )

    content = "\n\n---\n\n".join(f"[متن {i+1}]\n{t.strip()}" for i, t in enumerate(texts))
    logger.info(f"Analyzing reports for {promoter_id}...")

    res = (prompt | runnable).invoke({"pid": promoter_id, "content": content})
    _display_stats(model, res["raw"].usage_metadata)

    return res["parsed"]


def _display_stats(model: str, usage: dict):
    tin, tout = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    p = PRICING.get(model, PRICING["gemini-2.5-flash-lite"])
    cost = (tin * p["in"] + tout * p["out"]) / 1e6

    table = Table(title="Token Usage & Cost", box=None, header_style="bold magenta")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Model", model)
    table.add_row("Input / Output", f"{tin} / {tout}")
    table.add_row("Total Tokens", str(usage.get("total_tokens", tin + tout)))
    table.add_row("Cost (USD)", f"${cost:.6f}")
    console.print(table)


# --- Sample Data (for testing) ---
SAMPLE_PROMOTER_TEXTS = [
    """
نام: علی رضایی
تاریخ: ۱۴۰۴/۰۹/۲۹
ورود: ۱۶:۱۰ | خروج: ۲۲:۴۵
لوکیشن‌ها: پالادیوم، پارک آب‌و‌آتش، ایران‌مال (ورودی سینما)
وظایف: سمپلینگ، توضیح محصول، جمع‌آوری لید، ثبت موجودی
مشاهده سوپروایزر: تعامل خوب با مخاطب، انرژی بالا، اما ثبت لیدها ناقص بود.
اتفاق خاص: دو بار دیر به جابه‌جایی لوکیشن رسید (ترافیک). لباس فرم کامل بود.
""",
    """
گزارش روز بعد:
ورود: ۱۶:۰۰ | خروج: ۲۳:۰۰
کارها: سمپلینگ عالی، اما در پایان شیفت شمارش موجودی با اختلاف ۸ عدد گزارش شد.
یادداشت: نیاز به دقت بیشتر در تحویل‌-تحویل (handover) و ثبت فرم‌ها.
""",
]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s", handlers=[RichHandler(rich_tracebacks=True)])

    sample_data = [
        "نام: علی رضایی\nورود: ۱۶:۱۰ | خروج: ۲۲:۴۵\nتوضیح: تعامل عالی با مشتری، اما ثبت لیدها ناقص بود.",
        "گزارش روز دوم: سمپلینگ با موفقیت انجام شد. موجودی نهایی با اختلاف ۸ عدد ثبت شد.",
    ]

    try:
        report = analyze_promoter_texts(sample_data, "PR-021")
        console.print(Panel(Pretty(report.model_dump()), title="[bold green]Analysis Result[/bold green]"))
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
