"""
ShokhAI - Shokh Restaurant aqlli operatsion yordamchisi va konsultanti.
Mehmonlar va xodimlar/rahbariyat savollariga moslashuvchan, tabiiy va aqlli javob beradi.
"""
import sqlite3
from datetime import datetime, timedelta

def query_resto_ai(prompt: str, db_conn) -> str:
    cursor = db_conn.cursor()
    p = prompt.lower().strip()

    # Bazadagi dolzarb ma'lumotlarni yig'ish
    # 1. Xodimlar va davomat
    cursor.execute("""
        SELECT s.id, s.name, s.role, s.hourly_rate, s.shift_preference,
               a.clock_in, a.shift_name, a.is_late, a.late_minutes, a.penalty_amount, a.penalty_reason
        FROM staff s
        LEFT JOIN attendance a ON s.id = a.staff_id AND a.clock_out IS NULL
        WHERE s.status = 'active'
        ORDER BY s.hourly_rate DESC
    """)
    staff_rows = cursor.fetchall()
    active_workers = [r for r in staff_rows if r["clock_in"]]
    absent_workers = [r for r in staff_rows if not r["clock_in"]]

    # 2. Jarimalar
    cursor.execute("""
        SELECT a.*, s.name as staff_name, s.role as staff_role
        FROM attendance a JOIN staff s ON a.staff_id = s.id
        WHERE a.is_late = 1 OR a.penalty_amount > 0
        ORDER BY a.clock_in DESC LIMIT 10
    """)
    penalties = cursor.fetchall()

    # 3. Ombor va yaroqlilik
    cursor.execute("SELECT * FROM inventory ORDER BY current_stock ASC")
    inv_items = cursor.fetchall()
    critical_items = [i for i in inv_items if i["current_stock"] <= i["min_stock"] or i["freshness_status"] == "muddati_yaqin"]

    # 4. Menyu
    cursor.execute("SELECT * FROM menu_items ORDER BY category ASC")
    menu_items = cursor.fetchall()

    # 5. Jihozlar
    cursor.execute("SELECT * FROM equipment")
    equipment_items = cursor.fetchall()
    broken_eq = [e for e in equipment_items if e["condition"] != "yaroqli"]

    # 6. Oylik hisobi
    cursor.execute("""
        SELECT s.name, s.role, s.hourly_rate,
               COALESCE(SUM(a.total_hours), 0) as total_h,
               COALESCE(SUM(a.total_hours * s.hourly_rate), 0) as earned,
               COALESCE(SUM(a.penalty_amount), 0) as pen
        FROM staff s LEFT JOIN attendance a ON s.id = a.staff_id
        WHERE s.status = 'active'
        GROUP BY s.id
    """)
    pay_rows = cursor.fetchall()
    total_payroll = sum(r["earned"] - r["pen"] for r in pay_rows)

    # ----------------------------------------------------
    # TABIIY SAVOLLAR VA MEHMON / ISHCHI INTENTLARI
    # ----------------------------------------------------

    # Salomlashish va umumiy murojaat
    if any(k in p for k in ["salom", "assalom", "privet", "hello", "qalaysan", "ishlar", "qalesiz"]):
        return (
            "Assalomu alaykum! Xush kelibsiz! Men **ShokhAI** — Shokh Restaurant ning shaxsiy aqlli yordamchisiman. 👑\n\n"
            "Sizga qanday yordam bera olaman?\n"
            "• 🍽️ **Mehmonlar uchun:** Mazali taomlar, souslar tavsiyasi va ish vaqtimiz.\n"
            "• 👨‍🍳 **Xodimlar uchun:** Smena tartibi, davomat, ish haqi va qoidalar.\n"
            "• 💼 **Boshqaruv uchun:** Ombor qoldiqlari, oyliklar, jarimalar va jihozlar nazorati.\n\n"
            "Marhamat, savolingizni bering!"
        )

    # Mehmon tavsiyalari / Nima yesam bo'ladi / Tavsiya
    if any(k in p for k in ["tavsiya", "nima yesam", "maslahat", "eng mazali", "qaysi ovqat", "zo'r"]):
        text = "👑 **Shokh Restaurant — Bosh oshpazimizdan maxsus tavsiyalar:**\n\n"
        hot_items = [m for m in menu_items if "issiq" in m["category"].lower() or "go'sht" in m["name"].lower() or "tovuq" in m["name"].lower()]
        for m in (hot_items[:3] if hot_items else menu_items[:3]):
            text += f"🔥 **{m['name']}** — {int(m['price']):,} so'm\n   _{m['recipe_notes'] or 'Yangi masalliqlardan tayyorlanadi'}_\n"
        text += "\n🍅 **Maxsus souslar:** Albatta 'Shokh Maxsus Qizil Sous' yoki sarimsoqli oq sous bilan tatib ko'rishni tavsiya qilamiz!"
        return text

    # Menyu va narxlar
    if any(k in p for k in ["menyu", "ovqat", "taom", "sous", "narx", "qancha turadi", "ichimlik"]):
        text = "📋 **Shokh Restaurant — Taomlar va Souslar Menyusi:**\n\n"
        cats = {}
        for m in menu_items:
            cats.setdefault(m["category"], []).append(m)
        for cat, items in cats.items():
            text += f"**{cat}:**\n"
            for item in items:
                text += f"• {item['name']} — **{int(item['price']):,} so'm** (~{item['prep_time_minutes']} daq)\n"
            text += "\n"
        return text

    # Ish vaqti va manzili
    if any(k in p for k in ["ish vaqti", "soat nechada", "ochiq", "yopiq", "qachongacha", "grafik"]):
        return (
            "⏰ **Shokh Restaurant ish grafigi:**\n\n"
            "• **Restoran ish vaqti:** 10:00 dan 23:00 gacha har kuni.\n"
            "• **1-smena:** 09:00 dan 19:00 gacha (tayyorgarlik bilan)\n"
            "• **2-smena:** 13:00 dan 23:00 gacha\n\n"
            "Har doim issiq va toza taomlar bilan xizmatingizdamiz!"
        )

    # Davomat / Kim ishda / Kelganlar
    if any(k in p for k in ["kim ishda", "kimlar keldi", "davomat", "ishlayapti", "smena"]):
        text = f"⏱️ **Hozirgi smena davomati holati:**\n\n"
        text += f"🟢 **Ayni damda oshxonada / zalda ishlayotganlar ({len(active_workers)} nafar):**\n"
        if active_workers:
            for w in active_workers:
                t = w["clock_in"].split()[1][:5] if " " in w["clock_in"] else w["clock_in"]
                late_txt = f" (⚠️ {w['late_minutes']} daq. kechikkan)" if w["is_late"] else ""
                text += f"• **{w['name']}** — {w['role']} (Kelgan: {t}){late_txt}\n"
        else:
            text += "_Hozircha hech kim kirdi-chiqdi qilmagan._\n"

        if absent_workers:
            text += f"\n⚪ **Damda yoki keyingi smenada ({len(absent_workers)} nafar):**\n"
            for a in absent_workers[:6]:
                text += f"• {a['name']} ({a['role']})\n"
        return text

    # Jarimalar va kechikish qoidalari
    if any(k in p for k in ["jarima", "kechik", "shtraf", "jazo", "intizom"]):
        text = (
            "⚖️ **Restoran Intizom va Jarima Qoidalari:**\n\n"
            "• Smenaga kech qolish yoki sababsiz chiqmaslik uchun jarima: **20 000 so'mdan 200 000 so'mgacha**.\n"
            "• Kelish vaqti avtomatik PIN kiosk orqali qayd etiladi va kechiksa @shokh0502 ga Telegram xabar boradi.\n\n"
        )
        if penalties:
            text += "🔴 **Yaqinda qayd etilgan jarimalar:**\n"
            for pen in penalties:
                text += f"• {pen['staff_name']} ({pen['staff_role']}): **{int(pen['penalty_amount']):,} so'm** — {pen['penalty_reason'] or 'Kechikish'}\n"
        else:
            text += "✅ Hozirda jarimalar yo'q, xodimlar intizomi a'lo darajada!"
        return text

    # Oylik va ish haqi / soatbay stavkalar
    if any(k in p for k in ["oylik", "maosh", "stavka", "soatbay", "zarplata", "qancha oladi", "ish haqi"]):
        text = (
            "💰 **Shokh Restaurant — Soatbay Stavka va Oyliklar:**\n\n"
            "👑 **Lavozimlar iyerarxiyasi:**\n"
            "1. Direktor — 35 000 so'm/soat\n"
            "2. Menejer — 28 000 so'm/soat\n"
            "3. Lider (2-pozitsiya) — 22 000 so'm/soat\n"
            "4. Lider (1-pozitsiya) — 20 000 so'm/soat\n"
            "5. Universal — 18 000 so'm/soat\n"
            "6. Povur (Oshpaz) — 17 000 so'm/soat\n"
            "7. Stajor — 15 000 so'm/soat\n"
            "8. Tozalik xodimasi — 15 000 so'm/soat\n\n"
            f"💵 **Hisoblangan jami ish haqi fondi:** **{int(total_payroll):,} so'm**"
        )
        return text

    # Ombor, tovarlar, yaroqlilik muddati
    if any(k in p for k in ["ombor", "tovar", "go'sht", "gosht", "sabzavot", "muddat", "yaroqli", "tugayabdi", "kam"]):
        text = "🥩 **Ombor zaxirasi va Yaroqlilik nazorati:**\n\n"
        if critical_items:
            text += "⚠️ **Zudlik bilan e'tibor talab qiluvchi mahsulotlar:**\n"
            for it in critical_items:
                reason = "🔴 Kam qolgan" if it["current_stock"] <= it["min_stock"] else "🟡 Muddati yaqin"
                text += f"• **{it['name']}** — Qoldiq: {it['current_stock']} {it['unit']} (Muddati: {it['expiry_date']}) ➔ {reason}\n"
            text += "\n💡 *Maslahat: Go'sht va souslar sifatini har smenada almashtirish paytida liderlar tekshirishi shart.*"
        else:
            text += "✅ Barcha go'sht, sous va sabzavotlar yetarli va to'liq yaroqli holatda!"
        return text

    # Jihozlar va uskunalar
    if any(k in p for k in ["jihoz", "uskuna", "pech", "fityur", "xolodilnik", "muzlatgich", "buzilgan", "remont"]):
        text = "🔧 **Jihozlar va Texnikalar Holati:**\n\n"
        if broken_eq:
            text += "⚠️ **Ta'mir talab yoki nazoratdagi uskunalar:**\n"
            for b in broken_eq:
                text += f"• **{b['name']}** ({b['location']}) — {b['notes'] or 'Tekshirish kerak'}\n"
        else:
            text += "✅ Barcha pechlar, fityur va muzlatgichlar soz holatda ishlamoqda!\n"
        return text

    # Umumiy savol yoki noaniq bo'lsa mantiqiy erkin javob
    return (
        f"👑 **ShokhAI javobi:**\n\n"
        f"\"{prompt}\" bo'yicha ma'lumot:\n"
        f"Restoranda hozir **{len(active_workers)} nafar xodim** ishlamoqda. "
        f"Menyuda **{len(menu_items)} xil** taom va souslar bor. "
        f"Omborda {len(critical_items)} ta mahsulot alohida nazoratda.\n\n"
        f"Aniqroq ma'lumot olish uchun quyidagilarni so'rashingiz mumkin:\n"
        f"👉 *'Bugun kimlar ishda?'*, *'Mazali nima bor?'*, *'Kechikishlar bormi?'*, *'Oyliklar qancha?'*, *'Ombor holati'*."
    )
