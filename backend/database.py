"""
Database management for Shokh Restaurant (SQLite3)
Customized for Shokh Restaurant's operational strategy:
- 2 Shifts: 1-smena (09:00 - 19:00), 2-smena (13:00 - 23:00)
- Hierarchy: Stajor (15k), Povur (17k), Universal (18k), Lider-1 (20k), Lider-2 (22k), Menejer (28k), Direktor (35k), Tozalik xodimasi (15k)
- Penalty system: 20,000 - 200,000 UZS
- Semi-finished hot foods, ingredients, sauces
- Expiry date tracking (yaroqlilik muddati)
- Equipment & Inventory status (Jihozlar yaroqliligi)
"""
import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resto.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(recreate=False):
    if recreate and os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass

    conn = get_db()
    cursor = conn.cursor()

    # 1. Staff table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL, -- Stajor, Povur, Universal, Lider (1-pozitsiya), Lider (2-pozitsiya), Menejer, Direktor, Tozalik xodimasi
        phone TEXT,
        pin_code TEXT UNIQUE,
        hourly_rate REAL DEFAULT 15000,
        shift_preference TEXT DEFAULT '1-smena (09:00 - 19:00)',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Attendance & Late penalties
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        shift_name TEXT DEFAULT '1-smena',
        clock_in TIMESTAMP NOT NULL,
        clock_out TIMESTAMP,
        total_hours REAL DEFAULT 0,
        is_late INTEGER DEFAULT 0, -- 1 if late
        late_minutes INTEGER DEFAULT 0,
        penalty_amount REAL DEFAULT 0, -- 20,000 to 200,000 UZS
        penalty_reason TEXT,
        notes TEXT,
        FOREIGN KEY (staff_id) REFERENCES staff (id)
    )
    """)

    # 3. Payroll / Payments & Penalties
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        period_month TEXT NOT NULL,
        hours_worked REAL DEFAULT 0,
        earned_amount REAL DEFAULT 0,
        bonus REAL DEFAULT 0,
        penalty REAL DEFAULT 0,
        advance_paid REAL DEFAULT 0,
        total_payable REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        paid_at TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff (id)
    )
    """)

    # 4. Inventory (Ingredients, Meat, Veggies, Sauces) + Expiry Date
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Go''sht mahsulotlari', 'Sabzavotlar', 'Souslar va ziravorlar', 'Yarim tayyor issiq mahsulotlar', 'Qadoq va xo''jalik'
        unit TEXT NOT NULL, -- kg, litr, dona, ports
        current_stock REAL DEFAULT 0,
        min_stock REAL DEFAULT 5,
        unit_price REAL DEFAULT 0,
        expiry_date DATE, -- Iste'molga yaroqlilik muddati
        freshness_status TEXT DEFAULT 'yaroqli', -- 'yaroqli', 'muddati_yaqin', 'yaroqsiz'
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Inventory Transactions (Kirim / Chiqim)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'kirim' or 'chiqim'
        quantity REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES inventory (id)
    )
    """)

    # 6. Menu / Recipes (Taomlar, Yarim tayyor issiq mahsulotlar va Souslar)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Yarim tayyor issiq ovqatlar', 'Souslar', 'Garnirlar', 'Ichimliklar'
        price REAL NOT NULL,
        prep_time_minutes INTEGER DEFAULT 15,
        recipe_notes TEXT,
        status TEXT DEFAULT 'available'
    )
    """)

    # 7. Equipment & Inventory Assets (Jihozlar va Inventarlar)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Oshxona texnikasi', 'Sovutish uskunalari', 'Idish-tovoqlar', 'Zal jihozlari'
        condition TEXT DEFAULT 'yaroqli', -- 'yaroqli', 'tamir_talab', 'yaroqsiz'
        location TEXT DEFAULT 'Asosiy oshxona',
        last_inspected DATE,
        notes TEXT
    )
    """)

    # 8. Shift Schedule (Haftalik jadval)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shift_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        date DATE NOT NULL,
        shift_number INTEGER DEFAULT 1,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff (id)
    )
    """)

    # 9. Restaurant Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    conn.commit()

    # Seed if staff is empty
    cursor.execute("SELECT COUNT(*) as count FROM staff")
    if cursor.fetchone()["count"] == 0:
        seed_shokh_data(cursor, conn)

    conn.close()

def seed_shokh_data(cursor, conn):
    # 1. Staff with exact roles & hourly rates
    staff_members = [
        # (Name, Role, Phone, PIN, Hourly Rate, Shift)
        ("Jahongir Qodirov", "Direktor", "+998 90 100 00 01", "1001", 35000, "1-smena (09:00 - 19:00)"),
        ("Sherzod Aliyev", "Menejer", "+998 90 200 00 02", "2002", 28000, "1-smena (09:00 - 19:00)"),
        ("Bobur Mirzayev", "Lider (2-pozitsiya)", "+998 90 300 00 03", "3003", 22000, "1-smena (09:00 - 19:00)"),
        ("Akmal Rahmonov", "Lider (1-pozitsiya)", "+998 90 400 00 04", "4004", 20000, "2-smena (13:00 - 23:00)"),
        ("Rustam Ergashev", "Universal", "+998 90 500 00 05", "5005", 18000, "1-smena (09:00 - 19:00)"),
        ("Farrux Norboyev", "Universal", "+998 90 500 00 06", "5006", 18000, "2-smena (13:00 - 23:00)"),
        ("Sardor Qosimov", "Povur (Oshpaz)", "+998 90 600 00 07", "6007", 17000, "1-smena (09:00 - 19:00)"),
        ("Mirzohid Usmonov", "Povur (Oshpaz)", "+998 90 600 00 08", "6008", 17000, "2-smena (13:00 - 23:00)"),
        ("Sanjar Karimov", "Stajor", "+998 90 700 00 09", "7009", 15000, "1-smena (09:00 - 19:00)"),
        ("Dilshod Vohidov", "Stajor", "+998 90 700 00 10", "7010", 15000, "2-smena (13:00 - 23:00)"),
        ("Zulfiya opa Karimova", "Tozalik xodimasi", "+998 90 800 00 11", "8011", 15000, "1-smena (09:00 - 19:00)"),
    ]

    cursor.executemany(
        "INSERT INTO staff (name, role, phone, pin_code, hourly_rate, shift_preference) VALUES (?, ?, ?, ?, ?, ?)",
        staff_members
    )

    # 2. Attendance history (Past few days + today)
    now = datetime.now()
    yesterday = now - timedelta(days=1)
    two_days_ago = now - timedelta(days=2)

    past_records = [
        # 2 days ago (1-smena: 09:00 - 19:00 = 10 hrs)
        (3, "1-smena", two_days_ago.replace(hour=8, minute=55).strftime('%Y-%m-%d %H:%M:%S'), two_days_ago.replace(hour=19, minute=5).strftime('%Y-%m-%d %H:%M:%S'), 10.1, 0, 0, 0, None),
        (5, "1-smena", two_days_ago.replace(hour=9, minute=0).strftime('%Y-%m-%d %H:%M:%S'), two_days_ago.replace(hour=19, minute=0).strftime('%Y-%m-%d %H:%M:%S'), 10.0, 0, 0, 0, None),
        (7, "1-smena", two_days_ago.replace(hour=9, minute=25).strftime('%Y-%m-%d %H:%M:%S'), two_days_ago.replace(hour=19, minute=10).strftime('%Y-%m-%d %H:%M:%S'), 9.75, 1, 25, 20000, "25 daqiqa kechikdi"),
        # Yesterday
        (3, "1-smena", yesterday.replace(hour=8, minute=58).strftime('%Y-%m-%d %H:%M:%S'), yesterday.replace(hour=19, minute=0).strftime('%Y-%m-%d %H:%M:%S'), 10.0, 0, 0, 0, None),
        (4, "2-smena", yesterday.replace(hour=12, minute=55).strftime('%Y-%m-%d %H:%M:%S'), yesterday.replace(hour=23, minute=0).strftime('%Y-%m-%d %H:%M:%S'), 10.0, 0, 0, 0, None),
        (8, "2-smena", yesterday.replace(hour=13, minute=0).strftime('%Y-%m-%d %H:%M:%S'), yesterday.replace(hour=23, minute=0).strftime('%Y-%m-%d %H:%M:%S'), 10.0, 0, 0, 0, None),
        # Today - Active currently in 1st shift
        (2, "1-smena", now.replace(hour=8, minute=50).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 0, 0, 0, None),
        (3, "1-smena", now.replace(hour=8, minute=55).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 0, 0, 0, None),
        (5, "1-smena", now.replace(hour=9, minute=0).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 0, 0, 0, None),
        (7, "1-smena", now.replace(hour=9, minute=0).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 0, 0, 0, None),
        (9, "1-smena", now.replace(hour=9, minute=18).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 1, 18, 20000, "18 daqiqa kech keldi (sababsiz)"),
        (11, "1-smena", now.replace(hour=8, minute=45).strftime('%Y-%m-%d %H:%M:%S'), None, 0, 0, 0, 0, None),
    ]

    for sid, sname, cin, cout, th, is_late, late_min, pen, rsn in past_records:
        cursor.execute("""
            INSERT INTO attendance (staff_id, shift_name, clock_in, clock_out, total_hours, is_late, late_minutes, penalty_amount, penalty_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (sid, sname, cin, cout, th, is_late, late_min, pen, rsn))

    # 3. Inventory: Fresh Meats, Vegetables, Sauces, Semi-Finished Products with Expiry Dates
    today_dt = now.date()
    exp_good = (today_dt + timedelta(days=4)).strftime('%Y-%m-%d')
    exp_soon = (today_dt + timedelta(days=1)).strftime('%Y-%m-%d')
    exp_long = (today_dt + timedelta(days=15)).strftime('%Y-%m-%d')

    products = [
        # (Name, Category, Unit, Stock, Min Stock, Unit Price, Expiry, Status)
        ("Mol go'shti (marinovka qilingan)", "Go'sht mahsulotlari", "kg", 32.0, 12.0, 115000, exp_good, "yaroqli"),
        ("Tovuq filesi (chala pishirilgan)", "Yarim tayyor issiq mahsulotlar", "kg", 18.5, 10.0, 58000, exp_soon, "muddati_yaqin"),
        ("Kotletlar (yarim tayyor yarim pishgan)", "Yarim tayyor issiq mahsulotlar", "dona", 85.0, 30.0, 9000, exp_good, "yaroqli"),
        ("Maxsus Shokh Qizil Sous", "Souslar va ziravorlar", "litr", 14.0, 5.0, 32000, exp_good, "yaroqli"),
        ("Oq sarimsoqli sous (Tatsiki usulida)", "Souslar va ziravorlar", "litr", 4.5, 6.0, 28000, exp_soon, "muddati_yaqin"), # Kam qolgan va muddati yaqin
        ("Barbekyu (BBQ) sous", "Souslar va ziravorlar", "litr", 8.0, 3.0, 42000, exp_long, "yaroqli"),
        ("Pomidor (yangi)", "Sabzavotlar", "kg", 5.0, 10.0, 24000, exp_soon, "muddati_yaqin"), # Kam qolgan
        ("Bodring (yangi)", "Sabzavotlar", "kg", 15.0, 8.0, 18000, exp_good, "yaroqli"),
        ("Aysberg salat bargi", "Sabzavotlar", "kg", 3.0, 6.0, 35000, exp_soon, "muddati_yaqin"), # Kam qolgan
        ("Piyoz (tozalangan, to'g'ralgan)", "Sabzavotlar", "kg", 25.0, 10.0, 6000, exp_good, "yaroqli"),
        ("Pishloq (Mozzarella)", "Yarim tayyor issiq mahsulotlar", "kg", 12.0, 5.0, 85000, exp_good, "yaroqli"),
        ("O'simlik yog'i (fityur uchun)", "Souslar va ziravorlar", "litr", 40.0, 15.0, 21000, exp_long, "yaroqli"),
    ]

    cursor.executemany("""
        INSERT INTO inventory (name, category, unit, current_stock, min_stock, unit_price, expiry_date, freshness_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, products)

    # 4. Menu Items (Yarim tayyor issiq taomlar va souslar)
    menu = [
        ("Shokh Maxsus Issiq Tovuq To'plami", "Yarim tayyor issiq ovqatlar", 55000, 12, "Tovuq filesi + Shokh sous + sabzavotlar garniri"),
        ("Issiq Go'shtli Kotlet (Sous bilan)", "Yarim tayyor issiq ovqatlar", 48000, 15, "2 dona yarim tayyor kotlet qovuriladi + BBQ sous"),
        ("Chala tayyor marinadlangan steyk", "Yarim tayyor issiq ovqatlar", 85000, 18, "Mol go'shti 250g maxsus o'tlar bilan"),
        ("Shokh Qizil Sous (Porsiya)", "Souslar", 8000, 2, "Maxsus tomat, achchiq qalampir va sarimsoq"),
        ("Sarimsoqli Oq Sous (Porsiya)", "Souslar", 8000, 2, "Qatiq, sarimsoq, ko'katlar"),
        ("Qovurilgan garnir kartoshka", "Garnirlar", 18000, 8, "Yarim tayyor kartoshka fityurda"),
    ]
    cursor.executemany("""
        INSERT INTO menu_items (name, category, price, prep_time_minutes, recipe_notes)
        VALUES (?, ?, ?, ?, ?)
    """, menu)

    # 5. Equipment & Assets (Jihozlar va Inventarlar)
    equipment = [
        ("Katta gazli fityur (2 bo'lmali)", "Oshxona texnikasi", "yaroqli", "Issiq oshxona", today_dt.strftime('%Y-%m-%d'), "Har kuni tozalanadi, soz"),
        ("Konveksion pech (RATIONAL)", "Oshxona texnikasi", "yaroqli", "Pech zonasi", today_dt.strftime('%Y-%m-%d'), "Harorat datchigi me'yorda"),
        ("Muzlatkich kamera (-18°C)", "Sovutish uskunalari", "yaroqli", "Go'sht ombori", today_dt.strftime('%Y-%m-%d'), "Harorat stabil -18.2°C"),
        ("Salat va souslar sovutgichi (+4°C)", "Sovutish uskunalari", "tamir_talab", "Tarqatish peshtaxtasi", today_dt.strftime('%Y-%m-%d'), "Eshik rezinkasi biroz bo'shagan, sovutish yaxshi"),
        ("Go'sht qiymalagich (Sanoatbop)", "Oshxona texnikasi", "yaroqli", "Tayyorlov xonasi", today_dt.strftime('%Y-%m-%d'), "Pichoqlari o'tkirlangan"),
        ("Oshxona professional pichoqlar to'plami", "Idish-tovoqlar", "yaroqli", "Oshpazlar stoli", today_dt.strftime('%Y-%m-%d'), "10 ta pichoq to'liq joyida"),
        ("Idish yuvish mashinasi (Tunnel)", "Oshxona texnikasi", "yaroqli", "Idishxona", today_dt.strftime('%Y-%m-%d'), "Tozalik rejimida ishlayapti"),
    ]
    cursor.executemany("""
        INSERT INTO equipment (name, category, condition, location, last_inspected, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, equipment)

    # Initial transactions
    transactions = [
        (1, 'kirim', 40.0, 115000, 4600000, "Go'sht yetkazib beruvchidan yangi partiya"),
        (1, 'chiqim', 8.0, 115000, 920000, "Bugungi 1-smena yarim tayyor taomlariga sarf"),
        (4, 'kirim', 20.0, 32000, 640000, "Shokh qizil sous tayyorlandi"),
        (4, 'chiqim', 6.0, 32000, 192000, "Zalga va porsiyalarga tarqatildi"),
        (7, 'chiqim', 5.0, 24000, 120000, "Salatlar uchun sarflandi"),
    ]
    cursor.executemany("""
        INSERT INTO inventory_transactions (product_id, type, quantity, unit_price, total_cost, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    """, transactions)

    # Settings
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('restaurant_name', 'Shokh Restaurant')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('opening_hours', '10:00 - 23:00')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('shift_1', '09:00 - 19:00')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('shift_2', '13:00 - 23:00')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('penalty_min', '20000')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('penalty_max', '200000')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', 'shokh2006')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_bot_token', '')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', '')")
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_username', '@shokh0502')")

    conn.commit()

if __name__ == "__main__":
    init_db(recreate=True)
    print("Shokh Restaurant database initialized successfully at:", DB_PATH)
