"""
ShokhAI - Intelligent Operations Analyst for Shokh Restaurant.
Deeply customized to the operational strategy:
- 2 Shifts: 1-smena (09:00-19:00), 2-smena (13:00-23:00)
- Hourly hierarchy: Stajor 15k, Povur 17k, Universal 18k, Lider-1 20k, Lider-2 22k, Menejer 28k, Direktor 35k, Tozalik 15k
- Penalty tracker: 20k - 200k UZS
- Expiry & Freshness checker (Go'sht, sabzavotlar, souslar)
- Equipment & Asset condition status
"""
import sqlite3
from datetime import datetime

def query_resto_ai(prompt: str, db_conn) -> str:
    cursor = db_conn.cursor()
    prompt_lower = prompt.lower().strip()

    # 1. Staff & active attendance
    cursor.execute("""
        SELECT s.id, s.name, s.role, s.hourly_rate, s.shift_preference,
               a.clock_in, a.shift_name, a.is_late, a.late_minutes, a.penalty_amount, a.penalty_reason
        FROM staff s
        LEFT JOIN attendance a ON s.id = a.staff_id AND a.clock_out IS NULL
        WHERE s.status = 'active'
        ORDER BY s.hourly_rate DESC
    """)
    active_staff = cursor.fetchall()
    active_count = sum(1 for row in active_staff if row["clock_in"] is not None)
    total_staff = len(active_staff)

    # 2. Late arrivals & penalties today
    cursor.execute("""
        SELECT a.*, s.name as staff_name, s.role as staff_role
        FROM attendance a
        JOIN staff s ON a.staff_id = s.id
        WHERE a.is_late = 1 OR a.penalty_amount > 0
        ORDER BY a.clock_in DESC
    """)
    penalties_list = cursor.fetchall()

    # 3. Low stock and expiring items
    cursor.execute("""
        SELECT name, category, current_stock, min_stock, unit, unit_price, expiry_date, freshness_status
        FROM inventory
        WHERE current_stock <= min_stock OR freshness_status = 'muddati_yaqin'
        ORDER BY current_stock ASC
    """)
    critical_items = cursor.fetchall()

    # 4. Equipment condition
    cursor.execute("""
        SELECT name, category, condition, location, notes
        FROM equipment
        WHERE condition != 'yaroqli'
    """)
    broken_equipment = cursor.fetchall()

    # 5. Total payroll & hours
    cursor.execute("""
        SELECT s.name, s.role, s.hourly_rate,
               COALESCE(SUM(a.total_hours), 0) as total_h,
               COALESCE(SUM(a.total_hours * s.hourly_rate), 0) as earned,
               COALESCE(SUM(a.penalty_amount), 0) as total_penalties
        FROM staff s
        LEFT JOIN attendance a ON s.id = a.staff_id
        GROUP BY s.id
        ORDER BY s.hourly_rate DESC
    """)
    payroll_stats = cursor.fetchall()
    total_payroll_est = sum(row["earned"] - row["total_penalties"] for row in payroll_stats)

    # 6. Inventory Turnover
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'kirim' THEN total_cost ELSE 0 END), 0) as total_in,
            COALESCE(SUM(CASE WHEN type = 'chiqim' THEN total_cost ELSE 0 END), 0) as total_out
        FROM inventory_transactions
    """)
    trans = cursor.fetchone()
    total_in = trans["total_in"] or 0
    total_out = trans["total_out"] or 0

    # INTENT 1: Attendance / Shifts / Who is working
    if any(k in prompt_lower for k in ["kim", "ishda", "keldi", "davomat", "smena", "кто на работе", "явка"]):
        response = f"👑 **Shokh Restaurant — Jonli Davomat va Smena:**\n\n"
        response += f"Jami xodimlar: **{total_staff} nafar** | Hozir ishda: **{active_count} nafar** (1-smena: 09:00 - 19:00)\n\n"
        response += "🟢 **Ayni paytda ishlayotganlar:**\n"
        for row in active_staff:
            if row["clock_in"]:
                c_in = row["clock_in"].split()[1][:5] if " " in row["clock_in"] else row["clock_in"]
                late_txt = f" ⚠️ *({row['late_minutes']} daq. kechikkan, Jarima: {row['penalty_amount']:,.0f} so'm)*" if row["is_late"] else ""
                response += f"- **{row['name']}** ({row['role']}) — Soat {c_in} da kelgan{late_txt}\n"
        
        absent = [row for row in active_staff if not row["clock_in"]]
        if absent:
            response += f"\n⚪ **Keyingi smenaga (2-smena 13:00-23:00) yoki damda:**\n"
            for row in absent:
                response += f"- {row['name']} ({row['role']} — {row['shift_preference']})\n"
        return response

    # INTENT 2: Penalties / Late arrivals (Jarima va kechikishlar)
    elif any(k in prompt_lower for k in ["jarima", "kechik", "kech qol", "shtraf", "penalty"]):
        if not penalties_list:
            return "✅ **Hozircha hech qanday jarima yoki kechikishlar qayd etilmagan!** Intizom 100% a'lo."
        
        total_pen = sum(p["penalty_amount"] for p in penalties_list)
        response = f"⚠️ **Shokh Restaurant — Kechikishlar va Jarimalar hisoboti:**\n\n"
        response += f"Strategiya bo'yicha belgilangan jarima: **20 000 dan 200 000 so'mgacha**.\n"
        response += f"Jami qo'llanilgan jarimalar: **{total_pen:,.0f} so'm**.\n\n"
        for p in penalties_list:
            response += f"- 🔴 **{p['staff_name']}** ({p['staff_role']}): **{p['penalty_amount']:,.0f} so'm** — {p['penalty_reason'] or 'Sababsiz kechikish'} ({p['clock_in']})\n"
        return response

    # INTENT 3: Equipment & Assets (Jihozlar va Inventarlar)
    elif any(k in prompt_lower for k in ["jihoz", "inventar", "uskuna", "pech", "texnika", "оборудование"]):
        cursor.execute("SELECT * FROM equipment ORDER BY condition DESC")
        eq_all = cursor.fetchall()
        response = f"🔧 **Shokh Restaurant — Jihozlar va Inventarlar holati:**\n\n"
        for eq in eq_all:
            icon = "🟢" if eq["condition"] == "yaroqli" else "🟡" if eq["condition"] == "tamir_talab" else "🔴"
            status_uz = "Ishga to'liq yaroqli" if eq["condition"] == "yaroqli" else "Ta'mir talab qiladi"
            response += f"- {icon} **{eq['name']}** ({eq['location']}): {status_uz}. *{eq['notes']}*\n"
        return response

    # INTENT 4: Food Expiry, Freshness & Warehouse (Yaroqlilik muddati va Tovar)
    elif any(k in prompt_lower for k in ["tovar", "ombor", "yaroqlilik", "muddati", "gosht", "go'sht", "sabzavot", "sous", "kam", "tugayapti"]):
        response = f"🥩 **Shokh Restaurant — Mahsulotlar sifati va Ombor nazorati:**\n\n"
        if critical_items:
            response += "⚠️ **Kritik holatdagi yoki muddati yaqinlashgan mahsulotlar:**\n"
            for item in critical_items:
                stat = "🟡 Muddati oz qolgan!" if item["freshness_status"] == "muddati_yaqin" else "🔴 Kam qolgan"
                response += f"- **{item['name']}** ({item['category']}): Qoldiq **{item['current_stock']} {item['unit']}** (Min: {item['min_stock']}). Yaroqlilik: {item['expiry_date']} ➔ {stat}\n"
        else:
            response += "✅ Barcha go'sht, sabzavot va souslar iste'molga to'liq yaroqli va yangi!\n"

        response += f"\n💡 **Sifat nazorati talabi:** Barcha chala-yarim tayyor go'sht va souslar har smena almashishida tekshiriladi."
        return response

    # INTENT 5: Menu, Semi-Finished Products & Sauces (Taomlar va Souslar)
    elif any(k in prompt_lower for k in ["ovqat", "taom", "menyu", "sous", "chala", "yarim tayyor", "menu", "блюда"]):
        cursor.execute("SELECT * FROM menu_items ORDER BY category ASC")
        menu_items = cursor.fetchall()
        response = f"🍽️ **Shokh Restaurant — Issiq taomlar, Yarim tayyor mahsulotlar va Souslar:**\n\n"
        for m in menu_items:
            response += f"- **{m['name']}** ({m['category']}): **{m['price']:,.0f} so'm** (~{m['prep_time_minutes']} daq.) — *{m['recipe_notes']}*\n"
        return response

    # INTENT 6: Payroll & Rates (Oylik va soatbay stavkalar)
    elif any(k in prompt_lower for k in ["oylik", "maosh", "stavka", "soatbay", "zarplata", "payroll"]):
        response = f"💰 **Shokh Restaurant — Soatbay Ish Haqi va Oyliklar:**\n\n"
        response += "📌 **Lavozimlar stavkasi:**\n"
        response += "• Direktor: 35,000 so'm/soat\n• Menejer: 28,000 so'm/soat\n• Lider (2-pozitsiya): 22,000 so'm/soat\n• Lider (1-pozitsiya): 20,000 so'm/soat\n• Universal: 18,000 so'm/soat\n• Povur: 17,000 so'm/soat\n• Stajor: 15,000 so'm/soat\n• Tozalik xodimasi: 15,000 so'm/soat\n\n"
        response += "💵 **Hisoblangan joriy oyliklar:**\n"
        for p in payroll_stats:
            net = p['earned'] - p['total_penalties']
            pen_str = f" *(Jarima: -{p['total_penalties']:,.0f} so'm)*" if p['total_penalties'] > 0 else ""
            response += f"- **{p['name']}** ({p['role']}): **{p['total_h']:.1f} soat** ➔ **{net:,.0f} so'm**{pen_str}\n"
        
        response += f"\n💎 **Jami to'lanishi kerak:** **{total_payroll_est:,.0f} so'm**."
        return response

    # INTENT 7: General Executive Report (Umumiy hisobot)
    elif any(k in prompt_lower for k in ["hisobot", "xulosa", "umumiy", "otchet"]):
        return f"""👑 **Shokh Restaurant — Umumiy Operatsion Hisobot:**

1. ⏰ **Ish tartibi:** 10:00 - 23:00 (1-smena: 09:00 - 19:00 | 2-smena: 13:00 - 23:00).
2. 👥 **Davomat:** {active_count}/{total_staff} xodim ayni paytda ishda. Kechikkanlar jarimasi: {sum(p['penalty_amount'] for p in penalties_list):,.0f} so'm.
3. 💰 **Ish haqi (Soatbay):** Hisoblangan joriy maoshlar fondi: **{total_payroll_est:,.0f} so'm**.
4. 🥩 **Sifat & Ombor:** {len(critical_items)} ta tovar alohida nazoratda (go'sht/sabzavot/souslar).
5. 🔧 **Jihozlar:** {len(broken_equipment)} ta uskuna (sovutgich) profilaktika talab qiladi.

💡 **ShokhAI Tavsiyasi:** 1-smena tugashiga 1 soat qolganda yarim tayyor go'sht va souslar qoldig'ini sanab, 2-smenaga topshirish lozim."""

    # Default fallback
    return (
        f"Assalomu alaykum! Men **ShokhAI** — Shokh Restaurant ning aqlli operatsion tahlilchisiman. 👑\n\n"
        f"Restoranning barcha strategik qoidalariga muvofiq quyidagilarni bilaman:\n"
        f"• *'Bugun kimlar ishda?'* — 1-smena va 2-smena davomati\n"
        f"• *'Kechikishlar va jarimalar'* — 20 000 - 200 000 so'mlik jarimalar hisoboti\n"
        f"• *'Oyliklar hisoboti'* — Stajor (15k), Povur (17k), Universal (18k), Lider (20-22k)... soatbay maoshlari\n"
        f"• *'Mahsulotlar va yaroqlilik'* — Go'sht, sabzavotlar, souslar zaxirasi va sifati\n"
        f"• *'Jihozlar holati'* — Pech, fityur, sovutgich va inventarlar ishga yaroqliligi\n"
        f"• *'Taomlar va menyu'* — Yarim tayyor issiq taomlar va souslar ro'yxati\n\n"
        f"Qaysi ma'lumotni tahlil qilib beray?"
    )
