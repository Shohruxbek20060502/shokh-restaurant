"""
Shokh Restaurant Backend HTTP & REST API Server.
Customized for Shokh Restaurant:
- 2 Shifts (09:00 - 19:00, 13:00 - 23:00)
- Hourly hierarchy rates
- Penalties (20,000 - 200,000 UZS)
- Menu & Semi-finished items
- Equipment & Asset tracking
"""
import os
import sys
import json
import sqlite3
import mimetypes
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Internal modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import get_db, init_db
from ai_assistant import query_resto_ai
from telegram_bot import handle_telegram_message

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

class ShokhHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        response_bytes = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def get_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length)
            return json.loads(body.decode("utf-8"))
        return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # ------------------ API Endpoints ------------------
        if path.startswith("/api/"):
            db = get_db()
            cursor = db.cursor()

            # 1. Summary Stats
            if path == "/api/stats":
                cursor.execute("SELECT COUNT(*) as active_now FROM attendance WHERE clock_out IS NULL")
                active_now = cursor.fetchone()["active_now"]

                cursor.execute("SELECT COUNT(*) as total_staff FROM staff WHERE status = 'active'")
                total_staff = cursor.fetchone()["total_staff"]

                cursor.execute("SELECT COUNT(*) as low_count FROM inventory WHERE current_stock <= min_stock OR freshness_status = 'muddati_yaqin'")
                low_stock_count = cursor.fetchone()["low_count"]

                cursor.execute("SELECT SUM(current_stock * unit_price) as val FROM inventory")
                inv_val = cursor.fetchone()["val"] or 0

                cursor.execute("SELECT COALESCE(SUM(total_hours), 0) as total_h FROM attendance WHERE clock_in >= date('now', 'start of day')")
                today_hours = cursor.fetchone()["total_h"]

                cursor.execute("""
                    SELECT COALESCE(SUM(a.total_hours * s.hourly_rate), 0) as total_payroll,
                           COALESCE(SUM(a.penalty_amount), 0) as total_penalties
                    FROM attendance a
                    JOIN staff s ON a.staff_id = s.id
                """)
                pay_row = cursor.fetchone()
                total_payroll = pay_row["total_payroll"] - pay_row["total_penalties"]

                cursor.execute("SELECT COUNT(*) as broken FROM equipment WHERE condition != 'yaroqli'")
                broken_eq = cursor.fetchone()["broken"]

                db.close()
                return self.send_json({
                    "active_staff_now": active_now,
                    "total_staff": total_staff,
                    "low_stock_count": low_stock_count,
                    "inventory_value": inv_val,
                    "today_hours": round(today_hours, 1),
                    "total_payroll_est": total_payroll,
                    "total_penalties": pay_row["total_penalties"],
                    "broken_equipment_count": broken_eq,
                    "shifts": {
                        "restaurant_hours": "10:00 - 23:00",
                        "shift_1": "09:00 - 19:00 (1-smena)",
                        "shift_2": "13:00 - 23:00 (2-smena)"
                    }
                })

            # 2. Staff List
            elif path == "/api/staff":
                cursor.execute("""
                    SELECT s.*, 
                           (SELECT COUNT(*) FROM attendance a WHERE a.staff_id = s.id AND a.clock_out IS NULL) as is_working,
                           (SELECT a.clock_in FROM attendance a WHERE a.staff_id = s.id AND a.clock_out IS NULL ORDER BY a.id DESC LIMIT 1) as current_clock_in
                    FROM staff s
                    ORDER BY s.hourly_rate DESC, s.name ASC
                """)
                staff_list = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(staff_list)

            # 3. Attendance Records
            elif path == "/api/attendance":
                cursor.execute("""
                    SELECT a.*, s.name as staff_name, s.role as staff_role, s.hourly_rate
                    FROM attendance a
                    JOIN staff s ON a.staff_id = s.id
                    ORDER BY a.clock_in DESC
                    LIMIT 100
                """)
                records = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(records)

            # 4. Payroll calculation
            elif path == "/api/payroll":
                cursor.execute("""
                    SELECT s.id as staff_id, s.name, s.role, s.hourly_rate,
                           COALESCE(SUM(a.total_hours), 0) as total_hours,
                           COALESCE(SUM(a.total_hours * s.hourly_rate), 0) as earned_amount,
                           COALESCE(SUM(a.penalty_amount), 0) as penalty
                    FROM staff s
                    LEFT JOIN attendance a ON s.id = a.staff_id
                    WHERE s.status = 'active'
                    GROUP BY s.id
                    ORDER BY s.hourly_rate DESC, s.name ASC
                """)
                payroll_list = []
                for row in cursor.fetchall():
                    item = dict(row)
                    item["total_hours"] = round(item["total_hours"], 2)
                    item["earned_amount"] = round(item["earned_amount"], 0)
                    item["net_payable"] = round(item["earned_amount"] - item["penalty"], 0)
                    payroll_list.append(item)
                db.close()
                return self.send_json(payroll_list)

            # 5. Inventory
            elif path == "/api/inventory":
                cursor.execute("SELECT * FROM inventory ORDER BY category ASC, current_stock ASC")
                items = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(items)

            # 6. Menu / Recipes (Issiq ovqatlar va souslar)
            elif path == "/api/menu":
                cursor.execute("SELECT * FROM menu_items ORDER BY category ASC, price DESC")
                items = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(items)

            # 7. Equipment / Assets (Jihozlar va Inventarlar)
            elif path == "/api/equipment":
                cursor.execute("SELECT * FROM equipment ORDER BY condition DESC, name ASC")
                items = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(items)

            # 8. Inventory Transactions
            elif path == "/api/transactions":
                cursor.execute("""
                    SELECT t.*, p.name as product_name, p.unit
                    FROM inventory_transactions t
                    JOIN inventory p ON t.product_id = p.id
                    ORDER BY t.created_at DESC
                    LIMIT 100
                """)
                transactions = [dict(row) for row in cursor.fetchall()]
                db.close()
                return self.send_json(transactions)

            # 9. Settings
            elif path == "/api/settings":
                cursor.execute("SELECT key, value FROM settings")
                settings_map = {row["key"]: row["value"] for row in cursor.fetchall()}
                db.close()
                return self.send_json(settings_map)

            db.close()
            return self.send_json({"error": "Endpoint not found"}, status=404)

        # ------------------ Static Frontend Files ------------------
        if path == "/" or path == "":
            filepath = os.path.join(FRONTEND_DIR, "index.html")
        else:
            rel_path = path.lstrip("/")
            filepath = os.path.join(FRONTEND_DIR, rel_path)

        if os.path.exists(filepath) and os.path.isfile(filepath):
            mime_type, _ = mimetypes.guess_type(filepath)
            if not mime_type:
                mime_type = "text/plain"
            if mime_type.startswith("text/") or mime_type in ["application/javascript", "application/json"]:
                mime_type += "; charset=utf-8"

            with open(filepath, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.get_json_body()

        db = get_db()
        cursor = db.cursor()

        # 1. Staff Clock-In with Shift detection & Late calculation
        if path == "/api/attendance/clock-in":
            staff_id = body.get("staff_id")
            pin = body.get("pin_code")

            if pin:
                cursor.execute("SELECT id, name, shift_preference FROM staff WHERE pin_code = ? AND status = 'active'", (pin,))
                staff = cursor.fetchone()
                if not staff:
                    db.close()
                    return self.send_json({"success": False, "error": "Noto'g'ri PIN-kod!"}, status=400)
                staff_id = staff["id"]
                shift_pref = staff["shift_preference"]
            else:
                cursor.execute("SELECT name, shift_preference FROM staff WHERE id = ?", (staff_id,))
                st = cursor.fetchone()
                staff_name = st["name"]
                shift_pref = st["shift_preference"]

            cursor.execute("SELECT * FROM attendance WHERE staff_id = ? AND clock_out IS NULL", (staff_id,))
            if cursor.fetchone():
                db.close()
                return self.send_json({"success": False, "error": "Bu xodim allaqachon ishda!"}, status=400)

            now = datetime.now()
            now_str = now.strftime("%Y-%m-%d %H:%M:%S")

            # Determine Shift: 1-smena starts at 09:00, 2-smena starts at 13:00
            current_hour = now.hour + now.minute / 60.0
            if "2-smena" in shift_pref or current_hour >= 12.0:
                shift_name = "2-smena (13:00 - 23:00)"
                target_start = now.replace(hour=13, minute=0, second=0)
            else:
                shift_name = "1-smena (09:00 - 19:00)"
                target_start = now.replace(hour=9, minute=0, second=0)

            is_late = 0
            late_minutes = 0
            penalty = 0
            reason = None

            if now > target_start + timedelta(minutes=5): # 5 min grace period
                is_late = 1
                late_minutes = int((now - target_start).total_seconds() / 60)
                # Penalty policy: 20,000 UZS base penalty
                penalty = 20000
                reason = f"{late_minutes} daqiqa kechikish ({shift_name})"

            cursor.execute("""
                INSERT INTO attendance (staff_id, shift_name, clock_in, is_late, late_minutes, penalty_amount, penalty_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (staff_id, shift_name, now_str, is_late, late_minutes, penalty, reason))
            db.commit()

            cursor.execute("SELECT name FROM staff WHERE id = ?", (staff_id,))
            staff_name = cursor.fetchone()["name"]
            db.close()

            late_msg = f" (Diqqat: {late_minutes} daqiqa kechikdi. Jarima: {penalty:,.0f} so'm)" if is_late else ""
            return self.send_json({
                "success": True,
                "message": f"{staff_name} {shift_name}ga ishga keldi deb belgilandi!{late_msg}",
                "clock_in": now_str,
                "is_late": is_late,
                "late_minutes": late_minutes
            })

        # 2. Staff Clock-Out
        elif path == "/api/attendance/clock-out":
            staff_id = body.get("staff_id")
            pin = body.get("pin_code")

            if pin:
                cursor.execute("SELECT id, name, hourly_rate FROM staff WHERE pin_code = ? AND status = 'active'", (pin,))
                staff = cursor.fetchone()
                if not staff:
                    db.close()
                    return self.send_json({"success": False, "error": "Noto'g'ri PIN-kod!"}, status=400)
                staff_id = staff["id"]
                rate = staff["hourly_rate"]
            else:
                cursor.execute("SELECT hourly_rate, name FROM staff WHERE id = ?", (staff_id,))
                staff = cursor.fetchone()
                rate = staff["hourly_rate"]

            cursor.execute("SELECT * FROM attendance WHERE staff_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1", (staff_id,))
            active = cursor.fetchone()
            if not active:
                db.close()
                return self.send_json({"success": False, "error": "Xodim ishda emas yoki allaqachon ketgan!"}, status=400)

            now = datetime.now()
            clock_in_dt = datetime.strptime(active["clock_in"], "%Y-%m-%d %H:%M:%S")
            diff_hours = round(max((now - clock_in_dt).total_seconds() / 3600.0, 0.1), 2)
            earned = round(diff_hours * rate, 0)

            cursor.execute("""
                UPDATE attendance 
                SET clock_out = ?, total_hours = ? 
                WHERE id = ?
            """, (now.strftime("%Y-%m-%d %H:%M:%S"), diff_hours, active["id"]))
            db.commit()
            db.close()
            return self.send_json({
                "success": True, 
                "message": f"{staff['name']} smenani yakunladi!",
                "hours_worked": diff_hours,
                "earned": earned
            })

        # 3. Apply Penalty (Jarima qo'llash: 20k - 200k)
        elif path == "/api/attendance/penalty":
            attendance_id = body.get("attendance_id")
            penalty_amount = float(body.get("penalty_amount", 20000))
            reason = body.get("reason", "Sababsiz kechikish yoki tartib buzilishi")

            if penalty_amount < 20000 or penalty_amount > 200000:
                db.close()
                return self.send_json({"success": False, "error": "Jarima miqdori 20 000 dan 200 000 so'mgacha bo'lishi kerak!"}, status=400)

            cursor.execute("""
                UPDATE attendance 
                SET penalty_amount = ?, penalty_reason = ? 
                WHERE id = ?
            """, (penalty_amount, reason, attendance_id))
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": f"{penalty_amount:,.0f} so'm jarima belgilandi!"})

        # 4. Add Staff
        elif path == "/api/staff":
            name = body.get("name")
            role = body.get("role")
            phone = body.get("phone", "")
            pin = body.get("pin_code", "")
            rate = float(body.get("hourly_rate", 15000))
            shift_pref = body.get("shift_preference", "1-smena (09:00 - 19:00)")

            if not name or not role:
                db.close()
                return self.send_json({"success": False, "error": "Ism va lavozim kiritilishi shart!"}, status=400)

            try:
                cursor.execute(
                    "INSERT INTO staff (name, role, phone, pin_code, hourly_rate, shift_preference) VALUES (?, ?, ?, ?, ?, ?)",
                    (name, role, phone, pin, rate, shift_pref)
                )
                db.commit()
                new_id = cursor.lastrowid
                db.close()
                return self.send_json({"success": True, "id": new_id, "message": "Yangi xodim qo'shildi!"})
            except sqlite3.IntegrityError:
                db.close()
                return self.send_json({"success": False, "error": "Bu PIN-kod allaqachon boshqa xodimga berilgan!"}, status=400)

        # 5. Add Menu Item (Issiq taomlar va souslar)
        elif path == "/api/menu":
            name = body.get("name")
            category = body.get("category", "Yarim tayyor issiq ovqatlar")
            price = float(body.get("price", 0))
            prep_time = int(body.get("prep_time_minutes", 15))
            recipe = body.get("recipe_notes", "")

            cursor.execute(
                "INSERT INTO menu_items (name, category, price, prep_time_minutes, recipe_notes) VALUES (?, ?, ?, ?, ?)",
                (name, category, price, prep_time, recipe)
            )
            db.commit()
            new_id = cursor.lastrowid
            db.close()
            return self.send_json({"success": True, "id": new_id, "message": "Yangi taom/sous menyuga qo'shildi!"})

        # 6. Add/Update Equipment
        elif path == "/api/equipment":
            name = body.get("name")
            category = body.get("category", "Oshxona texnikasi")
            condition = body.get("condition", "yaroqli")
            location = body.get("location", "Asosiy oshxona")
            notes = body.get("notes", "")
            today_str = datetime.now().strftime("%Y-%m-%d")

            cursor.execute(
                "INSERT INTO equipment (name, category, condition, location, last_inspected, notes) VALUES (?, ?, ?, ?, ?, ?)",
                (name, category, condition, location, today_str, notes)
            )
            db.commit()
            new_id = cursor.lastrowid
            db.close()
            return self.send_json({"success": True, "id": new_id, "message": "Jihoz/uskuna ro'yxatga olindi!"})

        # 7. Add Inventory Product
        elif path == "/api/inventory":
            name = body.get("name")
            category = body.get("category", "Go'sht mahsulotlari")
            unit = body.get("unit", "kg")
            stock = float(body.get("current_stock", 0))
            min_stock = float(body.get("min_stock", 5))
            price = float(body.get("unit_price", 0))
            expiry = body.get("expiry_date", (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d"))

            cursor.execute("""
                INSERT INTO inventory (name, category, unit, current_stock, min_stock, unit_price, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (name, category, unit, stock, min_stock, price, expiry))
            db.commit()
            new_id = cursor.lastrowid
            db.close()
            return self.send_json({"success": True, "id": new_id, "message": "Mahsulot omborga kiritildi!"})

        # 8. Inventory Transaction
        elif path == "/api/inventory/transaction":
            product_id = int(body.get("product_id"))
            trans_type = body.get("type")
            quantity = float(body.get("quantity", 0))
            reason = body.get("reason", "")

            cursor.execute("SELECT * FROM inventory WHERE id = ?", (product_id,))
            product = cursor.fetchone()
            if not product:
                db.close()
                return self.send_json({"success": False, "error": "Mahsulot topilmadi!"}, status=404)

            current_stock = product["current_stock"]
            unit_price = product["unit_price"]

            if trans_type == "chiqim":
                if current_stock < quantity:
                    db.close()
                    return self.send_json({"success": False, "error": f"Omborda yetarli mahsulot yo'q! (Mavjud: {current_stock} {product['unit']})"}, status=400)
                new_stock = current_stock - quantity
            else:
                new_stock = current_stock + quantity

            total_cost = quantity * unit_price

            cursor.execute("""
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_price, total_cost, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (product_id, trans_type, quantity, unit_price, total_cost, reason))

            cursor.execute("UPDATE inventory SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_stock, product_id))
            db.commit()
            db.close()

            action_uz = "Kirim qilindi" if trans_type == "kirim" else "Chiqim qilindi"
            return self.send_json({
                "success": True,
                "message": f"{product['name']} uchun {quantity} {product['unit']} {action_uz}. Yangi qoldiq: {new_stock} {product['unit']}.",
                "new_stock": new_stock
            })

        # 9. AI Assistant Query
        elif path == "/api/ai/chat":
            prompt = body.get("prompt", "")
            if not prompt:
                db.close()
                return self.send_json({"error": "Prompt bo'sh bo'lmasligi kerak"}, status=400)
            
            ai_reply = query_resto_ai(prompt, db)
            db.close()
            return self.send_json({"reply": ai_reply})

        # 10. Telegram Bot Simulator
        elif path == "/api/bot/simulate":
            message_text = body.get("message", "")
            user_name = body.get("user_name", "Bobur Mirzayev")
            bot_reply = handle_telegram_message(message_text, user_name, db)
            db.close()
            return self.send_json({"reply": bot_reply})

        # 11. Reset Database to Clean Slate (Toza varaqdan boshlash)
        elif path == "/api/database/reset":
            cursor.execute("DELETE FROM attendance")
            cursor.execute("DELETE FROM inventory_transactions")
            cursor.execute("DELETE FROM payroll")
            cursor.execute("DELETE FROM staff")
            cursor.execute("DELETE FROM inventory")
            cursor.execute("DELETE FROM menu_items")
            cursor.execute("DELETE FROM equipment")
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": "Barcha test ma'lumotlari tozalandi! Tizim noldan toza holatda tayyor."})

        # 12. Delete item endpoints
        elif path == "/api/staff/delete":
            staff_id = body.get("id")
            cursor.execute("DELETE FROM attendance WHERE staff_id = ?", (staff_id,))
            cursor.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": "Xodim o'chirildi!"})

        elif path == "/api/inventory/delete":
            prod_id = body.get("id")
            cursor.execute("DELETE FROM inventory_transactions WHERE product_id = ?", (prod_id,))
            cursor.execute("DELETE FROM inventory WHERE id = ?", (prod_id,))
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": "Mahsulot o'chirildi!"})

        elif path == "/api/menu/delete":
            menu_id = body.get("id")
            cursor.execute("DELETE FROM menu_items WHERE id = ?", (menu_id,))
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": "Taom menyudan o'chirildi!"})

        elif path == "/api/equipment/delete":
            eq_id = body.get("id")
            cursor.execute("DELETE FROM equipment WHERE id = ?", (eq_id,))
            db.commit()
            db.close()
            return self.send_json({"success": True, "message": "Jihoz o'chirildi!"})

        db.close()
        return self.send_json({"error": "Endpoint not found"}, status=404)

def run_server(port=8080):
    init_db()
    server_address = ("0.0.0.0", port)
    httpd = ThreadingHTTPServer(server_address, ShokhHandler)
    print(f"👑 Shokh Restaurant Server running at http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8080))
    run_server(port)
