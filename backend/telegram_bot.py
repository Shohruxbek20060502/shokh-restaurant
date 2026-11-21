"""
RestoControl Telegram Bot
Handles staff clock-in/out via Telegram, manager alerts,
and AI queries directly from Telegram.
Works with standard Python urllib or can be triggered via webhook / simulated.
"""
import json
import urllib.request
import urllib.parse
from datetime import datetime

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/{method}"

def handle_telegram_message(message_text: str, user_name: str, db_conn) -> str:
    """
    Core bot logic - processes incoming message from staff or manager.
    Can be used both for real Telegram webhook/polling and for Web Simulator.
    """
    from ai_assistant import query_resto_ai
    cursor = db_conn.cursor()
    text = message_text.strip()
    cmd = text.split()[0].lower() if text else ""

    if cmd in ["/start", "start", "salom"]:
        return (
            f"👑 **Shokh Restaurant** rasmiy botiga xush kelibsiz, {user_name}!\n\n"
            f"📌 **Mavjud buyruqlar:**\n"
            f"🟢 `/keldim [PIN]` — Ishga kelganingizni qayd etish (Masalan: `/keldim 1111`)\n"
            f"🔴 `/ketdim [PIN]` — Ishdan ketganingizni qayd etish (Masalan: `/ketdim 1111`)\n"
            f"📊 `/hisobot` — Menejer hisoboti (kimlar ishda, bugungi statistika)\n"
            f"📦 `/ombor` — Kam qolgan tovarlar ro'yxati\n"
            f"🤖 `/ai [savol]` — ShokhAI yordamchisiga savol berish (Masalan: `/ai oyliklar hisoboti`)\n"
        )

    elif cmd == "/keldim" or text.lower().startswith("keldim"):
        parts = text.split()
        if len(parts) < 2:
            return "⚠️ Iltimos, PIN-kodingizni kiriting.\nMasalan: `/keldim 1111`"
        pin = parts[1]
        cursor.execute("SELECT * FROM staff WHERE pin_code = ? AND status = 'active'", (pin,))
        staff = cursor.fetchone()
        if not staff:
            return "❌ Noto'g'ri PIN-kod yoki faol bo'lmagan xodim."

        # Check if already clocked in
        cursor.execute("SELECT * FROM attendance WHERE staff_id = ? AND clock_out IS NULL", (staff["id"],))
        active = cursor.fetchone()
        if active:
            return f"⚠️ Hurmatli {staff['name']}, siz allaqachon ishdasiz! (Kelgan vaqtingiz: {active['clock_in']})"

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("INSERT INTO attendance (staff_id, clock_in) VALUES (?, ?)", (staff["id"], now_str))
        db_conn.commit()
        return f"✅ **Xush kelibsiz, {staff['name']}!**\nIsh boshlash vaqti: {now_str}\nBarakali ish kuni tilaymiz!"

    elif cmd == "/ketdim" or text.lower().startswith("ketdim"):
        parts = text.split()
        if len(parts) < 2:
            return "⚠️ Iltimos, PIN-kodingizni kiriting.\nMasalan: `/ketdim 1111`"
        pin = parts[1]
        cursor.execute("SELECT * FROM staff WHERE pin_code = ? AND status = 'active'", (pin,))
        staff = cursor.fetchone()
        if not staff:
            return "❌ Noto'g'ri PIN-kod."

        cursor.execute("SELECT * FROM attendance WHERE staff_id = ? AND clock_out IS NULL", (staff["id"],))
        active = cursor.fetchone()
        if not active:
            return f"⚠️ Hurmatli {staff['name']}, siz hozirda ishga kelgan deb belgilanmagansiz."

        now = datetime.now()
        clock_in_dt = datetime.strptime(active["clock_in"], "%Y-%m-%d %H:%M:%S")
        hours_worked = round((now - clock_in_dt).total_seconds() / 3600.0, 2)
        earned = round(hours_worked * staff["hourly_rate"], 0)

        cursor.execute("""
            UPDATE attendance 
            SET clock_out = ?, total_hours = ? 
            WHERE id = ?
        """, (now.strftime("%Y-%m-%d %H:%M:%S"), hours_worked, active["id"]))
        db_conn.commit()

        return (
            f"👋 **Rahmat, {staff['name']}!**\n\n"
            f"⏱️ Bugungi ishlagan vaqtingiz: **{hours_worked} soat**\n"
            f"💰 Bugungi hisoblangan maosh: **{earned:,.0f} so'm**\n"
            f"Kuningiz xayrli o'tsin!"
        )

    elif cmd in ["/hisobot", "/status", "hisobot"]:
        return query_resto_ai("hisobot", db_conn)

    elif cmd in ["/ombor", "ombor", "tovar"]:
        return query_resto_ai("qaysi tovarlar tugayapti", db_conn)

    elif cmd == "/ai" or text.lower().startswith("ai "):
        question = text[3:].strip() if cmd == "/ai" else text[3:].strip()
        if not question:
            return "🤖 Savolingizni yozing. Masalan: `/ai kimlar ishda?`"
        return query_resto_ai(question, db_conn)

    else:
        # Default fallback to RestoAI
        return query_resto_ai(text, db_conn)

def send_telegram_message(token: str, chat_id: str, text: str):
    """Send text message to Telegram chat via API."""
    try:
        url = TELEGRAM_API_URL.format(token=token, method="sendMessage")
        data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}
